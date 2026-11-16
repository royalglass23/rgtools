/** Coordinate refresh across all mounted product editors in this browser tab. */
export function hasPendingProductEdits(exceptProductId?: string) {
  if (typeof document === 'undefined') return false
  return Array.from(document.querySelectorAll<HTMLFormElement>('form[data-work-order-dirty="true"]'))
    .some(form => form.dataset.workOrderProduct !== exceptProductId)
}
