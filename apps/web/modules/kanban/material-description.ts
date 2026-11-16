export function shortMaterialDescription(value: string, limit = 80) {
  const text = value.replace(/\s+/g, ' ').trim() || 'Product description'
  if (text.length <= limit) return text
  const boundary = text.lastIndexOf(' ', limit - 1)
  return text.slice(0, boundary > limit / 2 ? boundary : limit - 1).trimEnd() + '…'
}
