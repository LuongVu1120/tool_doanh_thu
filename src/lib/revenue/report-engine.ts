import {
  GOLDEN_APRIL_2026_EMPLOYEE_ORDER,
  GOLDEN_APRIL_2026_EMPLOYEE_TOTALS,
  GOLDEN_APRIL_2026_GRAND_TOTALS,
  GOLDEN_APRIL_2026_PERIOD,
} from './golden-april-2026'

export interface RevenueOrderInput {
  order_code: string
  source: string | null
  status: string | null
  channel_tag_matched: string | null
  employee_name: string | null
  completion_date: string | null
  total_amount: number | null
  recognized_amount?: number | null
  is_returned: boolean | null
  review_status?: 'none' | 'pending' | 'included' | 'excluded' | null
  period_locked?: boolean | null
}

export interface RevenueAdjustmentInput {
  id?: string
  period: string
  employee_name: string
  channel_group: string
  channel_name: string
  amount: number
  reason?: string | null
  source_label?: string | null
}

export interface RevenueReportRow {
  channelGroup: string
  channelName: string
  employeeName: string
  amount: number
  source: 'orders' | 'adjustment'
  orderCount: number
}

export interface RevenueReport {
  period: string
  rows: RevenueReportRow[]
  employeeTotals: Record<string, number>
  groupTotals: Record<string, number>
  grandTotal: number
  orderCount: number
  pendingReviewCount: number
  isLocked: boolean
}

export interface ReconciliationDiff {
  employeeName: string
  expected: number
  actual: number
  diff: number
}

export interface ReportEmployeeStat {
  employeeName: string
  name: string
  revenue: number
  orders: number
}

const COMPLETED_STATUS = 'Đã hoàn thành'
const UNASSIGNED_EMPLOYEE = 'CHƯA GÁN'
const GOLDEN_APRIL_2026_EMPLOYEE_SET = new Set<string>(GOLDEN_APRIL_2026_EMPLOYEE_ORDER)

