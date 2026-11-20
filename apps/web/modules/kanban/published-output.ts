export const TABLE_A_SOURCE_HEADERS = ['WO', 'Customer', 'Short address', 'Approx install date', 'Within 3 weeks?']
export const TABLE_B_SOURCE_HEADERS = ['WO / client / address', 'Materials (per product)', 'Client waiting for', 'Site ready', 'Glass ready', 'Hardware ready', 'Design Y/N/?', 'PS1 / PS3', 'Bottle strut', 'BC?', 'Minor var?']
export type PublishedRow = { key: string; cells: string[] }
export type PublishedOutput = { jobs: PublishedRow[]; products: PublishedRow[] }
export function filterPublishedOutput(data: PublishedOutput, query: string): PublishedOutput {
  const q = query.trim().toLocaleLowerCase('en-NZ')
  const include = (row: PublishedRow) => !q || row.cells.some(value => value.toLocaleLowerCase('en-NZ').includes(q))
  return { jobs: data.jobs.filter(include), products: data.products.filter(include) }
}
