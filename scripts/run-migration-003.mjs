/**
 * Run migration 003: Add mapping_imports, return_imports, returns tables
 */
import pg from 'pg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONNECTION_STRING = 'postgresql://postgres.vwqzwlfbsluagyxfpime:LuongVD1120@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'

async function main() {
  const client = new pg.Client({ connectionString: CONNECTION_STRING })
  
  try {
    await client.connect()
    console.log('✅ Connected')

    const sql = fs.readFileSync(
      path.join(__dirname, '..', 'supabase', 'migrations', '003_add_mapping_returns.sql'),
      'utf-8'
    )
    
    await client.query(sql)
    console.log('✅ Migration 003 complete!')

    // Verify
    const { rows } = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `)
    console.log('\n📋 All tables:')
    rows.forEach(r => console.log(`  - ${r.table_name}`))

  } catch (err) {
    console.error('❌', err.message)
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()
