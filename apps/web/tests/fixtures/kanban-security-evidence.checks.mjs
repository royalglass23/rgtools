import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateReport, evaluateAudit, evaluateRunBinding } from './kanban-security-evidence.mjs'
function report() {
  return { config: { workers: 1, projects: [{ retries: 0 }] }, suites: [{ specs: Array.from({ length: 18 }, (_, index) => ({ title: `case ${index}`, file: 'fixture.spec', tests: [{ projectName: 'chromium', status: 'expected', results: [{ status: 'passed', retry: 0 }] }] })) }] }
}
const matrix = { expectedTests: 18, rows: Array.from({ length: 14 }, (_, index) => ({ id: `M${index + 1}`, tests: [`case ${index}`] })) }
const cleanAudit = () => ({ advisories: {}, metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 } } })
test('strict evidence accepts eighteen single-pass tests with all fourteen mapped requirements', () => {
  const result = evaluateReport(report(), matrix)
  assert.deepEqual(result.errors, [])
  assert.equal(result.counts.passed, 18)
  assert.equal(result.coverage.covered, 14)
})
test('retry, skipped and incomplete discovery evidence fails closed', () => {
  const retry = report(); retry.suites[0].specs[0].tests[0].results.push({ status: 'passed', retry: 1 })
  assert.ok(evaluateReport(retry, matrix).errors.length)
  const skipped = report(); skipped.suites[0].specs[0].tests[0].status = 'skipped'
  assert.ok(evaluateReport(skipped, matrix).errors.length)
  const missing = report(); missing.suites[0].specs.pop()
  assert.ok(evaluateReport(missing, matrix).errors.length)
})
test('audit scope keeps worker advisories visible and blocks web/shared High or Critical findings', () => {
  const value = cleanAudit()
  value.advisories.one = { module_name: 'fictional', severity: 'high', findings: [{ paths: ['workers__viewer>fictional'] }] }
  value.metadata.vulnerabilities.high = 1
  assert.equal(evaluateAudit(value).inventory.length, 1)
  assert.equal(evaluateAudit(value).blocking.length, 0)
  value.advisories.one.findings[0].paths = ['apps__web>fictional']
  assert.equal(evaluateAudit(value).blocking.length, 1)
})
test('unavailable audit, unknown paths and contradictory summary fail closed', () => {
  assert.throws(() => evaluateAudit({}), /unavailable/)
  const value = cleanAudit(); value.advisories.one = { severity: 'low', findings: [{ paths: ['unclassified>fictional'] }] }
  assert.throws(() => evaluateAudit(value), /unclassified/)
  const summary = cleanAudit(); summary.metadata.vulnerabilities.critical = 1
  assert.throws(() => evaluateAudit(summary), /disagree/)
})

function runBinding() {
  const current = { commit: 'current-commit', tree: 'current-tree', sourceHash: 'current-source-hash', candidateTree: null }
  const hashes = { reportHash: 'current-report', htmlHash: 'current-html', metricsHash: 'current-metrics', manifestHash: 'current-manifest', runHash: 'current-run', buildHash: 'current-build' }
  return { current, hashes, buildId: 'new-build', build: { ...current, clean: true, buildId: 'new-build', completedAt: '2026-11-20T00:00:00.000Z' }, run: { runId: 'same-run', at: '2026-11-20T00:01:00.000Z' }, manifest: { runId: 'same-run', buildHash: hashes.buildHash }, completion: { runId: 'same-run', exitCode: 0, at: '2026-11-20T00:02:00.000Z', ...hashes }, reportStart: '2026-11-20T00:01:05.000Z' }
}
test('matching build and successful same-run report binding is accepted', () => {
  assert.deepEqual(evaluateRunBinding(runBinding()), [])
})
test('old build cannot be relabelled as current source or revision', () => {
  for (const field of ['commit', 'tree', 'sourceHash', 'buildId']) {
    const value = runBinding(); value.build[field] = 'stale'
    assert.ok(evaluateRunBinding(value).some(error => error.includes('build provenance')))
  }
})
test('prior report or receipt is rejected even when it contains passing tests', () => {
  const priorReport = runBinding(); priorReport.completion.reportHash = 'old-report'
  assert.ok(evaluateRunBinding(priorReport).some(error => error.includes('Prior or altered')))
  const priorRun = runBinding(); priorRun.completion.runId = 'old-run'
  assert.ok(evaluateRunBinding(priorRun).some(error => error.includes('same-run')))
  const priorTime = runBinding(); priorTime.reportStart = '2026-11-19T23:59:00.000Z'
  assert.ok(evaluateRunBinding(priorTime).some(error => error.includes('current completed run')))
})
test('startup failure without a successful completion receipt cannot pass', () => {
  const value = runBinding(); delete value.completion
  assert.ok(evaluateRunBinding(value).some(error => error.includes('Missing successful')))
})
