/**
 * Migration 010: Relax sapo_orders.order_number unique constraint.
 * Sapo cho phép 1 order_number xuất hiện nhiều lần (case cancel+recreate),
 * chỉ PK sapo_order_id mới phải unique.
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

const SQL = `
ALTER TABLE public.sapo_orders DROP CONSTRAINT IF EXISTS sapo_orders_order_number_store_unique;
CREATE INDEX IF NOT EXISTS idx_sapo_orders_order_number ON public.sapo_orders(order_number);
SELECT 'Dropped sapo_orders_order_number_store_unique, added idx_sapo_orders_order_number.' AS result;
`

const client = new pg.Client({ connectionString: CONNECTION_STRING })
await client.connect()
const result = await client.query(SQL)
const last = Array.isArray(result) ? result[result.length - 1] : result
console.log(last?.rows?.[0]?.result || 'done')
await client.end()
