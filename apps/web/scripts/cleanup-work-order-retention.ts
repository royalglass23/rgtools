import { config } from 'dotenv'

config({ path: '../../.env.local' })
config({ path: '.env.local' })

async function main() {
  const { cleanupExpiredWorkOrderData } = await import('../modules/work-orders/retention')
  const result = await cleanupExpiredWorkOrderData()
  console.log(`Work Order retention cleanup complete: ${JSON.stringify(result)}`)
}

main().catch((error) => {
  console.error('Work Order retention cleanup failed.', error)
  process.exitCode = 1
})
