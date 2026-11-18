import { getVercelOidcToken } from '@vercel/oidc'
import { IdentityPoolClient, type IdentityPoolClientOptions } from 'google-auth-library'
import { StsCredentials } from 'google-auth-library/build/src/auth/stscredentials'

type Environment = Record<string, string | undefined>
const STS_URL = 'https://sts.googleapis.com/v1/token'
const READER = 'rgtools-kanban-reader@rg-tools-498600.iam.gserviceaccount.com'
const IMPERSONATION_URL = `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(READER)}:generateAccessToken`
const READ_SCOPES = ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/spreadsheets.readonly']
const CONFIG_ERROR = 'Kanban keyless Google access is not configured. Ask an administrator to check the workload identity connection.'
const IDENTITY_ERROR = 'The Vercel identity for Kanban is unavailable. Ask an administrator to check OIDC access before refreshing.'
const AUTH_ERROR = 'Kanban Google authorization could not be verified. Ask an administrator to check the workload identity connection.'

function configuration(env: Environment) {
  const project = env.KANBAN_GOOGLE_PROJECT_NUMBER, pool = env.KANBAN_GOOGLE_WORKLOAD_IDENTITY_POOL_ID, provider = env.KANBAN_GOOGLE_WORKLOAD_IDENTITY_PROVIDER_ID
  if (!project || !/^[1-9]\d{5,19}$/.test(project) || !pool || !/^[a-z][a-z0-9-]{3,31}$/.test(pool) || !provider || !/^[a-z][a-z0-9-]{3,31}$/.test(provider)) throw new Error(CONFIG_ERROR)
  return { audience: `//iam.googleapis.com/projects/${project}/locations/global/workloadIdentityPools/${pool}/providers/${provider}` }
}

async function currentIdentity() {
  try {
    // SDK owns request-context / rotating-file / env precedence. Never cache the raw token.
    const token = await getVercelOidcToken()
    if (!token) throw new Error()
    return token
  } catch { throw new Error(IDENTITY_ERROR) }
}

class BoundedIdentityPoolClient extends IdentityPoolClient {
  constructor(options: IdentityPoolClientOptions) {
    super(options)
    this.transporter.interceptors.request.add({ resolved: async request => {
      if (![STS_URL, IMPERSONATION_URL].includes(request.url.toString())) throw new Error(AUTH_ERROR)
      request.timeout = 10_000
      request.signal = AbortSignal.timeout(10_000)
      request.retry = false
      request.retryConfig = { retry: 0, noResponseRetries: 0, totalTimeout: 10_000 }
      request.redirect = 'error'
      request.maxRedirects = 0
      request.maxContentLength = 20_000
      return request
    } })
    // google-auth-library 11.3.4 creates a separate STS transport without options.
    // Use its typed SDK constructor to share the bounded transport; SDK still owns WIF.
    this.stsCredential = new StsCredentials({ tokenExchangeEndpoint: STS_URL, transporter: this.transporter })
  }
}

let cached: { audience: string; client: IdentityPoolClient } | undefined

export function keylessSourceConfigured(env: Environment = process.env) {
  try { configuration(env); return true } catch { return false }
}

export async function verifyPublishedSourceIdentity(env: Environment = process.env) {
  configuration(env)
  await currentIdentity() // Pre-trigger check only: no Google exchange and no cached raw token.
}

export async function getKeylessGoogleAccessToken(env: Environment = process.env) {
  const { audience } = configuration(env)
  try {
    if (cached?.audience !== audience) {
      cached = { audience, client: new BoundedIdentityPoolClient({
        type: 'external_account', audience, subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
        token_url: STS_URL, service_account_impersonation_url: IMPERSONATION_URL,
        scopes: READ_SCOPES, useAuthRequestParameters: false,
        transporterOptions: { timeout: 10_000, retry: false, redirect: 'error', maxRedirects: 0, fetchImplementation: (...args) => fetch(...args) },
        subject_token_supplier: { getSubjectToken: currentIdentity },
      }) }
    }
    // SDK caches only the expiring Google access token and re-invokes the supplier on refresh.
    const { token } = await cached.client.getAccessToken()
    if (!token) throw new Error()
    return token
  } catch { throw new Error(AUTH_ERROR) }
}
