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

  it('includes the complete lead details, including contact, in the ServiceM8 Job Description', () => {
    const jobCard = buildServiceM8LeadJobCardFields(leadRecord())

    expect(jobCard.jobDescription).toContain('--- Contact ---')
    expect(jobCard.jobDescription).toContain('Name: Aroha Smith')
    expect(jobCard.jobDescription).toContain('Company: Smith Builds')
    expect(jobCard.jobDescription).toContain('Mobile: 021 123 456')
    expect(jobCard.jobDescription).toContain('Email: aroha@example.com')
    expect(jobCard.jobDescription).toContain('Address: 12 Queen Street, Auckland')
    expect(jobCard.jobDescription).toContain('--- Lead Score ---')
    expect(jobCard.jobDescription).toContain('Driving distance: Within 30 km')
    expect(jobCard.jobDescription).toContain('Product: Pool Fence')
    expect(jobCard.jobDescription).toContain('Client type: Existing Business')
    expect(jobCard.jobDescription).toContain('Budget: $10k to $50k')
    expect(jobCard.jobDescription).toContain('Consent status: Consent Under Review')
    expect(jobCard.jobDescription).toContain('Complexity: Standard Non Custom')
    expect(jobCard.jobDescription).toContain('Price-sensitivity read: Average Negotiation')
    expect(jobCard.jobDescription).toContain('Decision-makers: Sole Decision Maker')
    expect(jobCard.jobDescription).toContain('Source: Existing Client / Referral / Repeat Builder / Architect')
    expect(jobCard.jobDescription).toContain('Payment history: New Client')
    expect(jobCard.jobDescription).toContain('Site access: Easy')
    expect(jobCard.jobDescription).toContain('Installation height: Ground Floor / Ladder')
    expect(jobCard.jobDescription).toContain('Channel: Phone')
    expect(jobCard.jobDescription).toContain('Quality: A')
    expect(jobCard.jobDescription).toContain('Score: 82')
    expect(jobCard.jobDescription).toContain('Completeness: 100%')
    expect(jobCard.jobDescription).toContain('Flag: Blocker flag: remote specialised')
    expect(jobCard.jobDescription).toContain('Reason: strong fit')
    expect(jobCard.jobDescription).toContain('Details: Customer wants a frameless option.')
    expect(jobCard.jobDescription).toContain('RGTools Lead: lead-1')
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

    expect(jobCard.jobDescription).toContain(
      'Reason: Client type: New Business, Budget band: $2k to $10k, Complexity: Standard Non Custom, Distance: Within 30 km',
    )
    expect(jobCard.jobDescription).toContain('Driving distance: Within 30 km')
    expect(jobCard.jobDescription).toContain('Product: Pool Fence')
    expect(jobCard.jobDescription).toContain('Client type: New Business')
    expect(jobCard.jobDescription).toContain('Budget: $2k to $10k')
    expect(jobCard.jobDescription).toContain('Complexity: Standard Non Custom')
    expect(jobCard.jobDescription).toContain('Source: Calculator')
    expect(jobCard.jobDescription).toContain('Project: Premium Pool Fence')
    expect(jobCard.jobDescription).toContain('Length: 10 m')
    expect(jobCard.jobDescription).toContain('Corners: 2')
    expect(jobCard.jobDescription).toContain('Gates: 1')
    expect(jobCard.jobDescription).toContain('Fixing: Stand-off Posts\nSubstrate: Tile\nHardware: Matte Black')
    expect(jobCard.jobDescription).toContain('Glass: 12mm Toughened / Clear')
    expect(jobCard.jobDescription).toContain('Call preference: Anytime')
    expect(jobCard.jobDescription).not.toContain('within_30km')
    expect(jobCard.jobDescription).not.toContain('pool_fence')
    expect(jobCard.jobDescription).not.toContain('new_business')
    expect(jobCard.jobDescription).not.toContain('2k_to_10k')
    expect(jobCard.jobDescription).not.toContain('standard_non_custom')
    expect(jobCard.jobDescription).not.toContain('premium_pool_fence')
    expect(jobCard.jobDescription).not.toContain('standoff_posts')
    expect(jobCard.jobDescription).not.toContain('matte_black')
    expect(jobCard.jobDescription).not.toContain('toughened_12mm')
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
        'Reference: RGTools Lead lead-1',
      ].join('\n'),
    )
    expect(email.body).not.toContain('--- Lead Score ---')
    expect(email.body).not.toContain('--- Lead Details ---')
    expect(email.body).not.toContain('--- Installation Details ---')
    expect(email.body).not.toContain('--- Reference ---')
    expect(email.body).not.toContain('Notes: Requires one self closing gate.')
    expect(email.body).not.toContain('Job description: Score 10 |')
    expect(email.body).not.toContain('Details: [Calculator] submitted')
    expect(email.body).not.toContain('Note: Leads Quality E |')
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

    expect(jobCard.jobDescription).toContain(
      'Reason: Client type: Homeowner, Budget band: $10k to $50k, Complexity: Standard Non Custom, Distance: Within 30 km',
    )
    expect(jobCard.jobDescription).toContain('Driving distance: Within 30 km')
    expect(jobCard.jobDescription).toContain('Product: Stair Balustrade')
    expect(jobCard.jobDescription).toContain('Client type: Homeowner')
    expect(jobCard.jobDescription).toContain('Budget: $10k to $50k')
    expect(jobCard.jobDescription).toContain('Complexity: Standard Non Custom')
    expect(jobCard.jobDescription).toContain('Source: Calculator')
    expect(jobCard.jobDescription).toContain('Project: Stair Balustrade')
    expect(jobCard.jobDescription).toContain('Length: 10 m')
    expect(jobCard.jobDescription).toContain('Corners: 0')
    expect(jobCard.jobDescription).toContain('Gates: 0')
    expect(jobCard.jobDescription).toContain('Landing: 11 m')
    expect(jobCard.jobDescription).toContain('Fixing: JH Clamps\nSubstrate: Tile\nHardware: Matte Black')
    expect(jobCard.jobDescription).toContain('Glass: 12mm Toughened / Clear')
    expect(jobCard.jobDescription).toContain('Call preference: Anytime')
    expect(jobCard.jobDescription).not.toContain('within_30km')
    expect(jobCard.jobDescription).not.toContain('stair_balustrade')
    expect(jobCard.jobDescription).not.toContain('10k_to_50k')
    expect(jobCard.jobDescription).not.toContain('standard_non_custom')
    expect(jobCard.jobDescription).not.toContain('jh_clamps')
    expect(jobCard.jobDescription).not.toContain('matte_black')
    expect(jobCard.jobDescription).not.toContain('toughened_12mm_clear')
  })
})
