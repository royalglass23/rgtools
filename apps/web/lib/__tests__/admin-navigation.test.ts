import { describe, expect, it } from 'vitest'
import { buildDashboardNavigation } from '../admin-navigation'

const moduleRow = (
  id: string,
  slug: string,
  name: string,
  sortOrder: number,
  adminOnly = false,
) => ({
  id,
  slug,
  name,
  sortOrder,
  adminOnly,
  isActive: true,
})

describe('buildDashboardNavigation', () => {
  it('keeps shared admin modules in Admin and moves module settings into their module menus', () => {
    const nav = buildDashboardNavigation([
      moduleRow('m1', 'lead-intake', 'Lead Intake', 0),
      moduleRow('m3', 'leads', 'Leads', 1),
      moduleRow('quotes', 'quote-tracker', 'Quote Tracker', 3),
      moduleRow('clients', 'clients', 'Clients', 4),
      moduleRow('m4', 'admin/calculator-pricing', 'Cost Calculator Price', 102, true),
      moduleRow('m5', 'admin', 'Administration', 99, true),
      moduleRow('m6', 'admin/tracking', 'Tracking Settings', 103, true),
      moduleRow('m7', 'admin/client-merge-review', 'Client Merge Review', 105, true),
    ], { isAdmin: true })

    expect(nav.primaryModules.map((mod) => mod.slug)).toEqual([])
    expect(nav.leadIntakeItems).toEqual([
      { id: 'lead-intake-form', slug: 'lead-intake', name: 'Form', href: '/lead-intake' },
      { id: 'lead-intake-list', slug: 'leads', name: 'List', href: '/leads' },
      {
        id: 'lead-intake-configuration',
        slug: 'lead-intake/configuration',
        name: 'Configuration',
        href: '/lead-intake/configuration',
      },
      {
        id: 'lead-intake-guide',
        slug: 'lead-intake/guide',
        name: 'Guide',
        href: '/lead-intake/guide',
      },
    ])
    expect(nav.adminItems).toEqual([
      { id: 'm5', slug: 'admin', name: 'Administration', href: '/admin/administration' },
      {
        id: 'm4',
        slug: 'admin/calculator-pricing',
        name: 'Cost Calculator Price',
        href: '/admin/calculator-pricing',
      },
    ])
    expect(nav.quoteTrackerItems).toEqual([
      { id: 'quote-tracker-list', slug: 'quote-tracker', name: 'Track Quotes', href: '/quote-tracker' },
      {
        id: 'quote-tracker-configuration',
        slug: 'admin/tracking',
        name: 'Configuration',
        href: '/admin/tracking',
      },
      { id: 'quote-tracker-guide', slug: 'quote-tracker/guide', name: 'Guide', href: '/quote-tracker/guide' },
    ])
    expect(nav.clientsItems).toEqual([
      { id: 'clients-list', slug: 'clients', name: 'List', href: '/clients' },
      {
        id: 'clients-merge-review',
        slug: 'admin/client-merge-review',
        name: 'Merge Review',
        href: '/admin/client-merge-review',
      },
      { id: 'clients-configuration', slug: 'clients/configuration', name: 'Configuration', href: '/clients/configuration' },
      { id: 'clients-guide', slug: 'clients/guide', name: 'Guide', href: '/clients/guide' },
    ])
  })

  it('hides lead intake configuration for non-admin navigation', () => {
    const nav = buildDashboardNavigation([
      moduleRow('m1', 'lead-intake', 'Lead Intake', 0),
      moduleRow('m3', 'leads', 'Leads', 1),
    ])

    expect(nav.leadIntakeItems).toEqual([
      { id: 'lead-intake-form', slug: 'lead-intake', name: 'Form', href: '/lead-intake' },
      { id: 'lead-intake-list', slug: 'leads', name: 'List', href: '/leads' },
      { id: 'lead-intake-guide', slug: 'lead-intake/guide', name: 'Guide', href: '/lead-intake/guide' },
    ])
  })

  it('groups Quote Tracker and Clients with their staff-facing guide links', () => {
    const nav = buildDashboardNavigation([
      moduleRow('clients', 'clients', 'Clients', 2),
      moduleRow('quotes', 'quote-tracker', 'Quote Tracker', 3),
    ])

    expect(nav.primaryModules.map((mod) => ({ slug: mod.slug, name: mod.name }))).toEqual([
    ])
    expect(nav.quoteTrackerItems).toEqual([
      { id: 'quote-tracker-list', slug: 'quote-tracker', name: 'Track Quotes', href: '/quote-tracker' },
      { id: 'quote-tracker-guide', slug: 'quote-tracker/guide', name: 'Guide', href: '/quote-tracker/guide' },
    ])
    expect(nav.clientsItems).toEqual([
      { id: 'clients-list', slug: 'clients', name: 'List', href: '/clients' },
      { id: 'clients-guide', slug: 'clients/guide', name: 'Guide', href: '/clients/guide' },
    ])
  })

  it('deduplicates a migrated administration module against the legacy admin module', () => {
    const nav = buildDashboardNavigation([
      moduleRow('legacy', 'admin', 'Administration', 99, true),
      moduleRow('migrated', 'admin/administration', 'Administration', 100, true),
    ])

    expect(nav.adminItems).toEqual([
      {
        id: 'legacy',
        slug: 'admin',
        name: 'Administration',
        href: '/admin/administration',
      },
    ])
  })

  it('hides work order navigation by default while the module is parked on its branch', () => {
    const nav = buildDashboardNavigation([
      moduleRow('work-orders', 'work-orders', 'Work Orders', 5),
      moduleRow('work-order-config', 'admin/work-orders', 'Work Order Configuration', 106, true),
    ], { isAdmin: true })

    expect(nav.primaryModules).toEqual([])
    expect(nav.workOrderItems).toEqual([])
    expect(nav.adminItems).toEqual([])
  })

  it('groups work order list and configuration under the Work Order menu when enabled', () => {
    const nav = buildDashboardNavigation([
      moduleRow('work-orders', 'work-orders', 'Work Orders', 5),
      moduleRow('work-order-manage', 'work-orders/manage', 'Work Orders Manage', 6),
      moduleRow('work-order-config', 'admin/work-orders', 'Work Order Configuration', 106, true),
    ], { isAdmin: true, showWorkOrderNavigation: true })

    expect(nav.primaryModules).toEqual([])
    expect(nav.adminItems).toEqual([])
    expect(nav.workOrderItems).toEqual([
      { id: 'work-order-list', slug: 'work-orders', name: 'Lists', href: '/work-orders' },
      { id: 'work-order-configuration', slug: 'admin/work-orders', name: 'Configuration', href: '/admin/work-orders' },
      { id: 'work-order-guide', slug: 'work-orders/guide', name: 'Guide', href: '/work-orders/guide' },
    ])
    expect(nav.primaryModules).not.toContainEqual(expect.objectContaining({ slug: 'work-orders/manage' }))
  })

  it('does not render PS publish permission rows as top-level navigation', () => {
    const nav = buildDashboardNavigation([
      moduleRow('ps', 'ps-generator', 'PS Generator', 4),
      moduleRow('ps-history', 'ps-generator/history', 'PS History', 5),
      moduleRow('ps-config', 'ps-generator/configuration', 'PS Configuration', 6),
      moduleRow('ps-publish', 'ps-generator/configuration/publish', 'PS Configuration Publisher', 7),
    ], { isAdmin: true })

    expect(nav.primaryModules).toEqual([])
    expect(nav.psGeneratorItems).toEqual([
      { id: 'ps-generator-generate', slug: 'ps-generator', name: 'Generate PS', href: '/ps-generator' },
      { id: 'ps-generator-history', slug: 'ps-generator/history', name: 'History', href: '/ps-generator/history' },
      {
        id: 'ps-generator-configuration',
        slug: 'ps-generator/configuration',
        name: 'Configuration',
        href: '/ps-generator/configuration',
      },
    ])
  })

  it('does not render removed lead admin modules even when stale rows remain active', () => {
    const nav = buildDashboardNavigation([
      moduleRow('lead-scoring', 'admin/lead-scoring', 'Lead Scoring', 101, true),
      moduleRow('lead-import', 'admin/lead-import', 'Lead Import', 102, true),
      moduleRow('clients', 'clients', 'Clients', 2),
    ], { isAdmin: true })

    expect(nav.primaryModules.map((mod) => mod.slug)).toEqual([])
    expect(nav.clientsItems).toEqual([
      { id: 'clients-list', slug: 'clients', name: 'List', href: '/clients' },
      { id: 'clients-configuration', slug: 'clients/configuration', name: 'Configuration', href: '/clients/configuration' },
      { id: 'clients-guide', slug: 'clients/guide', name: 'Guide', href: '/clients/guide' },
    ])
    expect(nav.adminItems).toEqual([])
  })
})
