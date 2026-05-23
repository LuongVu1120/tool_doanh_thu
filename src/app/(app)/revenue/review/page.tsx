'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, ChevronLeft, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { formatCurrencyFull, formatDateTime } from '@/lib/utils'
import { parseAmount } from '@/lib/sapo-parser/amount-parser'
import type { SapoOrder } from '@/types/sapo'

interface ReviewOrder extends SapoOrder {
  importId: string
  resolvedAmount?: number
  resolvedAction?: 'include' | 'exclude'
}

export default function ReviewPage() {
  const searchParams = useSearchParams()
  const importId = searchParams.get('importId')

  const [orders, setOrders] = useState<ReviewOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resolving, setResolving] = useState<string | null>(null)
  const [resolutions, setResolutions] = useState<Record<string, { action: 'include' | 'exclude'; amount?: number }>>({})
  const [amountInputs, setAmountInputs] = useState<Record<string, string>>({})
  const [amountErrors, setAmountErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!importId) {
      setLoading(false)
      return
    }
    loadOrders()
  }, [importId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadOrders() {
    setLoading(true)
    try {
      const res = await fetch(`/api/revenue/${importId}/needs-review`)
      if (!res.ok) throw new Error('Không thể tải dữ liệu')
      const data = await res.json()
      setOrders(data.orders || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi không xác định')
    } finally {
      setLoading(false)
    }
  }

  function handleAmountInput(orderCode: string, value: string) {
    setAmountInputs((prev) => ({ ...prev, [orderCode]: value }))
    setAmountErrors((prev) => ({ ...prev, [orderCode]: '' }))
  }

  function resolveInclude(orderCode: string) {
    const rawAmount = amountInputs[orderCode] || ''

    if (!rawAmount) {
      setAmountErrors((prev) => ({ ...prev, [orderCode]: 'Vui lòng nhập số tiền bù' }))
      return
    }

    const parsed = parseAmount(rawAmount)
    if (!parsed.parsed || parsed.value === null || parsed.value <= 0) {
      setAmountErrors((prev) => ({ ...prev, [orderCode]: `Không thể đọc số tiền: "${rawAmount}". Thử: "350k", "1tr350k"` }))
      return
    }

    setResolutions((prev) => ({
      ...prev,
      [orderCode]: { action: 'include', amount: parsed.value! },
    }))
  }

  function resolveExclude(orderCode: string) {
    setResolutions((prev) => ({
      ...prev,
      [orderCode]: { action: 'exclude' },
    }))
  }

  async function submitResolutions() {
    if (!importId) return

    const unresolvedOrders = orders.filter((o) => !resolutions[o.orderCode])
    if (unresolvedOrders.length > 0) {
      setError(`Còn ${unresolvedOrders.length} đơn chưa xử lý.`)
      return
    }

    setResolving('submitting')
    try {
      const res = await fetch(`/api/revenue/${importId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolutions }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Lỗi khi lưu')
      }

      // Redirect back to upload with confirmation
      window.location.href = `/revenue/upload?importId=${importId}&reviewDone=true`
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi không xác định')
    } finally {
      setResolving(null)
    }
  }

  const resolvedCount = Object.keys(resolutions).length
  const pendingCount = orders.length - resolvedCount

  if (!importId) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
          Không tìm thấy import ID
        </h2>
        <p className="text-slate-500 text-sm mb-4">
          Vui lòng truy cập từ trang Upload.
        </p>
        <Link href="/revenue/upload" className="text-blue-600 hover:underline text-sm">
          Đến trang Upload
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <Link
          href="/revenue/upload"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-4 transition"
        >
          <ChevronLeft className="w-4 h-4" />
          Quay lại Upload
        </Link>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          Xem xét đơn đổi hàng
        </h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Các đơn này cần xác nhận thủ công vì không thể tự động xác định số tiền bù
        </p>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-4 p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-slate-500">Tiến độ xử lý</span>
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
              {resolvedCount}/{orders.length} đơn
            </span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2">
            <div
              className="h-2 bg-blue-500 rounded-full transition-all"
              style={{ width: `${orders.length > 0 ? (resolvedCount / orders.length) * 100 : 0}%` }}
            />
          </div>
        </div>
        <button
          onClick={submitResolutions}
          disabled={pendingCount > 0 || resolving === 'submitting'}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {resolving === 'submitting' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CheckCircle2 className="w-4 h-4" />
          )}
          {pendingCount > 0 ? `Còn ${pendingCount} đơn` : 'Xác nhận tất cả'}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const resolution = resolutions[order.orderCode]
            const amountInput = amountInputs[order.orderCode] || ''
            const amountError = amountErrors[order.orderCode]

            return (
              <div
                key={order.orderCode}
                className={`bg-white dark:bg-slate-800 rounded-xl border p-5 ${
                  resolution
                    ? resolution.action === 'include'
                      ? 'border-green-300 dark:border-green-700'
                      : 'border-red-300 dark:border-red-700'
                    : 'border-yellow-300 dark:border-yellow-700'
                }`}
              >
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium text-slate-900 dark:text-white">
                        {order.orderCode}
                      </span>
                      <span className="text-xs px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300 rounded-full">
                        Cần xem xét
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {order.source} • {formatDateTime(order.completedAt instanceof Date ? order.completedAt.toISOString() : order.completedAt)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {formatCurrencyFull(order.totalAmount)}
                    </p>
                    <p className="text-xs text-slate-400">Tổng tiền gốc</p>
                  </div>
                </div>

                {/* Notes */}
                <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
                  <p className="text-xs font-medium text-slate-500 mb-1">Ghi chú:</p>
                  <p className="text-sm text-slate-700 dark:text-slate-300">
                    {order.notes || '(Không có ghi chú)'}
                  </p>
                </div>

                {/* Tags */}
                <div className="mb-4">
                  <p className="text-xs font-medium text-slate-500 mb-1">Tags:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {order.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs px-2 py-0.5 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded-full"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Resolution */}
                {!resolution ? (
                  <div className="border-t border-slate-100 dark:border-slate-700 pt-4">
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-3">
                      Xử lý đơn này:
                    </p>
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <input
                          type="text"
                          value={amountInput}
                          onChange={(e) => handleAmountInput(order.orderCode, e.target.value)}
                          placeholder="Số tiền bù (vd: 350k, 1tr350k)"
                          className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {amountError && (
                          <p className="text-xs text-red-500 mt-1">{amountError}</p>
                        )}
                      </div>
                      <button
                        onClick={() => resolveInclude(order.orderCode)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition whitespace-nowrap"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Ghi nhận
                      </button>
                      <button
                        onClick={() => resolveExclude(order.orderCode)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition whitespace-nowrap"
                      >
                        <XCircle className="w-4 h-4" />
                        Loại trừ
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="border-t border-slate-100 dark:border-slate-700 pt-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {resolution.action === 'include' ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                          <span className="text-sm text-green-700 dark:text-green-400">
                            Ghi nhận với số tiền bù:{' '}
                            <strong>{formatCurrencyFull(resolution.amount || 0)}</strong>
                          </span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-4 h-4 text-red-500" />
                          <span className="text-sm text-red-700 dark:text-red-400">
                            Loại trừ khỏi tính doanh thu
                          </span>
                        </>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setResolutions((prev) => {
                          const next = { ...prev }
                          delete next[order.orderCode]
                          return next
                        })
                      }}
                      className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline"
                    >
                      Hủy
                    </button>
                  </div>
                )}
              </div>
            )
          })}

          {orders.length === 0 && (
            <div className="text-center py-16 text-slate-400">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-green-400" />
              <p className="text-sm">Không có đơn nào cần xem xét</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
