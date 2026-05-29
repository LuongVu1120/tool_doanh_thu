/**
 * Migration 012: Tạo RPC rpc_channel_owner_context.
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

const SQL = fs.readFileSync('supabase/migrations/012_channel_owner_context.sql', 'utf-8')

const client = new pg.Client({ connectionString: CONNECTION_STRING })
await client.connect()
await client.query(SQL)
console.log('✅ Migration 012 applied: rpc_channel_owner_context created.')

const r = await client.query(
  `SELECT sapo_user_id FROM public.sapo_members
   WHERE is_media_team = true
      OR upper(prefix_code) = ANY (ARRAY['ADS','MEDIA','MKT','MARKETING','AGENCY','KOC','KOL','LIVESTREAM','TRAFFIC','VCB'])
   LIMIT 50;`
)
const ids = r.rows.map((x) => Number(x.sapo_user_id))
if (ids.length === 0) {
  console.log('ℹ️  Không có nhân viên media nào — bỏ qua smoke test.')
} else {
  const test = await client.query(
    `SELECT channel_branch_name, channel_alias, platform, total_orders,
            top_creator_name, top_creator_prefix, top_creator_orders, top_creator_is_media,
            top_media_creator_name, top_media_creator_orders
     FROM rpc_channel_owner_context($1::bigint[])
     LIMIT 8;`,
    [ids]
  )
  console.log(`✅ Smoke test (${test.rowCount} dòng đầu):`)
  console.table(test.rows)
}

await client.end()
