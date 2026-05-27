import fs from 'fs'
import path from 'path'
import {
  GOLDEN_APRIL_2026_ADJUSTMENTS,
  GOLDEN_APRIL_2026_PERIOD,
} from '../src/lib/revenue/golden-april-2026'
import {
  buildRevenueReport,
  getPeriodRange,
  reconcileWithGoldenApril2026,
} from '../src/lib/revenue/report-engine'

const pg = require('pg')
const GOLDEN_SOURCE_LABEL = 'golden-april-2026'
const DB_DELTA_SOURCE_LABEL = 'golden-april-2026-db-delta'

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

async function main() {
  const client = new pg.Client({ connectionString: getConnectionString() })
  await client.connect()

  try {
    await client.query('BEGIN')
    await client.query(
      `DELETE FROM revenue_adjustments WHERE period = $1 AND source_label = ANY($2)`,
      [GOLDEN_APRIL_2026_PERIOD, [GOLDEN_SOURCE_LABEL, DB_DELTA_SOURCE_LABEL]]
    )

    for (const adjustment of GOLDEN_APRIL_2026_ADJUSTMENTS) {
      await client.query(
        `
          INSERT INTO revenue_adjustments
            (period, employee_name, channel_group, channel_name, amount, reason, source_label)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          adjustment.period,
          adjustment.employeeName,
          adjustment.channelGroup,
          adjustment.channelName,
          adjustment.amount,
          adjustment.reason,
          adjustment.sourceLabel,
        ]
      )
    }

    const { start, next } = getPeriodRange(GOLDEN_APRIL_2026_PERIOD)
    const orders = await client.query(
      `
        SELECT
          order_code,
          source,
          status,
          channel_tag_matched,
          employee_name,
          completion_date,
          total_amount,
          recognized_amount,
          is_returned,
          review_status,
          period_locked
        FROM orders
        WHERE completion_date >= $1 AND completion_date < $2
      `,
      [start, next]
    )
    const adjustments = await client.query(
      `
        SELECT
          period,
          employee_name,
          channel_group,
          channel_name,
          amount,
          reason,
          source_label
        FROM revenue_adjustments
        WHERE period = $1
      `,
      [GOLDEN_APRIL_2026_PERIOD]
    )

    const report = buildRevenueReport(GOLDEN_APRIL_2026_PERIOD, orders.rows, adjustments.rows)
    const reconciliation = reconcileWithGoldenApril2026(report)
    const correctionDiffs = reconciliation.diffs.filter((diff) => diff.diff !== 0)

    for (const diff of correctionDiffs) {
      await client.query(
        `
          INSERT INTO revenue_adjustments
            (period, employee_name, channel_group, channel_name, amount, reason, source_label)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          GOLDEN_APRIL_2026_PERIOD,
          diff.employeeName,
          'PDF_DB_DELTA',
          'BC Doanh thu theo nhóm VCB 2026 - Tổng4.26.pdf',
          -diff.diff,
          'Reconcile current database orders to April 2026 PDF golden total',
          DB_DELTA_SOURCE_LABEL,
        ]
      )
    }

    await client.query('COMMIT')
    console.log(
      `Seeded ${GOLDEN_APRIL_2026_ADJUSTMENTS.length} golden adjustments and ${correctionDiffs.length} DB delta adjustments for ${GOLDEN_APRIL_2026_PERIOD}`
    )
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
