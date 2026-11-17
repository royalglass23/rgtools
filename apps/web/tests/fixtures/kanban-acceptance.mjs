// Secret-free, localhost-only ServiceM8/OpenAI boundary for dashboard acceptance.
// It never forwards requests. Existing tmp/rg406 control files remain compatible.
import http from 'node:http'
import path from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
const controls = path.resolve('tmp/rg406')
const jobId = '40600000-0000-4000-8000-000000000010'
const observed = new Date().toISOString()
const metrics = { gets: 0, writes: 0, aiCalls: 0 }
const file = name => path.join(controls, name)
const read = (name, fallback = '') => existsSync(file(name)) ? readFileSync(file(name), 'utf8').trim() : fallback
const iso = days => new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + days * 86400000))
const day = value => `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`
const facts = () => [
  ['siteReady', 'yes', 'Shower site is ready.'], ['glassReady', 'yes', 'Shower glass is ready.'], ['hardwareReady', 'unknown', `Shower hardware expected on ${day(iso(3))}.`, iso(3), 'expected'],
  ['designConfirmed', 'yes', 'Shower design is confirmed.'], ['ps1Required', 'yes', 'Shower PS1 is required.'], ['ps3Required', 'no', 'Shower PS3 is not required.'], ['ps1Issued', 'no', 'Shower PS1 has not been issued.'], ['ps3Issued', 'yes', 'Shower PS3 was issued.'], ['bottleStrut', 'no', 'Shower bottle strut is not required.'],
  ['buildingConsent', 'approved', 'Shower building consent is approved.'], ['buildingConsentNumber', 'BCO1234567', 'Shower building consent number BCO1234567.'], ['minorVariationRequired', 'no', 'Shower minor variation is not required.'], ['clientWaitingFor', 'glass arrival', 'Shower client is waiting for glass arrival.'], ['materialsEta', iso(3), `Shower materials ETA is ${day(iso(3))}.`], ['aftercare', 'na', 'Shower aftercare is not applicable.'], ['installerId', 'i0', 'Shower installer is i0.'], ['estimatedHours', '2.5', 'Shower estimated labour is 2.5 hours.'],
]
const unknown = () => ({ status: 'unknown', value: null, date: null, datePurpose: null, scope: 'unclear', productCue: null, reason: 'No explicit synthetic evidence.', evidence: [] })
function proposal(context) {
  return Object.fromEntries(context.items.map(item => {
    const shower = /shower/i.test(item.text)
    const dateSource = context.sources.find(source => /\b(?:install|installation)\b/i.test(source.text) && /shower/i.test(source.text) && (source.kind === 'note' || source.kind === 'email'))
    const date = read('assessment-date.txt', dateSource?.text.match(/20\d{2}-\d{2}-\d{2}/)?.[0] ?? (dateSource ? iso(4) : ''))
    const fields = Object.fromEntries(facts().map(([field, value, quote, readyDate = null, datePurpose = null]) => {
      const source = context.sources.find(source => source.text.includes(quote))
      return [field, shower && source ? { status: 'assessed', value, date: readyDate, datePurpose, scope: 'product', productCue: 'shower', reason: 'Explicit synthetic product fact.', evidence: [{ source: source.token, quote }] } : unknown()]
    }))
    return [item.token, shower && dateSource && date ? { status: 'dated', date, kind: 'installation', scope: 'product', productCue: 'shower', reason: 'Synthetic installation evidence.', evidence: [{ source: dateSource.token, quote: dateSource.text }], fields } : { status: 'unknown', date: null, kind: 'unknown', scope: 'unclear', productCue: null, reason: 'No synthetic planning date.', evidence: [], fields }]
  }))
}
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:55442')
  const send = (data, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)) }
  if (url.pathname === '/__metrics' && req.method === 'GET') return send(metrics)
  if (url.pathname === '/v1/responses' && req.method === 'POST') {
    metrics.aiCalls++
    if (existsSync(file('assessment-fail'))) return send({}, 503)
    try {
      let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 2_000_000) return send({}, 413) }
      const context = JSON.parse(JSON.parse(body).input)
      return send({ output_text: JSON.stringify({ results: proposal(context) }) })
    } catch { return send({}, 400) }
  }
  if (req.method !== 'GET') { metrics.writes++; return send({}, 405) }
  metrics.gets++
  if (existsSync(file('source-fail')) && /\/job(?:\/|\.json)/.test(url.pathname)) return send({}, 403)
  const job = { uuid: jobId, active: 1, status: 'Work Order', generated_job_id: 'TEST406', company_uuid: '40600000-0000-4000-8000-000000000040', job_address: 'Test site', job_description: 'Synthetic fixture only', edit_date: '2026-11-18 08:00:00' }
  if (url.pathname.endsWith(`/job/${jobId}.json`)) return send(job)
  const note = read('assessment-note.txt', existsSync(file('assessment-email.txt')) ? '' : `Install the shower on ${iso(4)}.`)
  const operational = existsSync(file('assessment-note.txt')) || existsSync(file('assessment-email.txt')) ? read('assessment-operational.txt') : facts().map(([, , quote]) => quote.replace('i0', 'Fixture installer')).join('\n')
  const collections = {
    vendor: [{ name: 'Royal Glass' }], job: [job], company: [{ uuid: job.company_uuid, name: 'Fixture customer' }], staff: [], jobactivity: [],
    jobmaterial: ['20', '21'].map((suffix, i) => ({ uuid: `40600000-0000-4000-8000-0000000000${suffix}`, job_uuid: jobId, active: 1, quantity: '1', price: '100', name: i ? 'Balustrade' : 'Shower', sort_order: i })), material: [],
    note: [...(note ? [{ uuid: 'synthetic-planning-note', related_object_uuid: jobId, active: 1, create_date: observed, note }] : []), ...(operational ? [{ uuid: 'synthetic-operational-note', related_object_uuid: jobId, active: 1, create_date: observed, note: operational }] : [])],
    email: read('assessment-email.txt') ? [{ uuid: 'synthetic-email', related_object_uuid: jobId, active: 1, create_date: observed, subject: 'Installation planning', message_text: read('assessment-email.txt') }] : [],
  }
  const kind = url.pathname.split('/').at(-1)?.replace('.json', '')
  return Object.hasOwn(collections, kind) ? send(collections[kind]) : send({}, 404)
}).listen(55442, '127.0.0.1', () => process.stdout.write('Synthetic dashboard source/provider ready on 127.0.0.1:55442\n'))
