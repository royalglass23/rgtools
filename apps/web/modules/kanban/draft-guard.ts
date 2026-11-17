/** Coordinate mounted editors and retained drafts outside the current view. */
export function hasPendingProductEdits(exceptProductId?: string) {
  if (typeof document === 'undefined') return false
  return Array.from(document.querySelectorAll<HTMLElement>('[data-work-order-dirty="true"][data-work-order-product]'))
    .some(form => form.dataset.workOrderProduct !== exceptProductId)
}
