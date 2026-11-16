import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('../actions', () => ({ saveDashboardProduct: mocks.save, productHistory: vi.fn() }))
import { ProductEditor } from '../ProductEditor'
import { ProductDrafts } from '../ProductDrafts'
import { parseManualState } from '../work-orders'
import type { DashboardProduct } from '../persistence'
import { assessmentIsCurrent, type StoredAssessment } from '../assessment'
const product: DashboardProduct = {
  jobId: '40600000-0000-4000-8000-000000000010', itemId: '40600000-0000-4000-8000-000000000020',
  jobNumber: 'TEST406', customer: 'Fixture', address: 'Test site', jobUuid: null, syncedAt: null,
  jobInstallDate: null, itemUuid: 'fixture', label: 'Shower', generatedLabel: null, description: 'Source shower',
  quantity: '1', installDate: null, installerId: null, installer: null, manual: parseManualState({}), revision: 0, focus: 'unknown',
  assessment: null, assessmentCurrent: false, planningDate: null, detectedDate: null, inDueWindow: false, dateSource: 'unknown', kanbanFlag: null,
}
beforeEach(() => { vi.clearAllMocks(); mocks.save.mockResolvedValue({ ok: true, revision: 1 }) })
describe('staff product editor', () => {
  it('keeps server-rendered fields disabled until change handlers are attached', () => {
    expect(renderToStaticMarkup(<ProductEditor product={product} installers={[]} />)).toContain('<fieldset disabled=""')
    render(<ProductEditor product={product} installers={[]} />)
    expect(screen.getByLabelText('Notes', { exact: true })).toBeEnabled()
  })
  it('has exact control names and preserves unsaved work when source data refreshes', async () => {
    const user = userEvent.setup()
    const view = render(<ProductEditor product={product} installers={[]} />)
    await user.selectOptions(screen.getByLabelText('Site ready', { exact: true }), 'yes')
    await user.selectOptions(screen.getByLabelText('Bottle strut', { exact: true }), 'no')
    await user.selectOptions(screen.getByLabelText('BC?', { exact: true }), 'na')
    await user.type(screen.getByLabelText('Notes', { exact: true }), 'Unsaved visit note')
    view.rerender(<ProductEditor product={{ ...product, description: 'Renamed source item' }} installers={[]} />)
    expect(screen.getByLabelText('Site ready', { exact: true })).toHaveValue('yes')
    expect(screen.getByLabelText('Notes', { exact: true })).toHaveValue('Unsaved visit note')
    await user.click(screen.getByRole('button', { name: 'Save product' }))
    await waitFor(() => expect(screen.getByText('Saved. Change history updated.')).toBeInTheDocument())
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ id: product.itemId, revision: 0, manual: expect.objectContaining({ siteReady: 'yes', bottleStrut: 'no', buildingConsent: 'na', notes: 'Unsaved visit note' }) }))
  })
  it('retains a staff draft when a stale save is rejected', async () => {
    mocks.save.mockResolvedValue({ ok: false, error: 'Someone changed this product.' })
    const user = userEvent.setup(); render(<ProductEditor product={product} installers={[]} />)
    await user.type(screen.getByLabelText('Notes', { exact: true }), 'Keep my draft')
    await user.click(screen.getByRole('button', { name: 'Save product' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Someone changed'))
    expect(screen.getByLabelText('Notes', { exact: true })).toHaveValue('Keep my draft')
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
  it('does not refresh away another product draft after this product saves', async () => {
    const user = userEvent.setup()
    render(<><form data-work-order-product="other" data-work-order-dirty="true"><textarea aria-label="Other draft" defaultValue="Keep the other product" /></form><ProductEditor product={product} installers={[]} /></>)
    await user.type(screen.getByLabelText('Notes', { exact: true }), 'Save this product')
    await user.click(screen.getByRole('button', { name: 'Save product' }))
    await waitFor(() => expect(screen.getByText('Saved. Dashboard refresh waits for other product edits.')).toBeInTheDocument())
    expect(mocks.refresh).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Other draft')).toHaveValue('Keep the other product')
  })
  it('retains a draft outside a removed row and restores it when the product returns', async () => {
    const user = userEvent.setup()
    const view = render(<ProductDrafts><ProductEditor product={product} installers={[]} /></ProductDrafts>)
    await user.type(screen.getByLabelText('Notes', { exact: true }), 'Preserve this after row removal')
    // The delayed RSC result excludes this product after the user began editing.
    view.rerender(<ProductDrafts><p>No products in this focus</p></ProductDrafts>)
    const recovery = screen.getByLabelText('Recoverable draft for TEST406 Shower')
    expect((recovery as HTMLTextAreaElement).value).toContain('Preserve this after row removal')
    view.rerender(<ProductDrafts><ProductEditor product={{ ...product, revision: 2 }} installers={[]} /></ProductDrafts>)
    expect(screen.getByLabelText('Notes', { exact: true })).toHaveValue('Preserve this after row removal')
  })
  it('shows old-rule evidence as stale and keeps the staff date input empty', async () => {
    const assessment: StoredAssessment = { state: 'complete', rules: 'old-rules', model: 'fixture', sourceHash: 'source', snapshotHash: 'snapshot', checkedAt: '2026-11-17T00:00:00Z', assessedAt: '2026-11-17T00:00:00Z', error: null,
      result: { status: 'dated', date: '2026-11-20', kind: 'installation', reason: 'Old suggestion', evidence: [{ kind: 'note', reference: null, observedAt: null, quote: 'Install shower on 20/11/2026.' }] } }
    render(<ProductEditor product={{ ...product, assessment, assessmentCurrent: assessmentIsCurrent(assessment, 'snapshot', null) }} installers={[]} />)
    await userEvent.setup().click(screen.getByText('Detected planning evidence', { exact: true }))
    expect(screen.getByRole('alert')).toHaveTextContent('saved suggestion is stale')
    expect(screen.getByLabelText('Target install date')).toHaveValue('')
  })
})
