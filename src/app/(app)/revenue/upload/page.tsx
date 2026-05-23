'use client'

import { useState } from 'react'
import { UploadDropzone } from '@/components/revenue/upload-dropzone'
import { getCurrentPeriod, getPeriodLabel } from '@/lib/utils'
import {
  AlertCircle,
  ChevronLeft,
  Upload,
  CheckCircle2,
  Info,
  FileSpreadsheet,
  Users,
  RotateCcw,
} from 'lucide-react'
import Link from 'next/link'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FileType = 'orders' | 'mapping' | 'returns'
type Step = 'select' | 'configure' | 'preview' | 'done'

interface OrdersUploadState {
  file: File | null
  period: string
  importId: string | null
  stats: {
    totalRows: number
    filteredRows: number
    duplicatesSkipped: number
    exchangesExcluded: number
    needsReview: number
    finalOrders: number
  } | null
  error: string | null
  processing: boolean
}

interface MappingUploadState {
  file: File | null
  result: {
    importId: string
    totalRows: number
    totalEmployees: number
    totalChannels: number
    unassignedCount: number
    tagRowsInserted: number
  } | null
  error: string | null
  processing: boolean
}

interface ReturnsUploadState {
  file: File | null
  result: {
    importId: string
    totalReturns: number
    matchedCount: number
    unmatchedCount: number
  } | null
  error: string | null
  processing: boolean
}

