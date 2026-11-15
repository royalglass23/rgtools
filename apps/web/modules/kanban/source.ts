import { createServiceM8RequestFromEnv, type ServiceM8FetchRequest } from '@/lib/servicem8/client'

export function dashboardSourceRequest(request: ServiceM8FetchRequest = createServiceM8RequestFromEnv()): ServiceM8FetchRequest {
  return (path, init) => {
    if ((init?.method ?? 'GET').toUpperCase() !== 'GET' || init?.body || !/^\/(vendor|job|company|jobmaterial|material)(\.json|\/[a-zA-Z0-9-]+\.json)(\?|$)/.test(path)) {
      throw new Error('Dashboard source permits selected GET requests only.')
    }
    return request(path, { ...init, method: 'GET' })
  }
}

export async function verifyDashboardVendor(request: ServiceM8FetchRequest) {
  const response = await request('/vendor.json')
  if (!response.ok) throw new Error('ServiceM8 account could not be verified.')
  const data = await response.json()
  const vendor = Array.isArray(data) ? data[0] : data
  const name = String(vendor?.name ?? vendor?.company_name ?? '').trim()
  if (!/^royal glass(?:\s+(?:limited|ltd))?$/i.test(name)) throw new Error('The connected ServiceM8 account is not Royal Glass.')
}
