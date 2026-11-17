import type { DashboardProduct } from '../persistence'
import type { FieldAssessment } from '../operational-assessment'
import { ASSESSMENT_RULES } from '../assessment'
import { automaticDashboardState, readFieldOwnership } from '../field-ownership'
import { parseManualState } from '../work-orders'

const fact = (value: string, quote: string, date: string | null = null, datePurpose: 'ready' | 'expected' | null = null): FieldAssessment => ({ status: 'assessed', value, date, datePurpose, reason: 'Explicit synthetic product fact.', evidence: [{ kind: 'note', reference: 'synthetic-note', observedAt: '2026-11-18T00:00:00Z', quote }], coverage: { complete: ['note'], missing: [], unsupported: ['photos'] } })
export const effectiveProduct = (): DashboardProduct => ({
  jobId: '40600000-0000-4000-8000-000000000010', itemId: '40600000-0000-4000-8000-000000000020',
  jobNumber: 'TEST406', customer: 'Fixture', address: 'Test site', jobUuid: null, syncedAt: '2026-11-18T00:00:00Z',
  jobInstallDate: null, itemUuid: 'fixture', label: 'Shower', generatedLabel: null, description: 'Source shower', quantity: '1', installDate: null, installerId: null, installer: null,
  manual: parseManualState({}), revision: 0, focus: 'upcoming', planningDate: '2026-11-22', detectedDate: '2026-11-22', inDueWindow: true, dateSource: 'detected', kanbanFlag: null,
  ownership: readFieldOwnership(automaticDashboardState()), assessmentCurrent: true, operationalCurrent: true,
  assessment: { state: 'complete', rules: ASSESSMENT_RULES, model: 'synthetic', sourceHash: 'synthetic-source', snapshotHash: 'synthetic-snapshot', checkedAt: '2026-11-18T01:00:00Z', assessedAt: '2026-11-18T01:00:00Z', error: null,
    result: { status: 'dated', date: '2026-11-22', kind: 'installation', reason: 'Explicit product planning.', evidence: [{ kind: 'note', reference: 'synthetic-date', observedAt: '2026-11-18T00:00:00Z', quote: 'Shower installation is 22/11/2026.' }] },
    operational: { version: 1, summary: 'Synthetic generated readiness summary.', gaps: [], fields: {
      siteReady: fact('yes', 'Shower site is ready.', '2026-11-18', 'ready'), glassReady: fact('unknown', 'Shower glass expected on 21/11/2026.', '2026-11-21', 'expected'), hardwareReady: fact('no', 'Shower hardware is not ready.'), designConfirmed: fact('yes', 'Shower design is confirmed.'),
      ps1Required: fact('yes', 'Shower PS1 is required.'), ps3Required: fact('no', 'Shower PS3 is not required.'), ps1Issued: fact('no', 'Shower PS1 has not been issued.'), ps3Issued: fact('yes', 'Shower PS3 was issued.'), bottleStrut: fact('no', 'Shower bottle strut is not required.'),
      buildingConsent: fact('approved', 'Shower building consent is approved.'), buildingConsentNumber: fact('BCO1234567', 'Shower building consent number BCO1234567.'), minorVariationRequired: fact('no', 'Shower minor variation is not required.'),
      clientWaitingFor: fact('glass arrival', 'Shower client is waiting for glass arrival.'), materialsEta: fact('2026-11-21', 'Shower materials ETA is 21/11/2026.'), aftercare: fact('na', 'Shower aftercare is not applicable.'), installerId: fact('40600000-0000-4000-8000-000000000030', 'Shower installer is i0.'), estimatedHours: fact('2.5', 'Shower estimated labour is 2.5 hours.'),
    } },
  },
})
