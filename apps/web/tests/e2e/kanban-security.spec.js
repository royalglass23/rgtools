import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
const root = path.resolve(__dirname, '../../../..'), webRequire = createRequire(path.join(root, 'apps/web/package.json'))
const { test, expect } = webRequire('@playwright/test')
const enabled = process.env.RG408_SECURITY_E2E === '1' && process.env.RG408_PUBLICATION_E2E_URL === 'http://127.0.0.1:3058' && process.env.E2E_BASE_URL === 'http://127.0.0.1:3058'
const fixture = enabled ? JSON.parse(fs.readFileSync(path.join(root, 'tmp/rg408-production-e2e/fixture.json'), 'utf8')) : {}
const url = 'http://127.0.0.1:3058'
const osEnv = Object.fromEntries(['SystemRoot','WINDIR','PATH','TEMP','TMP'].filter(k => process.env[k]).map(k => [k, process.env[k]]))
let stamp = Date.now()
const guard = `DO $$ BEGIN IF current_database()<>'rg408_production_e2e' OR inet_server_addr()<>'127.0.0.1'::inet OR inet_server_port()<>55442 OR current_user<>'rg408' OR (SELECT sentinel FROM rgtools_e2e.database_sentinel WHERE id=1) IS DISTINCT FROM '${fixture.sentinel}' THEN RAISE EXCEPTION 'Unsafe security fixture'; END IF; END $$;`
function sql(text, mutate = false) {
  if (!enabled || fixture.databaseUrl !== 'postgresql://rg408@127.0.0.1:55442/rg408_production_e2e?sslmode=disable' || fixture.baseUrl !== url || !/^[a-f0-9]{64}$/.test(fixture.sentinel)) throw Error('Unsafe fixture identity')
  return execFileSync(process.env.RG408_PSQL ?? (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin/psql.exe' : 'psql'), ['-X','-w','-h','127.0.0.1','-p','55442','-U','rg408','-d','rg408_production_e2e','-A','-t','-q','-v','ON_ERROR_STOP=1'], { input: `BEGIN${mutate ? '' : ' READ ONLY'}; ${guard}\n${text}\nCOMMIT;`, env: osEnv, encoding: 'utf8' }).trim()
}
function state() { return JSON.parse(sql(`SELECT json_build_object('id',(SELECT value::jsonb->'publication'->>'publicationId' FROM settings WHERE key='kanban.work-orders.latest.v1'),'events',(SELECT count(*) FROM audit_log WHERE entity_type='kanban.work-orders.publication'),'jobs',(SELECT jsonb_array_length(value::jsonb->'publication'->'tables'->'jobs') FROM settings WHERE key='kanban.work-orders.latest.v1'));`)) }
function payload() {
  stamp = Math.max(Date.now(), stamp + 1)
  return { schemaVersion:1, board:'work-orders', complete:true, publicationId:randomUUID(), sourceAsOf:new Date(stamp).toISOString(), generatedAt:new Date(stamp).toISOString(), tables:{ jobs:[{id:'audit-fictional-job', cells:['SEC408','Fictional security customer','Fictional site','TBC','?']}], products:[{id:'audit-fictional-job', cells:['SEC408','Fictional glass','','?','','','','','','','']}]} }
}
const headers = () => ({ Authorization:`Bearer ${fixture.publishSecret}`, 'Content-Type':'application/json' })
const send = (request, body) => request.post('/api/kanban/publish', { headers:headers(), data:JSON.stringify(body) })
async function login(page, username='rg408-staff') {
  await page.goto('/login'); await page.getByLabel('Username', {exact:true}).fill(username); await page.getByLabel('Password',{exact:true}).fill(fixture.password)
  await page.getByRole('button',{name:'Sign in',exact:true}).click(); await expect(page).toHaveURL(url+'/')
}
function noSecrets(text, channel) {
  if ([fixture.publishSecret, fixture.authSecret, fixture.password].some(secret => text.includes(secret))) throw Error(`Secret exposure in ${channel}`)
}
test.describe('RG-408 isolated Kanban security boundaries', () => {
  test.skip(!enabled, 'Requires the exact guarded local security fixture')
  test.describe.configure({ mode: 'default' })

test.beforeAll(() => { expect(sql('SELECT current_database();')).toBe('rg408_production_e2e') })
test.beforeEach(async ({request}) => { expect((await send(request,payload())).status()).toBe(200) })

for (const kind of ['anonymous','forged','expired']) test(`security: ${kind} session cannot read dashboard or privileged routes`, async ({browser}) => {
  const context = await browser.newContext({baseURL:url})
  try {
    if (kind !== 'anonymous') {
      const { encode } = await import(pathToFileURL(webRequire.resolve('next-auth/jwt')).href)
      const cookie='authjs.session-token'
      const token=await encode({token:{sub:fixture.staffId,id:fixture.staffId,role:'staff'},secret:kind==='expired'?fixture.authSecret:'fictional-wrong-key-for-security-probe',salt:cookie,maxAge:kind==='expired'?-120:600})
      await context.addCookies([{name:cookie,value:token,domain:'127.0.0.1',path:'/',httpOnly:true,sameSite:'Lax'}])
    }
    for (const target of ['/dashboard/work-orders?publication='+randomUUID(),'/dashboard/roxy','/admin/dashboard-settings']) {
      const response=await context.request.get(target,{maxRedirects:0})
      expect([302,303,307,308]).toContain(response.status()); noSecrets(await response.text(),'denied response')
    }
  } finally { await context.close() }
})

test('security: deleted account is denied with an otherwise valid existing session', async ({page,request}) => {
  const account=JSON.parse(sql(`INSERT INTO users(id,username,password_hash,role) SELECT gen_random_uuid(),'security-revoked-staff',password_hash,'staff' FROM users WHERE username='rg408-staff' RETURNING json_build_object('id',id);`,true))
  try {
    await login(page,'security-revoked-staff')
    sql("DELETE FROM users WHERE username='security-revoked-staff';",true)
    await page.goto('/dashboard/work-orders'); await expect(page).toHaveURL(/\/login/)
    expect((await request.post('/api/kanban/publish',{data:payload()})).status()).toBe(401)
  } finally { sql("DELETE FROM users WHERE username='security-revoked-staff';",true) }
  expect(account.id).toMatch(/^[a-f0-9-]{36}$/)
})

test('security: staff session cannot publish and callback method/sibling scope stays narrow', async ({page}) => {
  await login(page)
  const before=state(), client=page.context().request
  expect((await client.post('/api/kanban/publish',{data:payload()})).status()).toBe(401)
  expect((await client.get('/api/kanban/publish',{maxRedirects:0})).status()).toBe(405)
  const clean=await webRequire('@playwright/test').request.newContext({baseURL:url})
  try {
    const sibling=await clean.post('/api/kanban/publish-unrelated',{maxRedirects:0})
    expect([302,303,307,308]).toContain(sibling.status()); expect(state()).toEqual(before)
  } finally { await clean.dispose() }
})

test('security: malformed schema encoding and injection-shaped inputs preserve stored state', async ({request}) => {
  const before=state()
  const wrongWidth=payload(); wrongWidth.tables.jobs[0].cells.pop()
  const duplicate=payload(); duplicate.tables.jobs.push(structuredClone(duplicate.tables.jobs[0]))
  const nul=payload(); nul.tables.jobs[0].cells[1]='\0'
  const surrogate=payload(); surrogate.tables.jobs[0].cells[1]='\ud800'
  const long=payload(); long.tables.jobs[0].cells[1]='a'.repeat(16001)
  const pathId=payload(); pathId.tables.jobs[0].id='../admin'
  const cases=[['malformed-json','{',400],['invalid-utf8',Buffer.from([0xc3,0x28]),400],['wrong-board',JSON.stringify({...payload(),board:'../../admin'}),400],['incomplete',JSON.stringify({...payload(),complete:false}),400],['unknown-field',JSON.stringify({...payload(),targetUrl:'https://example.invalid'}),400],['wrong-width',JSON.stringify(wrongWidth),400],['duplicate-id',JSON.stringify(duplicate),400],['nul',JSON.stringify(nul),400],['unpaired-surrogate',JSON.stringify(surrogate),400],['long-cell',JSON.stringify(long),400],['path-like-id',JSON.stringify(pathId),400],['future-time',JSON.stringify({...payload(),generatedAt:new Date(Date.now()+600000).toISOString()}),400]]
  for (const [label,data,status] of cases) await test.step(label,async()=>{ const response=await request.post('/api/kanban/publish',{headers:headers(),data}); expect(response.status()).toBe(status); expect(response.headers()['cache-control']).toBe('no-store'); noSecrets(await response.text(),'validation response'); expect(state()).toEqual(before) })
  const media=await request.post('/api/kanban/publish',{headers:{...headers(),'Content-Type':'text/plain'},data:'{}'}); expect(media.status()).toBe(415); expect(state()).toEqual(before)
})

test('security: declared and chunked oversized bodies return413 without storage changes', async ({request}) => {
  const before=state(), oversized=Buffer.alloc(4*1024*1024+1,32)
  expect((await request.post('/api/kanban/publish',{headers:headers(),data:oversized})).status()).toBe(413)
  const status=await new Promise((resolve,reject)=>{
    const req=http.request(url+'/api/kanban/publish',{method:'POST',headers:{...headers(),'Transfer-Encoding':'chunked'}},response=>{response.resume();response.once('end',()=>resolve(response.statusCode))})
    req.on('error',reject);req.setTimeout(15000,()=>req.destroy(Error('Oversized stream timed out')))
    for(let at=0;at<oversized.length;at+=65536)req.write(oversized.subarray(at,at+65536));req.end()
  })
  expect(status).toBe(413);expect(state()).toEqual(before)
})

test('security: concurrent identical deliveries create exactly one event',async({request})=>{
  const body=payload(), before=state(), results=await Promise.all([send(request,body),send(request,body)])
  expect(results.map(x=>x.status())).toEqual([200,200])
  const acknowledgements=await Promise.all(results.map(x=>x.json()))
  expect(acknowledgements.map(x=>x.duplicate).sort()).toEqual([false,true])
  const after=state();expect(after.id).toBe(body.publicationId);expect(after.events).toBe(before.events+1)
})

test('security: hostile source text stays literal in persisted UI and never executes',async({request,page})=>{
  const body=payload(), hostile='<img src=x onerror="window.__kanbanInjected=true">; DROP TABLE users; --'
  body.tables.jobs[0].cells[1]=hostile;body.tables.products[0].cells[1]=hostile
  expect((await send(request,body)).status()).toBe(200)
  await login(page);await page.goto('/dashboard/work-orders')
  await expect(page.getByRole('cell',{name:hostile,exact:true})).toBeVisible()
  const material=page.getByRole('button',{name:/View material description:/})
  await material.scrollIntoViewIfNeeded(); await page.waitForLoadState('networkidle'); await material.focus(); await material.press('Enter')
  await expect(page.getByRole('dialog')).toContainText(hostile)
  expect(await page.evaluate(()=>Boolean(window.__kanbanInjected))).toBe(false)
  expect(await page.locator('img[src="x"]').count()).toBe(0)
  expect(Number(sql('SELECT count(*) FROM users;'))).toBeGreaterThanOrEqual(3)
})

test('security: foreign-origin server-action replay is rejected',async({page})=>{
  await login(page);await page.goto('/dashboard/work-orders')
  const capture=page.waitForRequest(req=>req.method()==='POST'&&Boolean(req.headers()['next-action']))
  await page.waitForLoadState('networkidle'); await page.getByRole('button',{name:'Request update',exact:true}).focus(); await page.keyboard.press('Enter')
  const action=await capture;await expect(page.getByRole('status')).toContainText('not configured')
  const response=await page.context().request.post(action.url(),{headers:{'Content-Type':action.headers()['content-type'],'Next-Action':action.headers()['next-action'],Origin:'https://untrusted.example.invalid'},data:action.postData()??'',maxRedirects:0})
  expect([400,403,500]).toContain(response.status());noSecrets(await response.text(),'cross-origin response')
})

test('security: secrets stay absent from browser response storage URL and server-log channels',async({page,request})=>{
  await login(page);await page.goto('/dashboard/work-orders')
  noSecrets(await page.content(),'authenticated DOM');noSecrets(page.url(),'URL')
  noSecrets(await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}})),'browser storage')
  const unauth=await request.post('/api/kanban/publish',{data:{}});expect(unauth.status()).toBe(401);noSecrets(await unauth.text(),'unauthenticated response')
  noSecrets(fs.readFileSync(path.join(root,'tmp/rg408-production-e2e/next.log'),'utf8'),'server log')
})

})
