/**
 * Test các phương án xác thực Sapo với credentials hiện có.
 *
 * Script này thử 3 cách auth phổ biến mà Sapo hỗ trợ:
 *   1. HTTP Basic Auth với API_KEY:API_SECRET (kiểu Private App cổ điển)
 *   2. Header X-Sapo-Access-Token = API_SECRET
 *   3. Header X-Sapo-Access-Token = API_KEY
 *
 * Cách chạy:
 *   cd huyk-tools
 *   node scripts/test-sapo-auth.mjs
 *
 * Trước khi chạy, đảm bảo .env có đủ 3 biến:
 *   SAPO_STORE=<tên-shop>           (vd: vienchibao)
 *   SAPO_API_KEY=<api-key-sếp-gửi>
 *   SAPO_API_SECRET=<api-secret-sếp-gửi>
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const envPath = path.join(ROOT, '.env')
const envContent = fs.readFileSync(envPath, 'utf-8')
const env = {}
for (const line of envContent.split('\n')) {
  if (!line || line.trim().startsWith('#')) continue
  const [key, ...vals] = line.split('=')
  if (key && vals.length) env[key.trim()] = vals.join('=').trim().replace(/^"|"$/g, '')
}

const store = env.SAPO_STORE
const apiKey = env.SAPO_API_KEY
const apiSecret = env.SAPO_API_SECRET

if (!store || store === 'your-shop-name') {
  console.error('Thiếu SAPO_STORE trong .env (vd: vienchibao)')
  process.exit(1)
}
if (!apiKey || apiKey === 'your-api-key') {
  console.error('Thiếu SAPO_API_KEY trong .env')
  process.exit(1)
}
if (!apiSecret || apiSecret === 'your-api-secret') {
  console.error('Thiếu SAPO_API_SECRET trong .env')
  process.exit(1)
}

const host = `${store}.mysapo.net`
const endpoint = `https://${host}/admin/orders.json?limit=1&status=any`

console.log('================================================')
console.log(' Sapo Auth Tester')
console.log('================================================')
console.log(` Shop:       https://${host}`)
console.log(` Endpoint:   ${endpoint}`)
console.log(` API Key:    ${maskSecret(apiKey)}`)
console.log(` API Secret: ${maskSecret(apiSecret)}`)
console.log('================================================\n')

const attempts = [
  {
    name: '1) HTTP Basic Auth (apikey:apisecret)',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${apiKey}:${apiSecret}`).toString('base64'),
      Accept: 'application/json',
    },
  },
  {
    name: '2) Header X-Sapo-Access-Token = API_SECRET',
    headers: {
      'X-Sapo-Access-Token': apiSecret,
      Accept: 'application/json',
    },
  },
  {
    name: '3) Header X-Sapo-Access-Token = API_KEY',
    headers: {
      'X-Sapo-Access-Token': apiKey,
      Accept: 'application/json',
    },
  },
]

let firstWorking = null

for (const attempt of attempts) {
  console.log(`>>> ${attempt.name}`)
  try {
    const res = await fetch(endpoint, { headers: attempt.headers })
    const text = await res.text()
    let preview = text
    try {
      const json = JSON.parse(text)
      const orderCount = Array.isArray(json.orders) ? json.orders.length : '?'
      preview = `orders.length = ${orderCount}`
      if (json.errors) preview += ` | errors = ${JSON.stringify(json.errors)}`
    } catch {
      preview = text.slice(0, 200)
    }
    console.log(`    Status:  ${res.status} ${res.statusText}`)
    console.log(`    Body:    ${preview}\n`)
    if (res.ok && !firstWorking) firstWorking = attempt.name
  } catch (err) {
    console.log(`    Lỗi network: ${err.message}\n`)
  }
}

console.log('================================================')
if (firstWorking) {
  console.log(` THÀNH CÔNG: ${firstWorking}`)
  console.log(' -> Báo lại cho AI để chỉnh code chính theo cách auth này.')
} else {
  console.log(' KHÔNG CÓ CÁCH NÀO HOẠT ĐỘNG')
  console.log(' -> Có thể là OAuth App (cần luồng OAuth + redirect_uri).')
  console.log(' -> Hoặc App chưa được cài đặt vào shop / chưa cấp scope read_orders.')
}
console.log('================================================')

function maskSecret(s) {
  if (!s) return '(empty)'
  if (s.length <= 8) return '*'.repeat(s.length)
  return s.slice(0, 4) + '...' + s.slice(-4)
}
