'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  Users,
  Calendar,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Lock,
  Unlock,
} from 'lucide-react'
import { EmployeeRevenueChart, RevenueBarChart } from '@/components/revenue/revenue-chart'
import {
  getCurrentPeriod,
  getPeriodLabel,
  getPreviousPeriod,
  getNextPeriod,
  formatCurrencyFull,
  formatCurrencyShort,
} from '@/lib/utils'

interface EmployeeStats {
  employeeId: string
  employeeName: string
  revenue: number
  orders: number
  name: string
}

interface TeamStats {
  totalRevenue: number
  totalOrders: number
  isLocked: boolean
  employeeStats: EmployeeStats[]
  extraEmployeeStats?: EmployeeStats[]
  pendingReviewCount?: number
  reconciliation?: {
    matched: boolean
    expectedGrandTotal: number
    actualGrandTotal: number
    grandTotalDiff: number
    diffs: Array<{
      employeeName: string
      expected: number
      actual: number
      diff: number
    }>
  } | null
  mode?: 'standard' | 'pdf'
}

interface MonthlyRevenue {
  period: string
  label: string
  revenue: number
  orders: number
  isLocked: boolean
}

export default function TeamDashboardPage() {
  const searchParams = useSearchParams()
  const pdfMode = searchParams.get('mode') === 'pdf'
  const [currentPeriod, setCurrentPeriod] = useState(searchParams.get('period') || getCurrentPeriod())
  const [stats, setStats] = useState<TeamStats | null>(null)
  const [history, setHistory] = useState<MonthlyRevenue[]>([])
  const [loading, setLoading] = useState(true)
  const [importingAdjustments, setImportingAdjustments] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [currentPeriod]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const modeQuery = pdfMode ? '&mode=pdf' : ''
      const res = await fetch(`/api/revenue/dashboard/team?period=${currentPeriod}${modeQuery}`)
      if (!res.ok) throw new Error('Không thể tải dữ liệu')
      const data = await res.json()
      setStats(data.stats)
      setHistory(data.history)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi không xác định')
    } finally {
      setLoading(false)
    }
  }

  async function importGoldenAdjustments() {
    setImportingAdjustments(true)
    setError(null)
    try {
      const res = await fetch('/api/revenue/adjustments/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ useGoldenApril: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Không thể import adjustment PDF')
      await loadData()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi không xác định')
    } finally {
      setImportingAdjustments(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Dashboard Team</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">
            Doanh thu toàn đội Media
          </p>
        </div>
        <Link
          href="/revenue"
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          ← Về Dashboard cá nhân
        </Link>
      </div>

      {/* Period navigator */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setCurrentPeriod(getPreviousPeriod(currentPeriod))}
          className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
        >
          <ChevronLeft className="w-4 h-4 text-slate-500" />
        </button>

        <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
          <Calendar className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-900 dark:text-white">
            {getPeriodLabel(currentPeriod)}
          </span>
          {stats?.isLocked ? (
            <Lock className="w-3.5 h-3.5 text-slate-400" />
          ) : (
            <Unlock className="w-3.5 h-3.5 text-slate-400" />
          )}
        </div>

        <button
          onClick={() => {
            const next = getNextPeriod(currentPeriod)
            if (next <= getCurrentPeriod()) setCurrentPeriod(next)
          }}
          disabled={currentPeriod >= getCurrentPeriod()}
          className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronRight className="w-4 h-4 text-slate-500" />
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-28 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      ) : (
        <>
          {pdfMode && stats?.reconciliation && (
            <div
              className={`rounded-xl border p-4 text-sm ${
                stats.reconciliation.matched
                  ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-950 dark:border-green-800 dark:text-green-300'
                  : 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-300'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="font-semibold">
                  {stats.reconciliation.matched
                    ? 'Đã khớp PDF tháng 4'
                    : 'Chưa khớp PDF tháng 4'}
                </div>
                {!stats.reconciliation.matched && (
                  <button
                    type="button"
                    onClick={importGoldenAdjustments}
                    disabled={importingAdjustments}
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
                  >
                    {importingAdjustments ? 'Đang import...' : 'Import adjustment PDF'}
                  </button>
                )}
              </div>
              <div className="mt-1">
                Actual {formatCurrencyFull(stats.reconciliation.actualGrandTotal)} / Expected{' '}
                {formatCurrencyFull(stats.reconciliation.expectedGrandTotal)}
              </div>
              {!stats.reconciliation.matched && stats.reconciliation.diffs.length > 0 && (
                <div className="mt-2 text-xs">
                  Còn lệch {stats.reconciliation.diffs.length} nhân viên. Cần import adjustment PDF hoặc resolve đơn review.
                </div>
              )}
              {stats.extraEmployeeStats && stats.extraEmployeeStats.length > 0 && (
                <div className="mt-2 text-xs">
                  Có {stats.extraEmployeeStats.length} nhân viên ngoài danh sách PDF đang được tách riêng khỏi bảng xếp hạng.
                </div>
              )}
            </div>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Tổng doanh thu
                </p>
                <TrendingUp className="w-4 h-4 text-green-500" />
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {formatCurrencyShort(stats?.totalRevenue || 0)}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {formatCurrencyFull(stats?.totalRevenue || 0)}
              </p>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Tổng đơn hàng
                </p>
                <Users className="w-4 h-4 text-blue-500" />
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {stats?.totalOrders || 0}
              </p>
              <p className="text-xs text-slate-400 mt-1">đơn hoàn thành</p>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Nhân viên
                </p>
                <Users className="w-4 h-4 text-purple-500" />
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {stats?.employeeStats.length || 0}
              </p>
              <p className="text-xs text-slate-400 mt-1">có doanh thu</p>
            </div>
          </div>

          {/* Employee ranking */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Chart */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
                Doanh thu theo nhân viên
              </h2>
              {stats && stats.employeeStats.length > 0 ? (
                <EmployeeRevenueChart data={stats.employeeStats} />
              ) : (
                <div className="h-52 flex items-center justify-center text-sm text-slate-400">
                  Chưa có dữ liệu
                </div>
              )}
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
                Bảng xếp hạng
              </h2>
              <div className="space-y-2">
                {stats?.employeeStats
                  .sort((a, b) => b.revenue - a.revenue)
                  .map((emp, idx) => (
                    <div
                      key={emp.employeeId}
                      className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                    >
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          idx === 0
                            ? 'bg-yellow-100 text-yellow-700'
                            : idx === 1
                            ? 'bg-slate-200 text-slate-600'
                            : idx === 2
                            ? 'bg-orange-100 text-orange-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {emp.employeeName}
                        </p>
                        <p className="text-xs text-slate-400">{emp.orders} đơn</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">
                          {formatCurrencyShort(emp.revenue)}
                        </p>
                      </div>
                    </div>
                  ))}
                {(!stats?.employeeStats || stats.employeeStats.length === 0) && (
                  <p className="text-sm text-slate-400 text-center py-6">Chưa có dữ liệu</p>
                )}
              </div>
            </div>
          </div>

          {/* Team history chart */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
              Lịch sử doanh thu team (6 tháng)
            </h2>
            {history.length > 0 ? (
              <RevenueBarChart data={history} highlightPeriod={currentPeriod} />
            ) : (
              <div className="h-52 flex items-center justify-center text-sm text-slate-400">
                Chưa có dữ liệu
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
