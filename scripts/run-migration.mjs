/**
 * Script chạy migration SQL lên Supabase
 * Usage: node scripts/run-migration.mjs
 */
import pg from 'pg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// Connection string từ Supabase (port 6543 = session pooler, 5432 = direct)
const CONNECTION_STRING = 'postgresql://postgres.vwqzwlfbsluagyxfpime:LuongVD1120@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'

async function runSqlFile(client, filePath, description) {
  console.log(`\n📄 Running: ${description}...`)
  const sql = fs.readFileSync(filePath, 'utf-8')
  
  try {
    await client.query(sql)
    console.log(`✅ ${description} — DONE`)
  } catch (err) {
    console.error(`❌ ${description} — FAILED:`, err.message)
    throw err
  }
}

async function main() {
  const client = new pg.Client({ connectionString: CONNECTION_STRING })
  
  try {
    console.log('🔌 Connecting to Supabase...')
    await client.connect()
    console.log('✅ Connected!')

    // Run Schema Migration
    await runSqlFile(
      client,
      path.join(ROOT, 'supabase', 'migrations', '001_initial_schema_v2.sql'),
      'Schema Migration (9 tables)'
    )

    // Run Seed Data
    await runSqlFile(
      client,
      path.join(ROOT, 'supabase', 'migrations', '002_seed_data.sql'),
      'Seed Data (27 channel tags)'
    )

    console.log('\n🎉 ALL DONE! Database is ready.')
    
    // Verify tables
    const { rows } = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `)
    console.log('\n📋 Tables created:')
    rows.forEach(r => console.log(`  - ${r.table_name}`))

    // Count tags
    const { rows: tagCount } = await client.query(
      `SELECT COUNT(*) as count FROM public.channel_tags WHERE is_active = true`
    )
    console.log(`\n🏷️  Channel tags seeded: ${tagCount[0].count}`)

  } catch (err) {
    console.error('\n💥 Migration failed:', err.message)
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()
