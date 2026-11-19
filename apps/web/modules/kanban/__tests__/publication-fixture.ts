export const publicationFixture = () => ({ schemaVersion: 1, board: 'work-orders', publicationId: '12345678-1234-4123-8123-123456789abc', complete: true,
  sourceAsOf: '2026-11-20T00:00:00.000Z', generatedAt: '2026-11-20T00:01:00.000Z',
  tables: { jobs: [{ id: 'job-immutable-uuid', cells: ['R260001', 'Fictional Customer', 'Example Road', 'TBC', 'N'] }],
    products: [{ id: 'product-immutable-uuid', cells: ['R260001\nFictional Customer\nExample Road', 'Shower', '', '?', 'N', 'Y', 'Y', 'PS1 issued', 'N', '?', ''] }] } })
