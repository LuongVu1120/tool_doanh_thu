/**
 * Migration 011: Tạo RPC rpc_suggest_channel_owners.
 */
import pg from 'pg'
import fs from 'fs'

const env = {}
for (const line of fs.readFileSync('.env', 'utf-8').split('\n')) {
  const [k, ...v] = line.split('=')
  if (k) env[k.trim()] = v.join('=').trim().replace(/^"|"$/g, '')
}

const CONNECTION_STRING =
  env.DATABASE_URL ||
  'postgresql://postgres.vwqzwlfbsluagyxfpime:LuongVD1120@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'

const SQL = fs.readFileSync('supabase/migrations/011_suggest_channel_owners.sql', 'utf-8')

const client = new pg.Client({ connectionString: CONNECTION_STRING })
await client.connect()
await client.query(SQL)
console.log('✅ Migration 011 applied: rpc_suggest_channel_owners created.')

// Quick smoke test (chỉ chạy nếu có member nào đã được mark is_media_team)
const r = await client.query(
  `SELECT sapo_user_id FROM public.sapo_members WHERE is_media_team = true LIMIT 50;`
)
const ids = r.rows.map((x) => Number(x.sapo_user_id))
if (ids.length === 0) {
  console.log('ℹ️  Chưa có sapo_members nào is_media_team=true — bỏ qua smoke test.')
} else {
  const test = await client.query(`SELECT * FROM rpc_suggest_channel_owners($1::bigint[], 1) LIMIT 5;`, [ids])
  console.log(`✅ Smoke test thành công, trả về ${test.rowCount} dòng đầu:`)
  console.table(test.rows)
}

await client.end()
