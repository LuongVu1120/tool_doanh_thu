import fs from 'fs'
import path from 'path'
import {
  buildRevenueReport,
  getPeriodRange,
  reconcileWithGoldenApril2026,
  RevenueAdjustmentInput,
  RevenueOrderInput,
} from '../src/lib/revenue/report-engine'
import { GOLDEN_APRIL_2026_PERIOD } from '../src/lib/revenue/golden-april-2026'

const pg = require('pg')

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
  const period = process.argv[2] ?? GOLDEN_APRIL_2026_PERIOD
  const { start, next } = getPeriodRange(period)
  const client = new pg.Client({ connectionString: getConnectionString() })
  await client.connect()

  try {
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
          id,
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
      [period]
    )

    const report = buildRevenueReport(
      period,
      orders.rows as RevenueOrderInput[],
      adjustments.rows as RevenueAdjustmentInput[]
    )
    const reconciliation = reconcileWithGoldenApril2026(report)

    console.log(JSON.stringify({
      matched: reconciliation.matched,
      actualGrandTotal: reconciliation.actualGrandTotal,
      expectedGrandTotal: reconciliation.expectedGrandTotal,
      grandTotalDiff: reconciliation.grandTotalDiff,
      orderCount: report.orderCount,
      pendingReviewCount: report.pendingReviewCount,
      adjustmentRows: adjustments.rowCount,
      diffs: reconciliation.diffs.filter((diff) => diff.diff !== 0),
    }, null, 2))

    if (!reconciliation.matched) process.exitCode = 1
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
