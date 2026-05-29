'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  TrendingUp,
  Upload,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Lock,
  Unlock,
  Target,
  Package,
} from 'lucide-react'
import { RevenueBarChart } from '@/components/revenue/revenue-chart'
import {
  getCurrentPeriod,
  getPeriodLabel,
  getPreviousPeriod,
  getNextPeriod,
  formatCurrencyFull,
  formatCurrencyShort,
} from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

interface PersonalStats {
  period: string
  revenue: number
  orders: number
  isLocked: boolean
  kpiTarget: number | null
}

interface MonthlyRevenue {
  period: string
  label: string
  revenue: number
  orders: number
  isLocked: boolean
}

export default function RevenueDashboardPage() {
  const [currentPeriod, setCurrentPeriod] = useState(getCurrentPeriod())
  const [stats, setStats] = useState<PersonalStats | null>(null)
  const [history, setHistory] = useState<MonthlyRevenue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [currentPeriod]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`orders-dashboard-me-${currentPeriod}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        loadData()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentPeriod]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/revenue/dashboard/me?period=${currentPeriod}`)
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

  const kpiProgress =
    stats?.kpiTarget && stats.kpiTarget > 0
      ? Math.min(100, (stats.revenue / stats.kpiTarget) * 100)
      : null

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            Dashboard cá nhân
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">
            Doanh thu của bạn theo từng kỳ
          </p>
        </div>

        <Link
          href="/revenue/upload"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
        >
          <Upload className="w-4 h-4" />
          Upload dữ liệu
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-28 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse"
            />
          ))}
        </div>
      ) : error ? (
        <div className="p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      ) : (
        <>
          {/* Stats cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Revenue */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Doanh thu
                </p>
                <div className="w-7 h-7 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {formatCurrencyShort(stats?.revenue || 0)}
              </p>
              <p className="text-xs text-slate-400 mt-1">{formatCurrencyFull(stats?.revenue || 0)}</p>
              <div className="mt-2 flex items-center gap-1.5">
                {stats?.isLocked ? (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded-full">
                    <Lock className="w-2.5 h-2.5" />
                    Đã chốt
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded-full">
                    <Unlock className="w-2.5 h-2.5" />
                    Tạm tính
                  </span>
                )}
              </div>
            </div>

            {/* Orders */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Đơn hàng
                </p>
                <div className="w-7 h-7 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
                  <Package className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {stats?.orders || 0}
              </p>
              <p className="text-xs text-slate-400 mt-1">đơn hoàn thành</p>
            </div>

            {/* KPI Progress */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  KPI
                </p>
                <div className="w-7 h-7 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center">
                  <Target className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                </div>
              </div>
              {kpiProgress !== null ? (
                <>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {kpiProgress.toFixed(0)}%
                  </p>
                  <div className="mt-2 w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${
                        kpiProgress >= 100
                          ? 'bg-green-500'
                          : kpiProgress >= 70
                          ? 'bg-blue-500'
                          : 'bg-amber-500'
                      }`}
                      style={{ width: `${kpiProgress}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Mục tiêu: {formatCurrencyShort(stats?.kpiTarget || 0)}
                  </p>
                </>
              ) : (
                <p className="text-sm text-slate-400">Chưa đặt KPI</p>
              )}
            </div>
          </div>

          {/* Revenue chart */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
              Lịch sử doanh thu 6 tháng
            </h2>
            {history.length > 0 ? (
              <RevenueBarChart data={history} highlightPeriod={currentPeriod} />
            ) : (
              <div className="h-52 flex items-center justify-center text-sm text-slate-400">
                Chưa có dữ liệu
              </div>
            )}
          </div>

          {/* Quick links */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Link
              href="/revenue/team"
              className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700 transition group"
            >
              <p className="text-sm font-medium text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400">
                Dashboard Team →
              </p>
              <p className="text-xs text-slate-400 mt-0.5">Xem doanh thu toàn đội</p>
            </Link>

            <Link
              href="/revenue/upload"
              className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700 transition group"
            >
              <p className="text-sm font-medium text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400">
                Upload Excel →
              </p>
              <p className="text-xs text-slate-400 mt-0.5">Nhập dữ liệu tháng mới</p>
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
