/**
 * Run migration 009_sapo_first_class.sql lên Supabase.
 *
 * Usage:
 *   cd huyk-tools
 *   node scripts/run-migration-009.mjs
 *
 * Yêu cầu: cài pg (đã có sẵn trong devDependencies).
 */
import pg from 'pg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// Đọc DATABASE_URL từ .env nếu có, fallback connection string từ script cũ
const envContent = fs.readFileSync(path.join(ROOT, '.env'), 'utf-8')
const env = {}
for (const line of envContent.split('\n')) {
  if (!line || line.trim().startsWith('#')) continue
  const [key, ...vals] = line.split('=')
  if (key && vals.length) env[key.trim()] = vals.join('=').trim().replace(/^"|"$/g, '')
}

const CONNECTION_STRING =
  env.DATABASE_URL ||
  'postgresql://postgres.vwqzwlfbsluagyxfpime:LuongVD1120@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'

const migrationPath = path.join(ROOT, 'supabase', 'migrations', '009_sapo_first_class.sql')

async function main() {
  const client = new pg.Client({ connectionString: CONNECTION_STRING })
  console.log('Connecting to Supabase...')
  await client.connect()
  console.log('Connected.')

  console.log(`Running ${path.basename(migrationPath)}...`)
  const sql = fs.readFileSync(migrationPath, 'utf-8')

  try {
    const result = await client.query(sql)
    // result có thể là array hoặc object tùy số lượng statement
    if (Array.isArray(result)) {
      const last = result[result.length - 1]
      console.log('Result:', last?.rows?.[0]?.result || 'done')
    } else {
      console.log('Result:', result.rows?.[0]?.result || 'done')
    }
    console.log('\nMigration 009 applied successfully.')
  } catch (err) {
    console.error('FAILED:', err.message)
    if (err.position) console.error('Position:', err.position)
    process.exit(1)
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
