/**
 * Test fetchSapoOrders (code chính, đã hỗ trợ Basic Auth).
 *
 * Cách chạy:
 *   cd huyk-tools
 *   npx tsx scripts/test-sapo-fetch.ts
 */
import { fetchSapoOrders, getEnvSapoConnection } from '../src/lib/sapo-api/client'

async function main() {
  const conn = getEnvSapoConnection()
  if (!conn) {
    console.error('Không đọc được env Sapo. Cần SAPO_STORE + (SAPO_API_KEY + SAPO_API_SECRET) hoặc SAPO_ACCESS_TOKEN.')
    process.exit(1)
  }

  const mode = conn.api_key && conn.api_secret ? 'Basic Auth (Private App)' : 'X-Sapo-Access-Token (OAuth)'
  console.log('================================================')
  console.log(' Test fetchSapoOrders (code chính)')
  console.log('================================================')
  console.log(` Store: ${conn.store}.mysapo.net`)
  console.log(` Mode:  ${mode}`)
  console.log(` Scopes: ${conn.scopes}`)
  console.log('------------------------------------------------\n')

  const response = await fetchSapoOrders({
    store: conn.store,
    accessToken: conn.access_token,
    apiKey: conn.api_key ?? null,
    apiSecret: conn.api_secret ?? null,
    page: 1,
    limit: 5,
  })

  const orders = response.orders || []
  console.log(`Số đơn lấy về: ${orders.length}`)
  if (orders.length === 0) {
    console.log('Shop chưa có đơn nào (hoặc bị filter ra theo điều kiện).')
  } else {
    for (const o of orders.slice(0, 5)) {
      console.log(` - id=${o.id} name=${o.name} total=${o.total_price} status=${o.financial_status} created_on=${o.created_on}`)
    }
  }
  console.log('\nfetchSapoOrders OK (không throw).')
}

main().catch((err) => {
  console.error('Lỗi khi fetchSapoOrders:', err.message)
  process.exit(1)
})
