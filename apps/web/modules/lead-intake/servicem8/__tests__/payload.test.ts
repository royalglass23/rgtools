import { describe, expect, it } from 'vitest'
import {
  buildServiceM8InboxEmail,
  buildServiceM8LeadJobCardFields,
  type ServiceM8LeadSyncRecord,
} from '../payload'

function leadRecord(overrides: Partial<ServiceM8LeadSyncRecord> = {}): ServiceM8LeadSyncRecord {
  return {
    leadId: 'lead-1',
    servicem8JobUuid: null,
    clientName: 'Aroha Smith',
    companyName: 'Smith Builds',
    phone: '021 123 456',
    email: 'aroha@example.com',
    channel: 'phone',
    source: 'existing_client_referral_repeat_builder_architect',
    projectType: 'pool_fence',
    location: '12 Queen Street, Auckland',
    suburb: 'Auckland Central',
    clientProfileKey: 'existing_business',
    budgetBand: '10k_to_50k',
    consentStatus: 'consent_under_review',
    complexity: 'standard_non_custom',
    priceSensitivityRead: 'average_negotiation',
    decisionMakers: 'sole_decision_maker',
    distanceBand: 'within_30km',
    paymentHistory: 'new_client',
    siteAccess: 'easy',
    installationHeight: 'ground_floor_ladder',
    freeText: 'Customer wants a frameless option.',
    seedScore: 82,
    tier: 'A',
    scoreReason: 'Tier A (82): strong fit',
    strikeFlag: 'Blocker flag: remote specialised',
    completeness: 100,
    updatedAt: new Date('2026-07-06T02:30:00.000Z'),
    ...overrides,
  }
}

