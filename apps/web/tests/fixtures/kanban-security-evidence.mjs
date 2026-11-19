// Repository-owned strict evidence contract, version 1. No machine-installed validator dependency.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync, lstatSync, realpathSync, statSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const out = path.join(root, 'tmp/rg408-production-e2e')
const inputPaths = [
  'apps/web/tests/fixtures/kanban-publication-acceptance.mjs',
  'apps/web/tests/fixtures/kanban-security.config.cjs',
  'apps/web/tests/fixtures/kanban-security-evidence.mjs',
  'apps/web/tests/fixtures/kanban-pg-bridge.mjs',
  'apps/web/tests/fixtures/kanban-security-matrix.json',
  'apps/web/tests/e2e/dashboard-work-orders.spec.ts',
  'apps/web/tests/e2e/kanban-security.spec.js',
  'apps/web/package.json', 'apps/catalog/package.json', 'packages/db/package.json',
  'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.github/workflows/kanban-security.yml',
]
const hash = value => createHash('sha256').update(value).digest('hex')
const json = file => JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const inputs = () => inputPaths.map(file => ({ path: file, sha256: hash(readFileSync(path.join(root, file))) }))
const revision = () => ({ commit: git(['rev-parse', 'HEAD']), tree: git(['rev-parse', 'HEAD^{tree}']), clean: !git(['status', '--porcelain', '--untracked-files=normal']) })
// Every deletion is a fixed allowlisted child of this real, non-symlinked ignored directory.
function ownedOutput() {
  const realRoot = realpathSync(root), tmp = path.join(realRoot, 'tmp'), target = path.join(tmp, 'rg408-production-e2e')
  for (const directory of [tmp, target]) {
    if (existsSync(directory)) {
      if (lstatSync(directory).isSymbolicLink() || !lstatSync(directory).isDirectory() || realpathSync(directory) !== directory) throw new Error('Unsafe evidence output directory')
    } else mkdirSync(directory)
  }
  if (path.relative(realRoot, target) !== path.join('tmp', 'rg408-production-e2e')) throw new Error('Evidence directory escaped workspace')
  return target
}
function invalidate(names) {
  const directory = ownedOutput()
  const allowed = new Set(['build-provenance.json', 'playwright.json', 'html', 'test-results', 'input-manifest.json', 'run-start.json', 'run-completion.json', 'source-metrics.json', 'e2e-results.json'])
  for (const name of names) {
    const target = path.resolve(directory, name)
    if (!allowed.has(name) || path.dirname(target) !== directory || (existsSync(target) && lstatSync(target).isSymbolicLink())) throw new Error('Unsafe evidence invalidation target')
    rmSync(target, { recursive: name === 'html' || name === 'test-results', force: true })
  }
}
function sourceInputs() {
  const tracked = git(['ls-files', '-z']).split('\0').filter(file => /^(apps\/web\/|packages\/db\/|drizzle\/migrations\/)/.test(file))
  return [...new Set([...tracked, ...inputPaths])].sort().map(file => ({ path: file, sha256: hash(readFileSync(path.join(root, file))) }))
}
const candidateTree = () => {
  const value = process.env.RG408_CANDIDATE_TREE ?? null
  if (value !== null && !/^[a-f0-9]{40}$/i.test(value)) throw new Error('Invalid candidate tree pin')
  return value
}
function currentBuildIdentity() {
  const files = sourceInputs()
  return { ...revision(), candidateTree: candidateTree(), sourceHash: hash(JSON.stringify(files)), files }
}
export function beginBuild() {
  invalidate(['build-provenance.json'])
  const record = { version: 1, buildRunId: randomUUID(), at: new Date().toISOString(), ...currentBuildIdentity() }
  writeFileSync(path.join(out, 'build-start.json'), JSON.stringify(record, null, 2))
  return record
}
export function completeBuild(start) {
  const current = currentBuildIdentity(), buildFile = path.join(root, 'apps/web/.next/BUILD_ID')
  if (current.commit !== start.commit || current.tree !== start.tree || current.sourceHash !== start.sourceHash || current.candidateTree !== start.candidateTree || statSync(buildFile).mtimeMs < Date.parse(start.at)) throw new Error('Build inputs drifted or BUILD_ID was not freshly generated')
  const record = { ...start, completedAt: new Date().toISOString(), buildId: readFileSync(buildFile, 'utf8').trim() }
  writeFileSync(path.join(out, 'build-provenance.json'), JSON.stringify(record, null, 2))
  return record
}
export function beginSecurityRun() {
  // Remove old success channels before prepare/startup can fail; fixture credentials and audit remain.
  invalidate(['playwright.json', 'html', 'test-results', 'input-manifest.json', 'run-start.json', 'run-completion.json', 'source-metrics.json', 'e2e-results.json'])
  const record = { version: 1, runId: randomUUID(), at: new Date().toISOString() }
  writeFileSync(path.join(out, 'run-start.json'), JSON.stringify(record, null, 2))
  return record
}
export function evaluateRunBinding({ current, build, buildId, run, manifest, completion, hashes, reportStart }) {
  const errors = []
  if (!build || build.commit !== current.commit || build.tree !== current.tree || build.sourceHash !== current.sourceHash || build.buildId !== buildId || !build.completedAt || build.candidateTree !== current.candidateTree) errors.push('Stale or mismatched build provenance')
  if (!run?.runId || manifest?.runId !== run.runId || !completion || completion.runId !== run.runId || completion.exitCode !== 0) errors.push('Missing successful same-run completion')
  if (!completion || completion.reportHash !== hashes.reportHash || completion.htmlHash !== hashes.htmlHash || completion.metricsHash !== hashes.metricsHash || completion.manifestHash !== hashes.manifestHash || completion.runHash !== hashes.runHash || completion.buildHash !== hashes.buildHash || manifest?.buildHash !== hashes.buildHash) errors.push('Prior or altered report/build/run artifacts')
  if (!Number.isFinite(Date.parse(reportStart)) || Date.parse(reportStart) < Date.parse(run?.at) || !Number.isFinite(Date.parse(completion?.at)) || Date.parse(reportStart) > Date.parse(completion?.at)) errors.push('Report does not belong to the current completed run')
  return errors
}
function checkedBuild() {
  const current = currentBuildIdentity(), build = json(path.join(out, 'build-provenance.json')), buildId = readFileSync(path.join(root, 'apps/web/.next/BUILD_ID'), 'utf8').trim()
  if (build.commit !== current.commit || build.tree !== current.tree || build.sourceHash !== current.sourceHash || build.candidateTree !== current.candidateTree || build.buildId !== buildId || !build.completedAt) throw new Error('Fresh matching helper build required before security run')
  return { current, build, buildId, buildHash: hash(readFileSync(path.join(out, 'build-provenance.json'))) }
}
export function captureInputs({ optimized, adapterUrl, run }) {
  const { current, buildId, buildHash } = checkedBuild(), files = inputs()
  if (json(path.join(out, 'run-start.json')).runId !== run.runId) throw new Error('Security run identity drifted')
  const environment = { name: 'isolated-fictional-optimized-next', baseUrl: 'http://127.0.0.1:3058', production: false, optimized, adapterUrl, database: '127.0.0.1:55442/rg408_production_e2e', wsProxy: '127.0.0.1:55443', isolationVerified: true, node: process.version, platform: process.platform, buildId }
  writeFileSync(path.join(out, 'input-manifest.json'), JSON.stringify({ version: 1, at: new Date().toISOString(), commit: current.commit, tree: current.tree, clean: current.clean, candidateTree: current.candidateTree, sourceHash: current.sourceHash, runId: run.runId, buildHash, files, environment }, null, 2))
}
export function completeSecurityRun(run) {
  const { current, build, buildId, buildHash } = checkedBuild()
  const manifest = json(path.join(out, 'input-manifest.json')), report = json(path.join(out, 'playwright.json')), matrix = json(path.join(root, 'apps/web/tests/fixtures/kanban-security-matrix.json'))
  if (evaluateReport(report, matrix).errors.length) throw new Error('Security run did not pass the complete zero-retry lane')
  const hashes = { reportHash: hash(readFileSync(path.join(out, 'playwright.json'))), htmlHash: hash(readFileSync(path.join(out, 'html/index.html'))), metricsHash: hash(readFileSync(path.join(out, 'source-metrics.json'))), manifestHash: hash(readFileSync(path.join(out, 'input-manifest.json'))), runHash: hash(readFileSync(path.join(out, 'run-start.json'))), buildHash }
  const completion = { version: 1, runId: run.runId, at: new Date().toISOString(), exitCode: 0, ...hashes }
  const errors = evaluateRunBinding({ current, build, buildId, run, manifest, completion, hashes, reportStart: report.stats?.startTime })
  if (errors.length) throw new Error(errors.join('; '))
  writeFileSync(path.join(out, 'run-completion.json'), JSON.stringify(completion, null, 2))
}
export function evaluateReport(report, matrix) {
  const tests = []
  function collect(suites) {
    for (const suite of suites ?? []) {
      for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) tests.push({ title: spec.title, file: spec.file, project: test.projectName, status: test.status, results: test.results.map(result => ({ status: result.status, retry: result.retry })) })
      collect(suite.suites)
    }
  }
  collect(report.suites)
  const passed = test => test.status === 'expected' && test.results.length === 1 && test.results[0].status === 'passed' && test.results[0].retry === 0
  const counts = { total: tests.length, passed: tests.filter(passed).length, failed: tests.filter(test => test.status === 'unexpected').length, skipped: tests.filter(test => test.status === 'skipped').length, flaky: tests.filter(test => test.status === 'flaky').length }
  const unmet = matrix.rows.filter(row => !row.tests.every(pattern => tests.some(test => test.title.includes(pattern) && passed(test)))).map(row => row.id)
  const errors = []
  if (tests.length !== matrix.expectedTests || new Set(tests.map(test => test.file + ':' + test.title)).size !== tests.length) errors.push('Incorrect or duplicate test discovery')
  if (counts.passed !== matrix.expectedTests || counts.failed || counts.skipped || counts.flaky) errors.push('Strict lane requires every test to pass once without retry/skip/flakiness')
  if (tests.some(test => test.project !== 'chromium')) errors.push('Unexpected browser project')
  if (report.config?.workers !== 1 || report.config?.projects?.some(project => project.retries !== 0)) errors.push('Strict config requires one worker and zero retries')
  if (unmet.length || matrix.rows.length !== 14) errors.push('Required matrix coverage incomplete')
  return { tests, counts, coverage: { required: matrix.rows.length, covered: matrix.rows.length - unmet.length, unmet }, errors }
}
export function evaluateAudit(audit) {
  if (!audit.advisories || !audit.metadata?.vulnerabilities) throw new Error('Audit unavailable or malformed; refusing a clean claim')
  const inventory = [], blocking = [], totals = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 }
  for (const [id, advisory] of Object.entries(audit.advisories)) {
    if (!Object.hasOwn(totals, advisory.severity)) throw new Error(`Audit advisory ${id} has an unknown severity`)
    totals[advisory.severity]++
    const paths = advisory.findings?.flatMap(finding => finding.paths ?? []) ?? []
    if (!paths.length) throw new Error(`Audit advisory ${id} lacks dependency paths`)
    const scoped = paths.filter(item => /^(apps__web|packages__db|apps__catalog)(>|$)/.test(item))
    const unknown = paths.some(item => !/^(apps__web|apps__catalog|packages__db|workers__[A-Za-z0-9_-]+)(>|$)/.test(item))
    if (unknown) throw new Error(`Audit advisory ${id} has an unclassified dependency path`)
    const entry = { id, module: advisory.module_name, severity: advisory.severity, title: advisory.title, url: advisory.url, paths, scopedPaths: scoped, disposition: scoped.length ? 'Web/shared runtime dependency path; advisory reachability requires the owner assessment, not inferred from E2E' : 'Outside this web integration charter; worker-only dependency remains inventoried', patchedVersions: advisory.patched_versions ?? 'unknown' }
    inventory.push(entry)
    if (['high', 'critical'].includes(advisory.severity) && (scoped.length || unknown)) blocking.push(entry)
  }
  if (Object.entries(totals).some(([severity, count]) => audit.metadata.vulnerabilities[severity] !== count)) throw new Error('Audit summary/advisory counts disagree')
  return { inventory, blocking, workspaceTotals: audit.metadata.vulnerabilities, scope: ['apps__web', 'apps__catalog', 'packages__db'] }
}
function audit() {
  mkdirSync(out, { recursive: true })
  const args = ['audit', '--prod', '--json']
  let executable = 'pnpm'
  if (process.platform === 'win32') {
    if (!process.env.RG408_PNPM_JS) throw new Error('Windows audit requires RG408_PNPM_JS pointing to the installed pnpm entrypoint')
    executable = process.execPath; args.unshift(process.env.RG408_PNPM_JS)
  }
  const result = spawnSync(executable, args, { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, windowsHide: true })
  writeFileSync(path.join(out, 'audit-prod.json'), result.stdout ?? '')
  writeFileSync(path.join(out, 'audit-prod.stderr.log'), result.stderr ?? '')
  const content = json(path.join(out, 'audit-prod.json'))
  const assessment = evaluateAudit(content)
  if (result.error || ![0, 1].includes(result.status)) throw new Error('Dependency audit did not complete')
  writeFileSync(path.join(out, 'audit-meta.json'), JSON.stringify({ version: 1, ...revision(), at: new Date().toISOString(), command: 'pnpm audit --prod --json', sha256: hash(readFileSync(path.join(out, 'audit-prod.json'))), lockHash: hash(readFileSync(path.join(root, 'pnpm-lock.yaml'))), blocking: assessment.blocking.length, assessment }, null, 2))
  if (assessment.blocking.length) throw new Error(`${assessment.blocking.length} unresolved scoped High/Critical audit findings`)
  console.log(`Audit gate PASS; remaining inventory ${assessment.inventory.length} advisories, full workspace totals retained`)
}
function evidence(write) {
  const current = revision(), manifest = json(path.join(out, 'input-manifest.json')), report = json(path.join(out, 'playwright.json')), matrix = json(path.join(root, 'apps/web/tests/fixtures/kanban-security-matrix.json'))
  const result = evaluateReport(report, matrix), errors = [...result.errors], nowInputs = inputs()
  const run = json(path.join(out, 'run-start.json')), completion = json(path.join(out, 'run-completion.json'))
  const binding = checkedBuild()
  const hashes = { reportHash: hash(readFileSync(path.join(out, 'playwright.json'))), htmlHash: hash(readFileSync(path.join(out, 'html/index.html'))), metricsHash: hash(readFileSync(path.join(out, 'source-metrics.json'))), manifestHash: hash(readFileSync(path.join(out, 'input-manifest.json'))), runHash: hash(readFileSync(path.join(out, 'run-start.json'))), buildHash: binding.buildHash }
  errors.push(...evaluateRunBinding({ ...binding, run, manifest, completion, hashes, reportStart: report.stats?.startTime }))
  if (manifest.commit !== current.commit || manifest.tree !== current.tree || JSON.stringify(manifest.files) !== JSON.stringify(nowInputs)) errors.push('Run inputs or revision drifted')
  if (!manifest.environment.optimized || !manifest.environment.isolationVerified || manifest.environment.baseUrl !== 'http://127.0.0.1:3058' || manifest.environment.adapterUrl !== 'https://127.0.0.1:3059') errors.push('Wrong fixture environment')
  const auditMeta = json(path.join(out, 'audit-meta.json')), rawAudit = readFileSync(path.join(out, 'audit-prod.json')), assessment = evaluateAudit(JSON.parse(rawAudit))
  if (auditMeta.commit !== current.commit || auditMeta.tree !== current.tree || auditMeta.sha256 !== hash(rawAudit) || auditMeta.lockHash !== hash(readFileSync(path.join(root, 'pnpm-lock.yaml'))) || assessment.blocking.length) errors.push('Audit is stale, mismatched or contains scoped High/Critical findings')
  const metrics = json(path.join(out, 'source-metrics.json'))
  if (metrics.writes !== 0 || metrics.aiCalls !== 0) errors.push('Fixture observed a forbidden source write or AI call')
  if (!existsSync(path.join(out, 'html/index.html'))) errors.push('Full HTML report missing')
  const traces = []
  function walk(dir) { if (!existsSync(dir)) return; for (const entry of readdirSync(dir, { withFileTypes: true })) { const name = path.join(dir, entry.name); if (entry.isDirectory()) walk(name); else if (entry.name === 'trace.zip') traces.push(path.relative(out, name).replaceAll('\\', '/')) } }
  walk(path.join(out, 'test-results'))
  const trackedInputs = inputPaths.every(file => { try { git(['ls-files', '--error-unmatch', file]); return true } catch { return false } })
  const committed = current.clean && manifest.clean && auditMeta.clean && binding.build.clean && trackedInputs
  const verdict = errors.length ? 'FAIL' : committed ? 'PASS' : 'BLOCKED'
  const document = { schemaVersion: 1, feature: 'kanban-work-orders', commit: current.commit, tree: current.tree, candidateTree: manifest.candidateTree, runId: run.runId, build: binding.build, completion, command: 'node apps/web/tests/fixtures/kanban-publication-acceptance.mjs security', retries: 0, environment: { ...manifest.environment, fingerprint: 'sha256:' + hash(JSON.stringify(manifest.environment)) }, configHash: 'sha256:' + hash(JSON.stringify(nowInputs.filter(file => file.path.includes('.config.')))), fixtureVersion: 'sha256:' + hash(JSON.stringify(nowInputs.filter(file => !file.path.includes('.config.')))), matrixHash: 'sha256:' + hash(readFileSync(path.join(root, 'apps/web/tests/fixtures/kanban-security-matrix.json'))), projects: ['chromium'], coverage: result.coverage, counts: result.counts, artifacts: { report: 'html/index.html', json: 'playwright.json', inputManifest: 'input-manifest.json', audit: 'audit-prod.json', traces }, verdict, errors, committed, tests: result.tests, audit: assessment, metrics }
  if (write) writeFileSync(path.join(out, 'e2e-results.json'), JSON.stringify(document, null, 2))
  else if (JSON.stringify(json(path.join(out, 'e2e-results.json'))) !== JSON.stringify(document)) throw new Error('Normalized evidence does not match the current raw inputs')
  console.log(JSON.stringify({ verdict, commit: current.commit, counts: result.counts, coverage: result.coverage, errors, committed }))
  if (verdict !== 'PASS') process.exitCode = verdict === 'BLOCKED' ? 2 : 1
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'audit') audit()
  else if (process.argv[2] === 'generate') evidence(true)
  else if (process.argv[2] === 'validate') evidence(false)
  else throw new Error('Usage: node kanban-security-evidence.mjs audit|generate|validate')
}
