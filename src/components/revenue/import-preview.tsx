'use client'

import { useState } from 'react'
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
} from 'lucide-react'
import { cn, formatCurrencyFull, formatDateTime } from '@/lib/utils'
import type { PipelineResult, TagMappingResult } from '@/types/sapo'

interface ImportPreviewProps {
  pipelineResult: PipelineResult
  onConfirm: () => void
  onCancel: () => void
  isConfirming?: boolean
}

function StatCard({
  label,
  value,
  color = 'default',
}: {
  label: string
  value: number | string
  color?: 'default' | 'green' | 'red' | 'yellow'
}) {
  const colorClasses = {
    default: 'bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white',
    green: 'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300',
    red: 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300',
    yellow: 'bg-yellow-50 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-300',
  }

  return (
    <div
      className={cn(
        'rounded-xl p-4 border border-slate-200 dark:border-slate-700',
        colorClasses[color]
      )}
    >
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs mt-0.5 opacity-70">{label}</p>
    </div>
  )
}

function OrderRow({ result }: { result: TagMappingResult }) {
  const exchangeLabel = {
    normal: null,
    exchange_no_extra: { label: 'Đổi - Không thu', color: 'bg-red-100 text-red-700' },
    exchange_with_extra: { label: 'Đổi - Bù tiền', color: 'bg-orange-100 text-orange-700' },
    needs_review: { label: 'Cần xem xét', color: 'bg-yellow-100 text-yellow-700' },
  }[result.exchangeStatus]

  return (
    <tr className="border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50">
      <td className="py-2.5 px-3 text-xs font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
        {result.order.orderCode}
      </td>
      <td className="py-2.5 px-3 text-xs text-slate-700 dark:text-slate-300">
        {result.order.source}
      </td>
      <td className="py-2.5 px-3 text-xs text-slate-700 dark:text-slate-300">
        {result.channelTag || (
          <span className="text-slate-400 italic">Chưa map</span>
        )}
      </td>
      <td className="py-2.5 px-3 text-xs text-slate-700 dark:text-slate-300">
        {result.employeeName || (
          <span className="text-slate-400 italic">–</span>
        )}
      </td>
      <td className="py-2.5 px-3 text-xs text-right font-medium text-slate-900 dark:text-white whitespace-nowrap">
        {formatCurrencyFull(result.effectiveAmount)}
      </td>
      <td className="py-2.5 px-3 text-xs whitespace-nowrap">
        {exchangeLabel ? (
          <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', exchangeLabel.color)}>
            {exchangeLabel.label}
          </span>
        ) : (
          <span className="text-slate-400">–</span>
        )}
      </td>
      <td className="py-2.5 px-3 text-xs text-slate-500 whitespace-nowrap">
        {formatDateTime(result.order.completedAt instanceof Date ? result.order.completedAt.toISOString() : result.order.completedAt)}
      </td>
    </tr>
  )
}