export function getPeriodRange(period: string): { start: string; next: string } {
  const [year, month] = period.split('-').map(Number)
  const next = new Date(year, month, 1)
  return {
    start: `${period}-01`,
    next: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`,
  }
}

export function normalizeEmployeeName(name: string | null | undefined): string | null {
  const cleaned = name?.trim()
  if (!cleaned) return null
  const upper = cleaned.toUpperCase()

  const aliases: Record<string, string> = {
    'Q.ĐẠT': 'K.ĐẠT',
    'QUANG ĐẠT': 'K.ĐẠT',
    'HUYỀN TRANG': 'H.TRANG',
  }

  return aliases[upper] ?? upper
}

function classifyChannelGroup(source: string | null, channelName: string | null): string {
  const haystack = `${source ?? ''} ${channelName ?? ''}`.toLowerCase()
  if (haystack.includes('tiktok')) return 'TT'
  if (haystack.includes('zalo')) return 'ZALO'
  if (haystack.includes('instagram') || haystack.includes(' ig')) return 'IG'
  if (haystack.includes('youtube')) return 'YOUTUBE'
  if (haystack.includes('facebook') || haystack.includes('fb') || haystack.includes('page_')) return 'FB'
  if (source) return source.toUpperCase()
  return 'KHÁC'
}

function addAmount(map: Record<string, number>, key: string, amount: number) {
  map[key] = (map[key] ?? 0) + amount
}

function toAmount(value: string | number | null | undefined): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

export function buildRevenueReport(
  period: string,
  orders: RevenueOrderInput[],
  adjustments: RevenueAdjustmentInput[] = []
): RevenueReport {
  const rows: RevenueReportRow[] = []
  const employeeTotals: Record<string, number> = {}
  const groupTotals: Record<string, number> = {}
  let orderCount = 0
  let pendingReviewCount = 0
  let isLocked = false

  for (const order of orders) {
    if (order.period_locked) isLocked = true
    if (order.status !== COMPLETED_STATUS) continue
    if (order.is_returned) continue
    if (order.review_status === 'excluded') continue
    if (order.review_status === 'pending') {
      pendingReviewCount++
      continue
    }

    const employeeName = normalizeEmployeeName(order.employee_name)
    if (!employeeName || employeeName === UNASSIGNED_EMPLOYEE) {
      pendingReviewCount++
      continue
    }

    const amount = toAmount(order.recognized_amount ?? order.total_amount)
    if (amount === 0) continue

    const channelName = order.channel_tag_matched || order.source || 'Không rõ kênh'
    const channelGroup = classifyChannelGroup(order.source, channelName)

    rows.push({
      channelGroup,
      channelName,
      employeeName,
      amount,
      source: 'orders',
      orderCount: 1,
    })
    addAmount(employeeTotals, employeeName, amount)
    addAmount(groupTotals, channelGroup, amount)
    orderCount++
  }

  for (const adjustment of adjustments.filter((a) => a.period === period)) {
    const employeeName = normalizeEmployeeName(adjustment.employee_name) ?? adjustment.employee_name
    const amount = toAmount(adjustment.amount)
    if (amount === 0) continue

    rows.push({
      channelGroup: adjustment.channel_group,
      channelName: adjustment.channel_name,
      employeeName,
      amount,
      source: 'adjustment',
      orderCount: 0,
    })
    addAmount(employeeTotals, employeeName, amount)
    addAmount(groupTotals, adjustment.channel_group, amount)
  }

  for (const employeeName of GOLDEN_APRIL_2026_EMPLOYEE_ORDER) {
    employeeTotals[employeeName] ??= 0
  }

  const grandTotal = Object.values(employeeTotals).reduce((sum, amount) => sum + amount, 0)

  return {
    period,
    rows,
    employeeTotals,
    groupTotals,
    grandTotal,
    orderCount,
    pendingReviewCount,
    isLocked,
  }
}

export function isGoldenApril2026Employee(employeeName: string): boolean {
  return GOLDEN_APRIL_2026_EMPLOYEE_SET.has(normalizeEmployeeName(employeeName) ?? employeeName)
}

export function buildEmployeeStats(
  report: RevenueReport,
  options: { goldenPdfOnly?: boolean } = {}
): {
  employeeStats: ReportEmployeeStat[]
  extraEmployeeStats: ReportEmployeeStat[]
} {
  const orderCountByEmployee = new Map<string, number>()
  for (const row of report.rows.filter((r) => r.source === 'orders')) {
    orderCountByEmployee.set(
      row.employeeName,
      (orderCountByEmployee.get(row.employeeName) ?? 0) + row.orderCount
    )
  }

  const employeeStats: ReportEmployeeStat[] = []
  const extraEmployeeStats: ReportEmployeeStat[] = []

  for (const [name, revenue] of Object.entries(report.employeeTotals)) {
    if (revenue === 0) continue

    const stat = {
      employeeName: name,
      name,
      revenue,
      orders: orderCountByEmployee.get(name) ?? 0,
    }

    if (options.goldenPdfOnly && report.period === GOLDEN_APRIL_2026_PERIOD && !isGoldenApril2026Employee(name)) {
      extraEmployeeStats.push(stat)
    } else {
      employeeStats.push(stat)
    }
  }

  employeeStats.sort((a, b) => b.revenue - a.revenue)
  extraEmployeeStats.sort((a, b) => b.revenue - a.revenue)

  return { employeeStats, extraEmployeeStats }
}

export function reconcileWithGoldenApril2026(report: RevenueReport): {
  period: string
  matched: boolean
  diffs: ReconciliationDiff[]
  expectedGrandTotal: number
  actualGrandTotal: number
  grandTotalDiff: number
} {
  if (report.period !== GOLDEN_APRIL_2026_PERIOD) {
    throw new Error(`Golden PDF fixture only supports ${GOLDEN_APRIL_2026_PERIOD}`)
  }

  const names = new Set([
    ...GOLDEN_APRIL_2026_EMPLOYEE_ORDER,
    ...Object.keys(report.employeeTotals),
  ])

  const diffs = [...names].map((employeeName) => {
    const expected = GOLDEN_APRIL_2026_EMPLOYEE_TOTALS[employeeName] ?? 0
    const actual = report.employeeTotals[employeeName] ?? 0
    return { employeeName, expected, actual, diff: actual - expected }
  })

  const actualGrandTotal = report.grandTotal
  const expectedGrandTotal = GOLDEN_APRIL_2026_GRAND_TOTALS.employeeTotal
  const grandTotalDiff = actualGrandTotal - expectedGrandTotal
  const matched = grandTotalDiff === 0 && diffs.every((d) => d.diff === 0)

  return {
    period: report.period,
    matched,
    diffs,
    expectedGrandTotal,
    actualGrandTotal,
    grandTotalDiff,
  }
}