// ---------------------------------------------------------------------------
// Tab button component
// ---------------------------------------------------------------------------
function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
  description,
}: {
  active: boolean
  onClick: () => void
  icon: React.ElementType
  label: string
  description: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-left transition w-full ${
        active
          ? 'bg-blue-50 dark:bg-blue-950 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
      }`}
    >
      <Icon
        className={`w-5 h-5 shrink-0 mt-0.5 ${
          active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'
        }`}
      />
      <div>
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function UploadPage() {
  const [activeTab, setActiveTab] = useState<FileType>('orders')

  // Per-tab state
  const [ordersState, setOrdersState] = useState<OrdersUploadState>({
    file: null,
    period: getCurrentPeriod(),
    importId: null,
    stats: null,
    error: null,
    processing: false,
  })
  const [ordersStep, setOrdersStep] = useState<Step>('select')

  const [mappingState, setMappingState] = useState<MappingUploadState>({
    file: null,
    result: null,
    error: null,
    processing: false,
  })

  const [returnsState, setReturnsState] = useState<ReturnsUploadState>({
    file: null,
    result: null,
    error: null,
    processing: false,
  })

  // -------------------------------------------------------------------------
  // Orders tab handlers
  // -------------------------------------------------------------------------
  function handleOrdersFileSelect(file: File) {
    setOrdersState((prev) => ({ ...prev, file, error: null }))
    setOrdersStep('configure')
  }

  async function handleOrdersProcess() {
    if (!ordersState.file) return
    setOrdersState((prev) => ({ ...prev, processing: true, error: null }))

    try {
      const formData = new FormData()
      formData.append('file', ordersState.file)
      formData.append('fileType', 'orders')
      formData.append('period', ordersState.period)

      const res = await fetch('/api/revenue/upload', { method: 'POST', body: formData })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || `Lỗi server: ${res.status}`)

      setOrdersState((prev) => ({
        ...prev,
        importId: data.importId,
        stats: data.stats ?? null,
        processing: false,
      }))
      setOrdersStep('done')
    } catch (e) {
      setOrdersState((prev) => ({
        ...prev,
        error: e instanceof Error ? e.message : 'Lỗi không xác định',
        processing: false,
      }))
    }
  }

  function handleOrdersCancel() {
    setOrdersState({
      file: null,
      period: getCurrentPeriod(),
      importId: null,
      stats: null,
      error: null,
      processing: false,
    })
    setOrdersStep('select')
  }

  // -------------------------------------------------------------------------
  // Mapping tab handlers
  // -------------------------------------------------------------------------
  function handleMappingFileSelect(file: File) {
    setMappingState((prev) => ({ ...prev, file, error: null, result: null }))
  }

  async function handleMappingUpload() {
    if (!mappingState.file) return
    setMappingState((prev) => ({ ...prev, processing: true, error: null }))

    try {
      const formData = new FormData()
      formData.append('file', mappingState.file)
      formData.append('fileType', 'mapping')

      const res = await fetch('/api/revenue/upload', { method: 'POST', body: formData })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || `Lỗi server: ${res.status}`)

      setMappingState((prev) => ({ ...prev, result: data, processing: false }))
    } catch (e) {
      setMappingState((prev) => ({
        ...prev,
        error: e instanceof Error ? e.message : 'Lỗi không xác định',
        processing: false,
      }))
    }
  }

  function handleMappingReset() {
    setMappingState({ file: null, result: null, error: null, processing: false })
  }

  // -------------------------------------------------------------------------
  // Returns tab handlers
  // -------------------------------------------------------------------------
  function handleReturnsFileSelect(file: File) {
    setReturnsState((prev) => ({ ...prev, file, error: null, result: null }))
  }

  async function handleReturnsUpload() {
    if (!returnsState.file) return
    setReturnsState((prev) => ({ ...prev, processing: true, error: null }))

    try {
      const formData = new FormData()
      formData.append('file', returnsState.file)
      formData.append('fileType', 'returns')

      const res = await fetch('/api/revenue/upload', { method: 'POST', body: formData })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || `Lỗi server: ${res.status}`)

      setReturnsState((prev) => ({ ...prev, result: data, processing: false }))
    } catch (e) {
      setReturnsState((prev) => ({
        ...prev,
        error: e instanceof Error ? e.message : 'Lỗi không xác định',
        processing: false,
      }))
    }
  }

  function handleReturnsReset() {
    setReturnsState({ file: null, result: null, error: null, processing: false })
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="max-w-4xl mx-auto">
      <Link
        href="/revenue"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-6 transition"
      >
        <ChevronLeft className="w-4 h-4" />
        Quay lại Dashboard
      </Link>

      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Upload dữ liệu</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
          Nhập dữ liệu từ Sapo: đơn hàng, danh sách kênh, và đơn trả hàng
        </p>
      </div>

      {/* Tab selector */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        <TabButton
          active={activeTab === 'orders'}
          onClick={() => setActiveTab('orders')}
          icon={FileSpreadsheet}
          label="Đơn hàng Sapo"
          description="chua_loc.xlsx / da_loc.xlsx"
        />
        <TabButton
          active={activeTab === 'mapping'}
          onClick={() => setActiveTab('mapping')}
          icon={Users}
          label="DANH SÁCH kênh"
          description="DANH_SACH_CAC_KENH_MEDIA.xlsx"
        />
        <TabButton
          active={activeTab === 'returns'}
          onClick={() => setActiveTab('returns')}
          icon={RotateCcw}
          label="Đơn trả hàng"
          description="order_return_export.xlsx"
        />
      </div>

      {/* ===================================================================
          ORDERS TAB
      =================================================================== */}
      {activeTab === 'orders' && (
        <OrdersTabContent
          step={ordersStep}
          state={ordersState}
          onFileSelect={handleOrdersFileSelect}
          onProcess={handleOrdersProcess}
          onCancel={handleOrdersCancel}
          onPeriodChange={(p) => setOrdersState((prev) => ({ ...prev, period: p }))}
        />
      )}

      {/* ===================================================================
          MAPPING TAB
      =================================================================== */}
      {activeTab === 'mapping' && (
        <MappingTabContent
          state={mappingState}
          onFileSelect={handleMappingFileSelect}
          onUpload={handleMappingUpload}
          onReset={handleMappingReset}
        />
      )}

      {/* ===================================================================
          RETURNS TAB
      =================================================================== */}
      {activeTab === 'returns' && (
        <ReturnsTabContent
          state={returnsState}
          onFileSelect={handleReturnsFileSelect}
          onUpload={handleReturnsUpload}
          onReset={handleReturnsReset}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Orders tab
// ---------------------------------------------------------------------------
function OrdersTabContent({
  step,
  state,
  onFileSelect,
  onProcess,
  onCancel,
  onPeriodChange,
}: {
  step: Step
  state: OrdersUploadState
  onFileSelect: (f: File) => void
  onProcess: () => void
  onCancel: () => void
  onPeriodChange: (p: string) => void
}) {
  const stepLabels: Record<Step, string> = {
    select: 'Chọn file',
    configure: 'Cấu hình',
    preview: 'Xem trước',
    done: 'Hoàn thành',
  }
  const stepOrder: Step[] = ['select', 'configure', 'preview', 'done']
  const currentStepIndex = stepOrder.indexOf(step)

  return (
    <div>
      {/* Step indicators */}
      <div className="flex items-center gap-0 mb-8">
        {stepOrder.map((s, idx) => (
          <div key={s} className="flex items-center">
            <div
              className={`flex items-center gap-2 ${
                idx <= currentStepIndex
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-slate-400 dark:text-slate-600'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  idx < currentStepIndex
                    ? 'bg-blue-600 text-white'
                    : idx === currentStepIndex
                    ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 ring-2 ring-blue-600'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                }`}
              >
                {idx < currentStepIndex ? '✓' : idx + 1}
              </div>
              <span className="text-xs font-medium hidden sm:block">{stepLabels[s]}</span>
            </div>
            {idx < stepOrder.length - 1 && (
              <div
                className={`w-8 sm:w-16 h-0.5 mx-2 ${
                  idx < currentStepIndex ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {state.error && <ErrorBanner message={state.error} />}

      {step === 'select' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-start gap-3 mb-5 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-100 dark:border-blue-900">
            <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <div className="text-xs text-blue-700 dark:text-blue-300">
              <p className="font-medium mb-1">Định dạng file Excel Sapo:</p>
              <ul className="space-y-0.5 list-disc list-inside">
                <li>File .xlsx hoặc .xls xuất từ Sapo</li>
                <li>Cột đọc theo TÊN (tự phát hiện header)</li>
                <li>Các cột cần có: Mã đơn hàng, Nguồn, Trạng thái đơn hàng, Tổng tiền, Tags, Ngày hoàn thành</li>
                <li>Lọc: Đã hoàn thành, không phải POS, không tag Bán trực tiếp</li>
              </ul>
            </div>
          </div>
          <UploadDropzone onFileSelect={onFileSelect} />
        </div>
      )}

      {step === 'configure' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-6">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
              Cấu hình xử lý
            </h2>
            <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700 rounded-lg mb-5">
              <div className="w-8 h-8 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center">
                <Upload className="w-4 h-4 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">
                  {state.file?.name}
                </p>
                <p className="text-xs text-slate-500">
                  {((state.file?.size || 0) / 1024).toFixed(1)} KB
                </p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Kỳ doanh thu
              </label>
              <input
                type="month"
                value={state.period}
                onChange={(e) => onPeriodChange(e.target.value)}
                className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-slate-500 mt-1">
                Chỉ lấy đơn hàng hoàn thành trong: {getPeriodLabel(state.period)}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-700">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
            >
              Chọn file khác
            </button>
            <button
              onClick={onProcess}
              disabled={state.processing}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {state.processing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Đang xử lý...
                </>
              ) : (
                'Xử lý file'
              )}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 dark:bg-green-900 rounded-2xl mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
              Nhập dữ liệu thành công!
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              Dữ liệu doanh thu {getPeriodLabel(state.period)} đã được lưu vào hệ thống.
            </p>
          </div>
          {state.stats && (
            <div className="grid grid-cols-3 gap-3 mb-6">
              <StatCard label="Tổng hàng" value={state.stats.totalRows} />
              <StatCard label="Sau lọc" value={state.stats.filteredRows} />
              <StatCard label="Bỏ trùng" value={state.stats.duplicatesSkipped} />
              <StatCard label="Đổi hàng loại" value={state.stats.exchangesExcluded} />
              <StatCard label="Cần xem lại" value={state.stats.needsReview} />
              <StatCard label="Đơn nhập" value={state.stats.finalOrders} />
            </div>
          )}
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
            >
              Upload tiếp
            </button>
            <Link
              href="/revenue"
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
            >
              Xem Dashboard
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Mapping tab
// ---------------------------------------------------------------------------
function MappingTabContent({
  state,
  onFileSelect,
  onUpload,
  onReset,
}: {
  state: MappingUploadState
  onFileSelect: (f: File) => void
  onUpload: () => void
  onReset: () => void
}) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
      <div className="flex items-start gap-3 mb-5 p-3 bg-amber-50 dark:bg-amber-950 rounded-lg border border-amber-100 dark:border-amber-900">
        <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-700 dark:text-amber-300">
          <p className="font-medium mb-1">File DANH_SACH_CAC_KENH_MEDIA.xlsx:</p>
          <ul className="space-y-0.5 list-disc list-inside">
            <li>3 cột: TÊN (nhân viên), ID (page/tiktok IDs), Kênh (tên hiển thị)</li>
            <li>Cột ID: nhiều ID ngăn cách bởi /, ,, hoặc &quot; và &quot;</li>
            <li>Upload mới sẽ thay thế mapping hiện tại</li>
          </ul>
        </div>
      </div>

      {state.error && <ErrorBanner message={state.error} />}

      {!state.result ? (
        <>
          <UploadDropzone onFileSelect={onFileSelect} />
          {state.file && (
            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700 rounded-lg flex-1 mr-4">
                <Upload className="w-4 h-4 text-slate-400 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {state.file.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {(state.file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
              <button
                onClick={onUpload}
                disabled={state.processing}
                className="flex items-center gap-2 px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              >
                {state.processing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Đang xử lý...
                  </>
                ) : (
                  'Upload Mapping'
                )}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-center w-14 h-14 bg-green-100 dark:bg-green-900 rounded-2xl mx-auto">
            <CheckCircle2 className="w-7 h-7 text-green-600 dark:text-green-400" />
          </div>
          <h3 className="text-center text-base font-bold text-slate-900 dark:text-white">
            Upload mapping thành công!
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Tổng hàng dữ liệu" value={state.result.totalRows} />
            <StatCard label="Nhân viên" value={state.result.totalEmployees} />
            <StatCard label="Kênh" value={state.result.totalChannels} />
            <StatCard label="Chưa gán" value={state.result.unassignedCount} />
            <StatCard label="Tag keys được index" value={state.result.tagRowsInserted} colSpan />
          </div>
          <div className="flex justify-center pt-2">
            <button
              onClick={onReset}
              className="px-4 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
            >
              Upload file mới
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Returns tab
// ---------------------------------------------------------------------------
function ReturnsTabContent({
  state,
  onFileSelect,
  onUpload,
  onReset,
}: {
  state: ReturnsUploadState
  onFileSelect: (f: File) => void
  onUpload: () => void
  onReset: () => void
}) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
      <div className="flex items-start gap-3 mb-5 p-3 bg-rose-50 dark:bg-rose-950 rounded-lg border border-rose-100 dark:border-rose-900">
        <Info className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
        <div className="text-xs text-rose-700 dark:text-rose-300">
          <p className="font-medium mb-1">File order_return_export.xlsx:</p>
          <ul className="space-y-0.5 list-disc list-inside">
            <li>Header tự động phát hiện (thử hàng 4 trước)</li>
            <li>Cột cần có: Mã đơn trả hàng, Mã đơn hàng, Tổng giá trị trả hàng, Lý do trả hàng</li>
            <li>Mã đơn hàng sẽ được đối chiếu với đơn hàng trong DB</li>
          </ul>
        </div>
      </div>

      {state.error && <ErrorBanner message={state.error} />}

      {!state.result ? (
        <>
          <UploadDropzone onFileSelect={onFileSelect} />
          {state.file && (
            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700 rounded-lg flex-1 mr-4">
                <Upload className="w-4 h-4 text-slate-400 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {state.file.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {(state.file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
              <button
                onClick={onUpload}
                disabled={state.processing}
                className="flex items-center gap-2 px-6 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              >
                {state.processing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Đang xử lý...
                  </>
                ) : (
                  'Upload Trả hàng'
                )}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-center w-14 h-14 bg-green-100 dark:bg-green-900 rounded-2xl mx-auto">
            <CheckCircle2 className="w-7 h-7 text-green-600 dark:text-green-400" />
          </div>
          <h3 className="text-center text-base font-bold text-slate-900 dark:text-white">
            Xử lý đơn trả hàng thành công!
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Tổng đơn trả" value={state.result.totalReturns} />
            <StatCard label="Đã khớp" value={state.result.matchedCount} />
            <StatCard label="Không khớp" value={state.result.unmatchedCount} />
          </div>
          {state.result.unmatchedCount > 0 && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950 rounded-lg border border-amber-200 dark:border-amber-800">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {state.result.unmatchedCount} đơn trả không tìm thấy mã đơn hàng gốc trong hệ thống.
                Kiểm tra lại file hoặc upload file đơn hàng trước.
              </p>
            </div>
          )}
          <div className="flex justify-center pt-2">
            <button
              onClick={onReset}
              className="px-4 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
            >
              Upload file mới
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared UI helpers
// ---------------------------------------------------------------------------
function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mb-6 flex items-start gap-3 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400">
      <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-medium">Đã xảy ra lỗi</p>
        <p className="text-xs mt-0.5">{message}</p>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  colSpan,
}: {
  label: string
  value: number
  colSpan?: boolean
}) {
  return (
    <div
      className={`p-3 bg-slate-50 dark:bg-slate-700 rounded-lg text-center ${
        colSpan ? 'col-span-2' : ''
      }`}
    >
      <p className="text-xl font-bold text-slate-900 dark:text-white">{value.toLocaleString()}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
    </div>
  )
}
