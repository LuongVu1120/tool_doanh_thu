import fs from 'fs'
import path from 'path'

const pg = require('pg')

const TABLES = [
  'revenue_adjustments',
  'returns',
  'orders',
  'return_imports',
  'revenue_imports',
] as const

function getConnectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL

  const migrationScript = fs.readFileSync(
    path.join(process.cwd(), 'scripts', 'run-migration-003.mjs'),
    'utf8'
  )
  const match = migrationScript.match(/CONNECTION_STRING\s*=\s*'([^']+)'/)
  if (!match) {
    throw new Error('DATABASE_URL is not set and no local migration connection string was found')
  }
  return match[1]
}

async function countRows(client: any) {
  const counts: Record<string, number> = {}
  for (const table of TABLES) {
    const result = await client.query(`SELECT COUNT(*)::int AS count FROM ${table}`)
    counts[table] = result.rows[0].count
  }
  return counts
}

async function main() {
  const client = new pg.Client({ connectionString: getConnectionString() })
  await client.connect()

  try {
    const before = await countRows(client)
    await client.query('BEGIN')
    await client.query(`
      TRUNCATE TABLE
        revenue_adjustments,
        returns,
        orders,
        return_imports,
        revenue_imports
      RESTART IDENTITY CASCADE
    `)
    await client.query('COMMIT')
    const after = await countRows(client)

    console.log(JSON.stringify({ before, after }, null, 2))
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
