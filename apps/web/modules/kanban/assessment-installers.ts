type InstallerAlias = { token: string; name?: string; id?: string }
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const aliasPattern = (text: string, identity = false) => {
  const name = text.normalize('NFC')
  if (!identity && /\p{Script=Han}/u.test(name)) return new RegExp(escape(name), 'giu')
  const boundary = identity || /\p{Script=Latin}/u.test(name) ? '\\p{Script=Latin}\\p{N}' : '\\p{L}\\p{N}'
  return new RegExp(`(?<![${boundary}_])${escape(name)}(?![${boundary}_])`, 'giu')
}

// Literal token-looking source text is not a trusted identity match. Only
// backend alias substitution (or its retained provenance) creates valid tokens.
export function tokenizeInstallers(value: string, installers: InstallerAlias[], trustedTokens: string[] = []) {
  const matched = new Set(trustedTokens.filter(token => installers.some(installer => installer.token === token)))
  let text = value.normalize('NFC').replace(/\bi\d+\b/g, token => matched.has(token) ? token : '[unresolved installer reference]')
  for (const installer of [...installers].sort((a, b) => (b.name?.length ?? 0) - (a.name?.length ?? 0))) {
    if (installer.name?.trim()) {
      const unique = installers.filter(other => other.name?.normalize('NFC').trim().toLowerCase() === installer.name!.normalize('NFC').trim().toLowerCase()).length === 1
      text = text.replace(aliasPattern(installer.name), (match: string, offset: number, input: string) => {
        const before = input.slice(0, offset), after = input.slice(offset + match.length)
        // Mask known CJK substrings for privacy, but do not claim a longer
        // person's name as this installer without a clear role/name boundary.
        const roleBounded = !/\p{Script=Han}/u.test(match) || ((!/\p{Script=Han}$/u.test(before) || /(?:安装人员|安装工|师傅|由|安排|指派|交给|负责人)[:：]?$/.test(before)) && (!/^\p{Script=Han}/u.test(after) || /^(?:负责|安装|已|将|进行|到场)/.test(after)))
        if (unique && roleBounded) matched.add(installer.token)
        return unique && roleBounded ? installer.token : '[unresolved installer]'
      })
    }
    if (installer.id) text = text.replace(aliasPattern(installer.id, true), () => { matched.add(installer.token); return installer.token })
  }
  return { text, installerTokens: [...matched].sort() }
}