describe('buildServiceM8LeadPayload', () => {
  it('builds a ServiceM8 inbox email with parser-friendly contact fields', () => {
    const email = buildServiceM8InboxEmail(leadRecord(), ['de9f86@inbox.servicem8.com'])

    expect(email.to).toEqual(['de9f86@inbox.servicem8.com'])
    expect(email.subject).toBe('RGTools Lead - Leads Quality A - Aroha Smith - Pool Fence')
    expect(email.body).toContain('Name: Aroha Smith')
    expect(email.body).toContain('Company: Smith Builds')
    expect(email.body).toContain('Mobile: 021 123 456')
    expect(email.body).toContain('Email: aroha@example.com')
    expect(email.body).toContain('Address: 12 Queen Street, Auckland')
  })

  it('omits optional parser fields when phone and email are missing', () => {
    const email = buildServiceM8InboxEmail(leadRecord({
      phone: null,
      email: null,
      companyName: null,
    }), ['de9f86@inbox.servicem8.com'])

    expect(email.body).toContain('Name: Aroha Smith')
    expect(email.body).not.toContain('Mobile:')
    expect(email.body).not.toContain('Email:')
  })

  it('keeps complete details in the email and only the summary on the job card', () => {
    const email = buildServiceM8InboxEmail(leadRecord(), ['de9f86@inbox.servicem8.com'])
    const jobCard = buildServiceM8LeadJobCardFields(leadRecord())

    expect(email.body).toContain('--- Lead Score ---')
    expect(email.body).toContain('--- Lead Details ---')
    expect(email.body).toContain('Details: Customer wants a frameless option.')
    expect(jobCard.jobDescription).toBe('RGTools Lead - Pool Fence quote - Auckland Central')
    expect(jobCard.diaryNote).toBeNull()
    expect(jobCard.summaryNote).toBe([
      '--- Contact ---',
      'Name: Aroha Smith',
      'Company: Smith Builds',
      'Mobile: 021 123 456',
      'Email: aroha@example.com',
      'Address: 12 Queen Street, Auckland',
      '',
      '--- Project Summary ---',
      'Product: Pool Fence',
      'Budget: $10k to $50k',
      'Driving distance: Within 30 km',
      'Last updated: 6 Jul 2026',
      'Reference: RGTools Lead lead-1',
    ].join('\n'))
  })

  it('builds the requested contact and project summary diary note', () => {
    const jobCard = buildServiceM8LeadJobCardFields(leadRecord({
      leadId: '06f5f61f-9fd4-4c84-891e-9baa2e030841',
      clientName: 'Daniel Brown',
      companyName: null,
      phone: '0275221991',
      email: 'dbz@hotmail.com',
      location: '12 Albany Road, Ponsonby, Auckland',
      suburb: 'Ponsonby',
      projectType: 'balcony_balustrade',
      budgetBand: '20k_50k',
      distanceBand: 'lt_15km',
      freeText: [
        '[Calculator] submitted 2026-10-08T01:00:00.000Z',
        'Estimate: $39550 - $52700 (subtotal $43930)',
        'Project: balcony_balustrade, 25m, 2 corner(s), 0 gate(s)',
      ].join('\n'),
      updatedAt: new Date('2026-10-08T01:00:00.000Z'),
    }))

    expect(jobCard.summaryNote).toBe([
      '--- Contact ---',
      'Name: Daniel Brown',
      'Mobile: 0275221991',
      'Email: dbz@hotmail.com',
      'Address: 12 Albany Road, Ponsonby, Auckland',
      '',
      '--- Project Summary ---',
      'Product: Balcony Balustrade',
      'Project: Balcony Balustrade',
      'Budget: $20k-50k',
      'Estimated price: $39,550-$52,700',
      'Subtotal: $43,930',
      'Driving distance: <15 km',
      'Last updated: 8 Oct 2026',
      'Reference: RGTools Lead 06f5f61f-9fd4-4c84-891e-9baa2e030841',
    ].join('\n'))
  })

  it('humanizes legacy/raw option keys before writing the ServiceM8 Job Description', () => {
    const jobCard = buildServiceM8LeadJobCardFields(leadRecord({
      source: 'calculator',
      clientProfileKey: 'new_business',
      budgetBand: '2k_to_10k',
      projectType: 'pool_fence',
      complexity: 'standard_non_custom',
      distanceBand: 'within_30km',
      scoreReason: 'Tier C (41): Client type: new_business, Budget band: 2k_to_10k, Complexity: standard_non_custom, Distance: within_30km',
      freeText: [
        '[Calculator] submitted 2026-07-06T03:52:43.256Z',
        'Project: premium_pool_fence, 10m, 2 corner(s), 1 gate(s)',
        'Fixing: standoff_posts | Substrate: tile | Hardware: matte_black',
        'Glass: toughened_12mm / clear',
        'Customer type: Builder | Call preference: anytime',
      ].join('\n'),
      seedScore: 41,
      tier: 'C',
      completeness: 44,
    }))

    expect(jobCard.jobDescription).toBe(
      'RGTools Lead - Premium Pool Fence quote - 10m, 2 corners, 1 gate, Stand-off Posts on Tile',
    )
    expect(jobCard.diaryNote).toBeNull()
  })

  it('formats calculator details into readable email sections with one field per line', () => {
    const email = buildServiceM8InboxEmail(
      leadRecord({
        companyName: null,
        source: 'calculator',
        clientProfileKey: 'homeowner',
        budgetBand: '2k_to_10k',
        projectType: 'pool_fence',
        complexity: null,
        distanceBand: 'within_30km',
        freeText: [
          '[Calculator] submitted 2026-07-13T21:28:23.507Z',
          'Estimate: $4450 - $5950 (subtotal $4950)',
          'Project: premium_pool_fence, 8m, 1 corner(s), 1 gate(s)',
          'Fixing: spigot_round | Substrate: tile | Hardware: standard_chrome',
          'Glass: toughened_12mm / clear',
          'Customer type: Homeowner | Call preference: anytime',
          'Consultation needed: no',
          'Contact consent: yes',
          'Notes: Requires one self closing gate.',
        ].join('\n'),
        seedScore: 10,
        tier: 'E',
        scoreReason: 'Tier E (10): 4/13 matrix fields answered',
        strikeFlag: null,
        completeness: 31,
        updatedAt: new Date('2026-07-13T21:28:23.507Z'),
      }),
      ['de9f86@inbox.servicem8.com'],
    )

    expect(email.body).toContain(
      [
        '--- Contact ---',
        'Name: Aroha Smith',
        'Mobile: 021 123 456',
        'Email: aroha@example.com',
        'Address: 12 Queen Street, Auckland',
      ].join('\n'),
    )
    expect(email.body).toContain(
      [
        '--- Project Summary ---',
        'Product: Pool Fence',
        'Project: Premium Pool Fence',
        'Budget: $2k to $10k',
        'Estimated price: $4,450-$5,950',
        'Subtotal: $4,950',
        'Driving distance: Within 30 km',
        'Last updated: 14 Jul 2026',
      ].join('\n'),
    )
    expect(email.body).toContain('--- Lead Score ---')
    expect(email.body).toContain('Quality: E')
    expect(email.body).toContain('Score: 10')
    expect(email.body).toContain('--- Lead Details ---')
    expect(email.body).toContain('Client type: Homeowner')
    expect(email.body).toContain('--- Installation Details ---')
    expect(email.body).toContain('Length: 8 m')
    expect(email.body).toContain('Notes: Requires one self closing gate.')
    expect(email.body).toContain('--- Reference ---')
    expect(email.body).toContain('RGTools Lead: lead-1')
  })

  it('humanizes stair calculator submissions in the ServiceM8 Job Description', () => {
    const jobCard = buildServiceM8LeadJobCardFields(leadRecord({
      source: 'calculator',
      clientProfileKey: 'homeowner',
      budgetBand: '10k_to_50k',
      projectType: 'stair',
      complexity: 'standard_non_custom',
      distanceBand: 'within_30km',
      scoreReason: 'Tier B (43): Client type: homeowner, Budget band: 10k_to_50k, Complexity: standard_non_custom, Distance: within_30km',
      freeText: [
        '[Calculator] submitted 2026-07-06T22:15:19.856Z',
        'Estimate: $23450 - $31250 (subtotal $26040)',
        'Project: stair_balustrade, 10m, 0 corner(s), 0 gate(s), landing 11m',
        'Fixing: jh_clamps | Substrate: tile | Hardware: matte_black',
        'Glass: toughened_12mm_clear',
        'Customer type: Homeowner | Call preference: anytime',
      ].join('\n'),
      seedScore: 43,
      tier: 'B',
      completeness: 44,
    }))

    expect(jobCard.jobDescription).toBe(
      'RGTools Lead - Stair Balustrade quote - 10m, JH Clamps on Tile',
    )
    expect(jobCard.diaryNote).toBeNull()
  })
})
