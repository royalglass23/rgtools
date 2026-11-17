import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
import { automaticDashboardState, readFieldOwnership } from '../field-ownership'
import { effectiveProduct } from './effective-fixtures'
import { hasPendingProductEdits } from '../draft-guard'
const product: DashboardProduct = {
  jobId: '40600000-0000-4000-8000-000000000010', itemId: '40600000-0000-4000-8000-000000000020',
  jobNumber: 'TEST406', customer: 'Fixture', address: 'Test site', jobUuid: null, syncedAt: null,
  jobInstallDate: null, itemUuid: 'fixture', label: 'Shower', generatedLabel: null, description: 'Source shower',
  quantity: '1', installDate: null, installerId: null, installer: null, manual: parseManualState({}), revision: 0, focus: 'unknown',
  assessment: null, assessmentCurrent: false, planningDate: null, detectedDate: null, inDueWindow: false, dateSource: 'unknown', kanbanFlag: null, ownership: readFieldOwnership(automaticDashboardState()),
}
beforeEach(() => { vi.clearAllMocks(); mocks.save.mockResolvedValue({ ok: true, revision: 1 }) })
describe('staff product editor', () => {
  it('shows current automatic operational values without changing their ownership or staff Notes', () => {
    render(<ProductEditor product={effectiveProduct()} installers={[{ id: '40600000-0000-4000-8000-000000000030', name: 'Synthetic Installer' }]} />)
    expect(screen.getByLabelText('Site ready', { exact: true })).toHaveValue('yes')
    expect(screen.getByLabelText('Client waiting for', { exact: true })).toHaveValue('glass arrival')
    expect(screen.getByLabelText('Estimated hours', { exact: true })).toHaveValue('2.5')
    expect(screen.getByLabelText('Notes', { exact: true })).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Save product' })).toBeDisabled()
  })
  it.each(['no', 'failed'] as const)('retains explicit drafts and original expectations while untouched automatic evidence becomes %s', async state => {
    const user = userEvent.setup(), before = effectiveProduct()
    const view = render(<ProductEditor product={before} installers={[]} />)
    await user.type(screen.getByLabelText('Notes', { exact: true }), 'Keep explicit Notes draft')
    await user.selectOptions(screen.getByLabelText('PS1 needed', { exact: true }), 'no')
    const latest = effectiveProduct(); latest.assessment!.sourceHash = 'new-observed-source'; latest.assessment!.checkedAt = '2026-11-18T02:00:00Z'
    latest.assessment!.operational!.fields.siteReady = { ...latest.assessment!.operational!.fields.siteReady, value: 'no', date: null, datePurpose: null, evidence: [{ kind: 'note', reference: 'new-note', observedAt: '2026-11-18T01:30:00Z', quote: 'Shower site is not ready.' }] }
    if (state === 'failed') { latest.assessment!.state = 'failed'; latest.operationalCurrent = false }
    view.rerender(<ProductEditor product={latest} installers={[]} />)
    expect(screen.getByLabelText('Notes', { exact: true })).toHaveValue('Keep explicit Notes draft')
    expect(screen.getByLabelText('PS1 needed', { exact: true })).toHaveValue('no')
    expect(screen.getByLabelText('Site ready', { exact: true })).toHaveValue(state === 'no' ? 'no' : 'unknown')
    await user.click(screen.getByText('Field ownership', { exact: true }))
    await user.click(screen.getByRole('button', { name: 'Keep staff value for Site ready' }))
    await user.click(screen.getByRole('button', { name: 'Save product' }))
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({ id: before.itemId, revision: 0, expectedInstallerId: null, expectedInstallDate: null, patches: { notes: { mode: 'staff', value: 'Keep explicit Notes draft' }, ps1Required: { mode: 'staff', value: 'no' }, siteReady: { mode: 'staff', value: state === 'no' ? 'no' : 'unknown' } } }))
  })
  it('saves just Notes while other visible fields remain automatic, and shows inspectable provenance', async () => {
    render(<ProductEditor product={effectiveProduct()} installers={[]} />)
    const user = userEvent.setup()
    await user.click(screen.getByLabelText('Evidence for Site ready'))
    const evidence = screen.getByLabelText('Evidence for Site ready').closest('details')!
    expect(evidence).toHaveTextContent('Shower site is ready.'); expect(evidence).toHaveTextContent('Authored:')
    expect(evidence).toHaveTextContent('Assessed:'); expect(evidence).toHaveTextContent('Explicit synthetic product fact.')
    expect(evidence).toHaveTextContent('unsupported Photos')
    await user.type(screen.getByLabelText('Notes', { exact: true }), 'Staff inspection')
    await user.click(screen.getByRole('button', { name: 'Save product' }))
    await waitFor(() => expect(mocks.save).toHaveBeenCalled())
    expect(mocks.save.mock.calls[0][0].patches).toEqual({ notes: { mode: 'staff', value: 'Staff inspection' } })
    expect(screen.getByLabelText('Site ready', { exact: true })).toHaveValue('yes')
  })
  it('keeps literal consent status separate from an explicit staff Unknown override and read-only reference', async () => {
    render(<ProductEditor product={effectiveProduct()} installers={[]} />)
    expect(screen.getByText('approved', { exact: true })).toBeInTheDocument()
    expect(screen.getByText('BCO1234567', { exact: true })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Consent reference' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('BC?', { exact: true })).toHaveValue('unknown')
    const user = userEvent.setup(); await user.click(screen.getByText('Field ownership', { exact: true }))
    await user.click(screen.getByRole('button', { name: 'Keep staff value for BC?' }))
    await user.click(screen.getByRole('button', { name: 'Save product' }))
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ patches: { buildingConsent: { mode: 'staff', value: 'unknown' } } })))
  })
  it('does not promote an automatic delivery date or installer suggestion into canonical staff fields', async () => {
    const row = effectiveProduct(); row.assessment!.result!.kind = 'delivery'
    render(<ProductEditor product={row} installers={[{ id: '40600000-0000-4000-8000-000000000030', name: 'Synthetic Installer' }]} />)
    expect(screen.getByText('22/11/2026 · delivery', { exact: true })).toBeInTheDocument()
    expect(screen.getByLabelText('Target install date')).toHaveValue(''); expect(screen.getByLabelText('Installer', { exact: true })).toHaveValue('')
    const user = userEvent.setup(); await user.click(screen.getByText('Field ownership', { exact: true }))
    await user.click(screen.getByRole('button', { name: 'Keep staff value for Target install date' }))
    await user.click(screen.getByRole('button', { name: 'Keep staff value for Installer' }))
    await user.click(screen.getByRole('button', { name: 'Save product' }))
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ patches: { installDate: { mode: 'staff', value: null }, installerId: { mode: 'staff', value: null } } })))
  })
  it('preserves readiness state, date and purpose as one explicit staff override and releases only that field', async () => {
    render(<ProductEditor product={effectiveProduct()} installers={[]} />)
    const user = userEvent.setup(); await user.click(screen.getByText('Field ownership', { exact: true }))
    await user.click(screen.getByRole('button', { name: 'Keep staff value for Site ready' }))
    await user.click(screen.getByRole('button', { name: 'Save product' }))
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ patches: { siteReady: { mode: 'staff', value: { state: 'yes', date: '2026-11-18', datePurpose: 'ready' } } } })))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Use automatic assessment for Site ready' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'Use automatic assessment for Site ready' }))
    await user.click(screen.getByRole('button', { name: 'Save product' }))
    await waitFor(() => expect(mocks.save).toHaveBeenLastCalledWith(expect.objectContaining({ revision: 1, patches: { siteReady: { mode: 'auto' } } })))
    expect(screen.getByLabelText('Glass ready date')).toHaveValue('2026-11-21')
  })
  it('updates pristine automatic controls but retains dirty values, modes, focus and original concurrency expectations', async () => {
    const original = effectiveProduct(), user = userEvent.setup()
    const view = render(<ProductEditor product={original} installers={[]} />)
    const updated = effectiveProduct(); updated.assessment!.operational!.fields.siteReady = { ...updated.assessment!.operational!.fields.siteReady, value: 'no', date: null, datePurpose: null }
    view.rerender(<ProductEditor product={updated} installers={[]} />)
    expect(screen.getByLabelText('Site ready', { exact: true })).toHaveValue('no')
    await user.click(screen.getByText('Field ownership', { exact: true }))
    await user.click(screen.getByRole('button', { name: 'Keep staff value for Site ready' }))
    await user.type(screen.getByLabelText('Notes', { exact: true }), 'Keep dirty value')
    const focused = screen.getByLabelText('Notes', { exact: true }); expect(focused).toHaveFocus()
    const newest = effectiveProduct(); newest.revision = 4; newest.installerId = '40600000-0000-4000-8000-000000000099'; newest.installDate = '2026-12-01'
    view.rerender(<ProductEditor product={newest} installers={[]} />)
    expect(focused).toHaveFocus(); expect(screen.getByLabelText('Site ready', { exact: true })).toHaveValue('no')
    mocks.save.mockResolvedValue({ ok: false, error: 'Someone changed this product.' })
    await user.click(screen.getByRole('button', { name: 'Save product' })); await waitFor(() => expect(screen.getByText('Someone changed this product.', { exact: true })).toBeInTheDocument())
    await user.click(await screen.findByRole('button', { name: 'Save product' }))
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2))
    for (const [input] of mocks.save.mock.calls) expect(input).toMatchObject({ revision: 0, expectedInstallerId: null, expectedInstallDate: null, patches: { siteReady: { mode: 'staff', value: 'no' }, notes: { mode: 'staff', value: 'Keep dirty value' } } })
  })
  it('recovers a composite readiness draft and mode without rebasing after the product leaves a filter', async () => {
    const original = effectiveProduct(), user = userEvent.setup()
    const view = render(<ProductDrafts><ProductEditor product={original} installers={[]} /></ProductDrafts>)
    fireEvent.change(screen.getByLabelText('Glass ready date'), { target: { value: '2026-11-25' } })
    await user.selectOptions(screen.getByLabelText('Glass ready date purpose'), 'ready')
    view.rerender(<ProductDrafts><p>Product left this view</p></ProductDrafts>)
    expect((screen.getByLabelText('Recoverable draft for TEST406 Shower') as HTMLTextAreaElement).value).toContain('Ready on 2026-11-25')
    view.rerender(<ProductDrafts><ProductEditor product={{ ...original, revision: 5, installDate: '2026-12-02' }} installers={[]} /></ProductDrafts>)
    expect(screen.getByLabelText('Glass ready date')).toHaveValue('2026-11-25'); expect(screen.getByLabelText('Glass ready date purpose')).toHaveValue('ready')
    await user.click(screen.getByRole('button', { name: 'Save product' }))
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ revision: 0, expectedInstallDate: null, patches: { glassReady: { mode: 'staff', value: { state: 'unknown', date: '2026-11-25', datePurpose: 'ready' } } } })))
  })
  it('claims only the changed field instead of saving every displayed default as staff-owned', async () => {
    render(<ProductEditor product={product} installers={[]} />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Notes', { exact: true }), 'One field')
    await user.click(screen.getByRole('button', { name: 'Save product' }))
    await waitFor(() => expect(mocks.save).toHaveBeenCalled())
    expect(mocks.save.mock.calls[0][0]).toEqual({ id: product.itemId, revision: 0, expectedInstallerId: null, expectedInstallDate: null, patches: { notes: { mode: 'staff', value: 'One field' } } })
  })
  it('can keep an already-Unknown field as staff intent, then restore just that field to automatic', async () => {
    render(<ProductEditor product={product} installers={[]} />)
    const user = userEvent.setup()
    await user.click(screen.getByText('Field ownership', { exact: true }))
    await user.click(screen.getByRole('button', { name: 'Keep staff value for Site ready' }))
    await user.click(screen.getByRole('button', { name: 'Save product' }))
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ patches: { siteReady: { mode: 'staff', value: 'unknown' } } })))
    await user.click(screen.getByRole('button', { name: 'Use automatic assessment for Site ready' }))
    await user.click(screen.getByRole('button', { name: 'Save product' }))
    await waitFor(() => expect(mocks.save).toHaveBeenLastCalledWith(expect.objectContaining({ revision: 1, patches: { siteReady: { mode: 'auto' } } })))
  })
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
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ id: product.itemId, revision: 0, patches: expect.objectContaining({ siteReady: { mode: 'staff', value: 'yes' }, bottleStrut: { mode: 'staff', value: 'no' }, buildingConsent: { mode: 'staff', value: 'na' }, notes: { mode: 'staff', value: 'Unsaved visit note' } }) }))
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
    expect(hasPendingProductEdits()).toBe(true)
    expect(hasPendingProductEdits(product.itemId!)).toBe(false)
    expect(hasPendingProductEdits('different-product')).toBe(true)
    view.rerender(<ProductDrafts><ProductEditor product={{ ...product, revision: 2 }} installers={[]} /></ProductDrafts>)
    expect(screen.getByLabelText('Notes', { exact: true })).toHaveValue('Preserve this after row removal')
  })
  it('keeps another removed product draft as a refresh blocker after the remaining product saves', async () => {
    const user = userEvent.setup(), other = { ...product, itemId: '40600000-0000-4000-8000-000000000021', label: 'Balustrade' }
    const view = render(<ProductDrafts><ProductEditor product={product} installers={[]} /></ProductDrafts>)
    await user.type(screen.getByLabelText('Notes', { exact: true }), 'Draft left outside this view')
    view.rerender(<ProductDrafts><ProductEditor key="other" product={other} installers={[]} /></ProductDrafts>)
    await user.type(screen.getByLabelText('Notes', { exact: true }), 'Save remaining product')
    await user.click(screen.getByRole('button', { name: 'Save product' }))
    await waitFor(() => expect(screen.getByText('Saved. Dashboard refresh waits for other product edits.')).toBeInTheDocument())
    expect(mocks.refresh).not.toHaveBeenCalled()
    expect(hasPendingProductEdits(other.itemId!)).toBe(true)
  })
  it('lets staff discard only an unmounted recovered draft after copying it, while protecting an open editor', async () => {
    const user = userEvent.setup()
    const view = render(<ProductDrafts><ProductEditor product={product} installers={[]} /></ProductDrafts>)
    await user.type(screen.getByLabelText('Notes', { exact: true }), 'Copy this recovered draft')
    await user.click(screen.getByText('TEST406 · Shower', { exact: true }))
    await user.click(screen.getByRole('button', { name: 'Discard draft for TEST406 Shower' }))
    expect(screen.getByLabelText('Notes', { exact: true })).toHaveValue('Copy this recovered draft')
    expect(hasPendingProductEdits()).toBe(true)
    expect(screen.getByText(/Use Reload saved version in its editor/)).toBeInTheDocument()
    view.rerender(<ProductDrafts><p>Product permanently removed</p></ProductDrafts>)
    expect((screen.getByLabelText('Recoverable draft for TEST406 Shower') as HTMLTextAreaElement).value).toContain('Copy this recovered draft')
    const other = { ...product, itemId: '40600000-0000-4000-8000-000000000021', label: 'Balustrade' }
    view.rerender(<ProductDrafts><ProductEditor key="other" product={other} installers={[]} /></ProductDrafts>)
    await user.type(screen.getByLabelText('Notes', { exact: true }), 'Keep the other draft')
    await user.click(screen.getByRole('button', { name: 'Discard draft for TEST406 Shower' }))
    expect(screen.queryByLabelText('Recoverable draft for TEST406 Shower')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Notes', { exact: true })).toHaveValue('Keep the other draft')
    expect(hasPendingProductEdits()).toBe(true)
    view.rerender(<ProductDrafts><p>Both products removed</p></ProductDrafts>)
    await user.click(screen.getByText('TEST406 · Balustrade', { exact: true }))
    await user.click(screen.getByRole('button', { name: 'Discard draft for TEST406 Balustrade' }))
    expect(hasPendingProductEdits()).toBe(false)
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