export function ImportPreview({
  pipelineResult,
  onConfirm,
  onCancel,
  isConfirming,
}: ImportPreviewProps) {
  const [showOrders, setShowOrders] = useState(true)
  const [showDuplicates, setShowDuplicates] = useState(false)
  const [showExcluded, setShowExcluded] = useState(false)
  const [showNeedsReview, setShowNeedsReview] = useState(true)

  const { stats, processed, duplicates, excluded, needsReview } = pipelineResult

  const totalRevenue = processed.reduce((sum, r) => sum + r.effectiveAmount, 0)
  const hasIssues = stats.needsReview > 0

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Tổng hàng Excel" value={stats.totalRows} />
        <StatCard label="Sau lọc" value={stats.filteredRows} color="default" />
        <StatCard label="Bỏ trùng DB" value={stats.duplicatesSkipped} color={stats.duplicatesSkipped > 0 ? 'yellow' : 'default'} />
        <StatCard label="Đổi hàng (loại)" value={stats.exchangesExcluded} color={stats.exchangesExcluded > 0 ? 'red' : 'default'} />
        <StatCard label="Cần xem xét" value={stats.needsReview} color={stats.needsReview > 0 ? 'yellow' : 'default'} />
        <StatCard label="Đơn hợp lệ" value={stats.finalOrders} color="green" />
      </div>

      {/* Revenue summary */}
      <div className="bg-green-50 dark:bg-green-950 rounded-xl p-4 border border-green-200 dark:border-green-800">
        <p className="text-sm text-green-700 dark:text-green-300 font-medium">
          Tổng doanh thu dự kiến
        </p>
        <p className="text-3xl font-bold text-green-800 dark:text-green-200 mt-1">
          {formatCurrencyFull(totalRevenue)}
        </p>
        <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
          Từ {stats.finalOrders} đơn hàng hợp lệ
        </p>
      </div>

      {/* Needs review warning */}
      {hasIssues && (
        <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                Có {stats.needsReview} đơn cần xem xét
              </p>
              <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                Các đơn đổi hàng này không thể tự động xác định số tiền. Vui lòng xem lại trước
                khi xác nhận.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Orders table */}
      <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowOrders(!showOrders)}
          className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            Đơn hàng hợp lệ ({stats.finalOrders})
          </div>
          {showOrders ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showOrders && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  {['Mã đơn', 'Nguồn', 'Tag kênh', 'Nhân viên', 'Doanh thu', 'Loại', 'Ngày HT'].map(
                    (h) => (
                      <th
                        key={h}
                        className="py-2 px-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {processed.map((result) => (
                  <OrderRow key={result.order.orderCode} result={result} />
                ))}
              </tbody>
            </table>
            {processed.length === 0 && (
              <p className="text-center py-8 text-sm text-slate-400">Không có đơn hàng nào</p>
            )}
          </div>
        )}
      </div>

      {/* Duplicates */}
      {duplicates.length > 0 && (
        <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowDuplicates(!showDuplicates)}
            className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
          >
            <div className="flex items-center gap-2">
              <Copy className="w-4 h-4 text-slate-400" />
              Đơn bỏ qua (đã có trong DB) ({duplicates.length})
            </div>
            {showDuplicates ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showDuplicates && (
            <div className="p-4 flex flex-wrap gap-2">
              {duplicates.map((code) => (
                <span
                  key={code}
                  className="text-xs font-mono px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded"
                >
                  {code}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Excluded (exchange no extra) */}
      {excluded.length > 0 && (
        <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowExcluded(!showExcluded)}
            className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
          >
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-400" />
              Đơn loại trừ (đổi hàng không thu) ({excluded.length})
            </div>
            {showExcluded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showExcluded && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    {['Mã đơn', 'Nguồn', 'Tổng tiền', 'Lý do', 'Ghi chú'].map((h) => (
                      <th
                        key={h}
                        className="py-2 px-3 text-left text-xs font-semibold text-slate-500"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {excluded.map(({ order, reason }) => (
                    <tr
                      key={order.orderCode}
                      className="border-b border-slate-100 dark:border-slate-700"
                    >
                      <td className="py-2 px-3 text-xs font-mono text-slate-500">
                        {order.orderCode}
                      </td>
                      <td className="py-2 px-3 text-xs text-slate-500">{order.source}</td>
                      <td className="py-2 px-3 text-xs text-slate-500">
                        {formatCurrencyFull(order.totalAmount)}
                      </td>
                      <td className="py-2 px-3 text-xs">
                        <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs">
                          {reason === 'exchange_no_extra' ? 'Đổi không thu' : reason}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-xs text-slate-400 max-w-xs truncate">
                        {order.notes || '–'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Needs review */}
      {needsReview.length > 0 && (
        <div className="border border-yellow-200 dark:border-yellow-800 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowNeedsReview(!showNeedsReview)}
            className="w-full flex items-center justify-between px-4 py-3 bg-yellow-50 dark:bg-yellow-950 text-sm font-medium text-yellow-800 dark:text-yellow-200"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
              Cần xem xét ({needsReview.length})
            </div>
            {showNeedsReview ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showNeedsReview && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-yellow-200 dark:border-yellow-700">
                    {['Mã đơn', 'Tổng tiền', 'Ghi chú', 'Tags'].map((h) => (
                      <th
                        key={h}
                        className="py-2 px-3 text-left text-xs font-semibold text-yellow-700 dark:text-yellow-300"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {needsReview.map((order) => (
                    <tr
                      key={order.orderCode}
                      className="border-b border-yellow-100 dark:border-yellow-900"
                    >
                      <td className="py-2 px-3 text-xs font-mono text-yellow-800 dark:text-yellow-200">
                        {order.orderCode}
                      </td>
                      <td className="py-2 px-3 text-xs text-yellow-700 dark:text-yellow-300">
                        {formatCurrencyFull(order.totalAmount)}
                      </td>
                      <td className="py-2 px-3 text-xs text-yellow-600 dark:text-yellow-400 max-w-xs">
                        {order.notes || '–'}
                      </td>
                      <td className="py-2 px-3 text-xs text-yellow-600 dark:text-yellow-400 max-w-xs truncate">
                        {order.rawTags || '–'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-700">
        <button
          onClick={onCancel}
          disabled={isConfirming}
          className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition disabled:opacity-50"
        >
          Hủy bỏ
        </button>

        <div className="flex items-center gap-3">
          {hasIssues && (
            <a
              href="./review"
              className="flex items-center gap-1.5 px-4 py-2 text-sm border border-yellow-300 dark:border-yellow-700 text-yellow-700 dark:text-yellow-300 rounded-lg hover:bg-yellow-50 dark:hover:bg-yellow-950 transition"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Xem xét {stats.needsReview} đơn
            </a>
          )}
          <button
            onClick={onConfirm}
            disabled={isConfirming}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isConfirming ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Đang lưu...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Xác nhận nhập ({stats.finalOrders} đơn)
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
