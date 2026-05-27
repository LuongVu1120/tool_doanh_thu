import fs from 'fs'
import path from 'path'
import {
  parseExcelBuffer,
  runPipeline,
} from '../src/lib/sapo-parser/index'
import { dedupeByOrderCode, parseOrderAmount, parseSapoDate } from '../src/lib/sapo-parser/parse-excel'
import { parseMappingFile } from '../src/lib/sapo-parser/mapping-parser'
import { buildRevenueReport, reconcileWithGoldenApril2026 } from '../src/lib/revenue/report-engine'
import {
  GOLDEN_APRIL_2026_ADJUSTMENTS,
  GOLDEN_APRIL_2026_PERIOD,
} from '../src/lib/revenue/golden-april-2026'
import type { RevenueAdjustmentInput, RevenueOrderInput } from '../src/lib/revenue/report-engine'
import type { TagMappingResult } from '../src/types/sapo'

function readArrayBuffer(filePath: string): ArrayBuffer {
  const buf = fs.readFileSync(filePath)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

function formatDateOnly(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

async function main() {
  const samplesDir = path.resolve(process.cwd(), 'samples')
  const mappingFile = fs.readdirSync(samplesDir).find((name) => name.includes('MEDIA.xlsx'))
  if (!mappingFile) throw new Error('Missing MEDIA mapping sample file')

  const mapping = parseMappingFile(readArrayBuffer(path.join(samplesDir, mappingFile)))
  const ordersBuffer = readArrayBuffer(path.join(samplesDir, 'chua_loc.xlsx'))
  const pipelineResult = await runPipeline(ordersBuffer, {
    existingOrderCodes: new Set(),
    mappingLookup: mapping,
  })

  const recognizedByCode = new Map<string, TagMappingResult>(
    pipelineResult.processed.map((result) => [result.order.orderCode, result])
  )
  const noExtraExchangeCodes = new Set(
    pipelineResult.excluded
      .filter((entry) => entry.reason === 'exchange_no_extra')
      .map((entry) => entry.order.orderCode)
  )

  const orders: RevenueOrderInput[] = dedupeByOrderCode(parseExcelBuffer(ordersBuffer)).map((row) => {
    const recognized = row.orderCode ? recognizedByCode.get(row.orderCode) : null
    const completedAt = parseSapoDate(row.completedAt || '')
    const isNoExtraExchange = row.orderCode ? noExtraExchangeCodes.has(row.orderCode) : false
    const exchangeType =
      recognized?.exchangeStatus === 'needs_review' ? 'needs_review'
      : isNoExtraExchange ? 'no_extra'
      : recognized?.exchangeStatus === 'exchange_with_extra' ? 'with_extra'
      : 'none'
    const reviewStatus = exchangeType === 'needs_review' || (recognized && !recognized.employeeName)
      ? 'pending'
      : 'none'

    return {
      order_code: row.orderCode || '',
      source: row.source,
      status: row.status,
      channel_tag_matched: recognized?.channelTag ?? null,
      employee_name: recognized?.employeeName ?? null,
      completion_date: completedAt ? formatDateOnly(completedAt) : null,
      total_amount: parseOrderAmount(row.totalAmount),
      recognized_amount: reviewStatus === 'pending' || isNoExtraExchange ? 0 : recognized?.effectiveAmount ?? 0,
      is_returned: false,
      review_status: reviewStatus,
      period_locked: false,
    }
  })

  const adjustments: RevenueAdjustmentInput[] = GOLDEN_APRIL_2026_ADJUSTMENTS.map((adjustment) => ({
    period: adjustment.period,
    employee_name: adjustment.employeeName,
    channel_group: adjustment.channelGroup,
    channel_name: adjustment.channelName,
    amount: adjustment.amount,
    reason: adjustment.reason,
    source_label: adjustment.sourceLabel,
  }))

  const report = buildRevenueReport(GOLDEN_APRIL_2026_PERIOD, orders, adjustments)
  const reconciliation = reconcileWithGoldenApril2026(report)

  if (!reconciliation.matched) {
    console.error('Golden April 2026 reconciliation failed')
    console.error(JSON.stringify(reconciliation, null, 2))
    process.exit(1)
  }

  console.log('Golden April 2026 reconciliation passed')
  console.log({
    grandTotal: reconciliation.actualGrandTotal,
    orderCount: report.orderCount,
    adjustmentRows: adjustments.length,
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
