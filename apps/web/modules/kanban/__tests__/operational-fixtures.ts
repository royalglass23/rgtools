export const FIELD_NAMES = ['siteReady', 'glassReady', 'hardwareReady', 'designConfirmed', 'ps1Required', 'ps3Required', 'ps1Issued', 'ps3Issued', 'bottleStrut', 'buildingConsent', 'buildingConsentNumber', 'minorVariationRequired', 'clientWaitingFor', 'materialsEta', 'aftercare', 'installerId', 'estimatedHours'] as const
export function unknownFields() {
  return Object.fromEntries(FIELD_NAMES.map(field => [field, { status: 'unknown', value: null, date: null, datePurpose: null, scope: 'unclear', productCue: null, reason: 'No explicit evidence.', evidence: [] }]))
}
