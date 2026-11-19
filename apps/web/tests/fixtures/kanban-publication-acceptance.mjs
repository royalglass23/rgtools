// Synthetic, exact-loopback-only fixture. Never use a shared database.
import { execFileSync, spawn } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { createServer as createSecureServer } from 'node:https'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const web = path.join(root, 'apps/web'), evidence = path.join(root, 'tmp/rg408-production-e2e')
const configFile = path.join(evidence, 'fixture.json')
const database = 'rg408_production_e2e'
const databaseUrl = 'postgresql://rg408@127.0.0.1:55442/rg408_production_e2e?sslmode=disable'
const baseUrl = 'http://127.0.0.1:3058'
const production = process.env.RG408_E2E_PRODUCTION === '1'
const adapterUrl = `${production ? 'https' : 'http'}://127.0.0.1:3059`
const psql = process.env.RG408_PSQL ?? 'C:/Program Files/PostgreSQL/18/bin/psql.exe'
const literal = value => `'${String(value).replaceAll("'", "''")}'`
// Exclude inherited connection credentials, NODE_OPTIONS and application .env.
const environment = Object.fromEntries(['SystemRoot', 'WINDIR', 'ComSpec', 'PATH', 'PATHEXT', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA'].filter(key => process.env[key]).map(key => [key, process.env[key]]))
function query(statement, target = database) {
  if (![database, 'postgres'].includes(target)) throw new Error('Database not allowlisted')
  return execFileSync(psql, ['-X', '-w', '-h', '127.0.0.1', '-p', '55442', '-U', 'rg408', '-d', target, '-v', 'ON_ERROR_STOP=1', '-A', '-t'], { input: statement, encoding: 'utf8', env: environment }).trim()
}
function assertUrl() {
  if ((process.env.E2E_DATABASE_URL ?? databaseUrl) !== databaseUrl) throw new Error('Exact local database URL required')
}
function guard(config) {
  assertUrl()
  if (!/^[a-f0-9]{64}$/.test(config.sentinel)) throw new Error('Invalid sentinel')
  const proof = query(`SELECT current_database() || '|' || host(inet_server_addr()) || '|' || inet_server_port() || '|' || sentinel FROM rgtools_e2e.database_sentinel WHERE id=1;`)
  if (proof !== `${database}|127.0.0.1|55442|${config.sentinel}`) throw new Error('Refusing mutation: local identity/sentinel mismatch')
  return `DO $$ BEGIN IF current_database() <> '${database}' OR inet_server_addr() <> '127.0.0.1'::inet OR inet_server_port() <> 55442 OR (SELECT sentinel FROM rgtools_e2e.database_sentinel WHERE id=1) IS DISTINCT FROM '${config.sentinel}' THEN RAISE EXCEPTION 'Unsafe fixture database'; END IF; END $$;\n`
}
async function prepare() {
  assertUrl()
  if (query("SELECT current_user || '|' || host(inet_server_addr()) || '|' || inet_server_port();", 'postgres') !== 'rg408|127.0.0.1|55442') throw new Error('Unexpected fixture server')
  mkdirSync(evidence, { recursive: true })
  const existing = query(`SELECT datname FROM pg_database WHERE datname='${database}';`, 'postgres')
  let config
  if (existing) {
    if (!existsSync(configFile)) throw new Error('Existing database lacks owned sentinel file; refusing setup')
    config = JSON.parse(readFileSync(configFile, 'utf8')); guard(config)
  } else {
    config = { databaseUrl, baseUrl, sentinel: randomBytes(32).toString('hex'), password: randomBytes(24).toString('hex'), publishSecret: randomBytes(32).toString('hex'), authSecret: randomBytes(32).toString('hex'), staffId: randomUUID(), roxyId: randomUUID(), adminId: randomUUID() }
    writeFileSync(configFile, JSON.stringify(config, null, 2))
    // Bootstrap ONLY an absent, exactly named database on the verified loopback server.
    query(`CREATE DATABASE ${database};`, 'postgres')
    query(`DO $$ BEGIN IF current_database() <> '${database}' OR inet_server_addr() <> '127.0.0.1'::inet OR inet_server_port() <> 55442 THEN RAISE EXCEPTION 'Unsafe fixture bootstrap'; END IF; END $$;
      CREATE SCHEMA rgtools_e2e;
      CREATE TABLE rgtools_e2e.database_sentinel(id integer PRIMARY KEY CHECK(id=1), sentinel text NOT NULL);
      INSERT INTO rgtools_e2e.database_sentinel VALUES(1, '${config.sentinel}');
      CREATE TABLE rgtools_e2e.applied_migrations(tag text PRIMARY KEY);`)
  }
  const entries = JSON.parse(readFileSync(path.join(root, 'drizzle/migrations/meta/_journal.json'), 'utf8')).entries
  if (entries.length !== 74 || entries.some((entry, index) => entry.idx !== index) || !entries.at(-1).tag.startsWith('0073_')) throw new Error('Requires production-main migrations 0 through 73 only')
  const applied = new Set(query('SELECT tag FROM rgtools_e2e.applied_migrations;').split(/\r?\n/))
  for (const entry of entries) {
    if (!applied.has(entry.tag)) query(`${guard(config)}BEGIN;\n${readFileSync(path.join(root, 'drizzle/migrations', `${entry.tag}.sql`), 'utf8')}\nINSERT INTO rgtools_e2e.applied_migrations VALUES(${literal(entry.tag)});\nCOMMIT;`)
  }
  const require = createRequire(path.join(web, 'package.json'))
  const hash = await require('bcryptjs').hash(config.password, 10)
  query(`${guard(config)}BEGIN;
    INSERT INTO users(id, username, password_hash, role) VALUES
      ('${config.staffId}', 'rg408-staff', ${literal(hash)}, 'staff'),
      ('${config.roxyId}', 'rg408-roxy', ${literal(hash)}, 'staff'),
      ('${config.adminId}', 'rg408-admin', ${literal(hash)}, 'admin')
      ON CONFLICT(id) DO UPDATE SET password_hash=excluded.password_hash;
    INSERT INTO modules(slug,name,is_active) VALUES('quote-tracker','Fictional Quote Tracker',true) ON CONFLICT(slug) DO UPDATE SET is_active=true;
    INSERT INTO settings(key,value) VALUES('dashboard_tables','[]') ON CONFLICT(key) DO UPDATE SET value=excluded.value;
    COMMIT;`)
  console.log('Prepared verified loopback fixture: 74 main migrations and fictional users.')
  return config
}
async function run() {
  const config = await prepare(), metrics = { reads: 0, writes: 0, aiCalls: 0 }
  const handle = (request, response) => {
    response.setHeader('Content-Type', 'application/json')
    if (request.url === '/__metrics' && request.method === 'GET') return response.end(JSON.stringify(metrics))
    if (request.url?.startsWith('/api_1.0/') && request.method === 'GET') { metrics.reads++; return response.end('[]') }
    if (request.url?.startsWith('/ai')) metrics.aiCalls++
    else metrics.writes++
    response.statusCode = 405; response.end('{"error":"Fixture forbids source writes and AI calls"}')
  }
  const cert = path.join(evidence, 'loopback-cert.pem'), key = path.join(evidence, 'loopback-key.pem')
  if (production) {
    // Fictional fixture certificate only; no machine/global trust changes.
    execFileSync('C:/Program Files/Git/usr/bin/openssl.exe', ['req', '-x509', '-nodes', '-newkey', 'rsa:2048', '-days', '2', '-keyout', key, '-out', cert, '-subj', '/CN=RG408 fictional loopback fixture', '-addext', 'subjectAltName=IP:127.0.0.1'], { env: { ...environment, OPENSSL_CONF: 'C:/Program Files/Git/usr/ssl/openssl.cnf' }, stdio: 'pipe' })
  }
  const adapter = production ? createSecureServer({ key: readFileSync(key), cert: readFileSync(cert) }, handle) : createServer(handle)
  await new Promise((resolve, reject) => { adapter.once('error', reject); adapter.listen(3059, '127.0.0.1', resolve) })
  const env = { ...environment, __NEXT_PROCESSED_ENV: 'true', NODE_ENV: production ? 'production' : 'development', ...(production ? { NODE_EXTRA_CA_CERTS: cert } : {}), NEXT_TELEMETRY_DISABLED: '1', WS_NO_BUFFER_UTIL: '1', WS_NO_UTF_8_VALIDATE: '1', DATABASE_URL: databaseUrl, DATABASE_WS_PROXY: '127.0.0.1:55443', AUTH_SECRET: config.authSecret, AUTH_URL: baseUrl, AUTH_TRUST_HOST: 'true', ROXY_DASHBOARD_USER_ID: config.roxyId, KANBAN_PUBLISH_SECRET: config.publishSecret, SERVICEM8_API_BASE_URL: `${adapterUrl}/api_1.0`, SERVICEM8_API_KEY: 'fictional-local-only', OPENAI_RESPONSES_URL: `${adapterUrl}/ai`, OPENAI_API_KEY: 'fictional-local-only' }
  const log = openSync(path.join(evidence, 'next.log'), 'w'); let app
  try {
    app = spawn(process.execPath, ['node_modules/next/dist/bin/next', ...(production ? ['start'] : ['dev', '--webpack']), '--hostname', '127.0.0.1', '--port', '3058'], { cwd: web, env, stdio: ['ignore', log, log], windowsHide: true })
    let ready = false
    for (let attempt = 0; attempt < 180; attempt++) {
      if (app.exitCode !== null) throw new Error(`Next exited ${app.exitCode}; inspect ignored next.log`)
      try { const response = await fetch(`${baseUrl}/login`, { signal: AbortSignal.timeout(1500) }); if (response.ok) { ready = true; break } } catch {}
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    if (!ready) throw new Error('Fixture Next did not become ready')
    const exitCode = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', 'tests/e2e/dashboard-work-orders.spec.ts', '--project=chromium', '--workers=1', '--reporter=list,json'], { cwd: web, env: { ...env, E2E_BASE_URL: baseUrl, RG408_PUBLICATION_E2E_URL: baseUrl, RG408_ADAPTER_URL: adapterUrl, RG408_FIXTURE_FILE: configFile, RG408_PSQL: psql, E2E_DATABASE_SENTINEL: config.sentinel, PLAYWRIGHT_JSON_OUTPUT_NAME: path.join(evidence, 'playwright.json') }, stdio: 'inherit', windowsHide: true })
      child.once('error', reject); child.once('exit', resolve)
    })
    if (exitCode !== 0) throw new Error(`Playwright exited ${exitCode}`)
  } finally {
    if (app && app.exitCode === null) {
      if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore', env: environment })
      else app.kill('SIGTERM')
    }
    closeSync(log); await new Promise(resolve => adapter.close(resolve))
    writeFileSync(path.join(evidence, 'source-metrics.json'), JSON.stringify(metrics, null, 2))
  }
}
if (process.argv[2] === 'prepare') await prepare()
else if (process.argv[2] === 'run') await run()
else throw new Error('Usage: node apps/web/tests/fixtures/kanban-publication-acceptance.mjs prepare|run')
