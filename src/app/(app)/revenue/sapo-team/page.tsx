'use client'

import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  useSaveChannelAssignments,
  useSaveMediaToggles,
  useSapoChannels,
  useSapoDashboard,
  useSapoMembers,
  useSapoV2Sync,
} from '@/hooks/use-sapo-v2'
import {
  fetchSapoChannelContexts,
  sapoV2Keys,
} from '@/lib/sapo-v2/queries'
import type { ChannelContext, ChannelView, DashboardData, MemberView } from '@/types/sapo-v2-ui'
import {
  RefreshCw,
  TrendingUp,
  Users,
  Hash,
  AlertCircle,
  Save,
  CheckCircle2,
  Search,
  SlidersHorizontal,
  Building2,
  Calendar,
  ExternalLink,
  DollarSign,
  ChevronRight,
  ArrowUpRight,
  Sparkles,
  Layers,
  Percent,
  Check,
  Facebook,
  Smartphone,
  Store,
  Globe,
  ShoppingBag,
  HelpCircle,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

// ===== Types =====
// ChannelView, MemberView, DashboardData, ChannelContext imported from @/types/sapo-v2-ui

// ===== Helpers =====

function formatMoney(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} tỷ`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return n.toLocaleString('vi-VN')
}

function formatFullMoney(n: number): string {
  return n.toLocaleString('vi-VN') + ' ₫'
}

function startOfDay(d: Date): string {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x.toISOString()
}

function endOfDay(d: Date): string {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x.toISOString()
}

function monthValue(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthStartIso(month: string): string {
  const [year, monthIndex] = month.split('-').map(Number)
  return startOfDay(new Date(year, monthIndex - 1, 1))
}

function monthEndIso(month: string): string {
  const [year, monthIndex] = month.split('-').map(Number)
  return endOfDay(new Date(year, monthIndex, 0))
}

function formatMonthRange(from: string, to: string): string {
  return from === to ? `Tháng ${from}` : `${from} → ${to}`
}

const PLATFORM_LABEL: Record<string, string> = {
  facebook: 'Facebook',
  tiktok: 'TikTok',
  zalo: 'Zalo',
  pos: 'POS/Cửa hàng',
  web: 'Website',
  shopee: 'Shopee',
  youtube: 'YouTube',
  other: 'Khác',
}

// Tiền tố chỉ định nhân viên thuộc đội Media / Traffic (chạy quảng cáo, livestream, KOC, KOL, agency, MKT).
// Heuristic này dùng cho auto-detect khi user chưa thiết lập is_media_team trong DB.
const MEDIA_TEAM_PREFIXES = new Set([
  'ADS',
  'MEDIA',
  'MKT',
  'MARKETING',
  'AGENCY',
  'KOC',
  'KOL',
  'LIVESTREAM',
  'LIVE',
  'TRAFFIC',
  'VCB', // VCB Team Livestream
])

// Tiền tố KHÔNG bao giờ thuộc đội Media (sale, kế toán, store, kho, kỹ thuật...).
const NON_MEDIA_PREFIXES = new Set([
  'KD',
  'KD1',
  'KD2',
  'KD3',
  'KD4',
  'KD5',
  'KH3',
  'SALE',
  'KT',
  'STORE',
  'KHO',
  'TMĐT',
  'TMDT',
  'TECH',
  'BOD',
  'SX',
  'XNK',
  'VĐ',
  'NV',
  'TIME',
  'CHI',
  'ANH',
  'GLOBAL',
  'DA',
  'PART',
  'NGA',
  'MI',
  'LINH',
  'CUONG',
])

function isLikelyMediaTeam(m: Pick<MemberView, 'prefix_code' | 'full_name' | 'email'>): boolean {
  const prefix = (m.prefix_code || '').toUpperCase().trim()
  if (prefix && MEDIA_TEAM_PREFIXES.has(prefix)) return true
  // Backup: kiểm tra cụm từ trong full_name / email cho trường hợp không có prefix chuẩn
  const haystack = `${m.full_name || ''} ${m.email || ''}`.toLowerCase()
  if (/\b(media|livestream|ads|traffic|marketing|kol|koc|agency|mkt)\b/.test(haystack)) {
    return true
  }
  return false
}

/**
 * Lấy tên BRAND từ branch_name của kênh, dùng để gom kênh theo thương hiệu.
 * Ví dụ:
 *   "HuyK - Kim Hoàn"          → "HuyK"
 *   "Viễn Chí Bảo - Tiktokshop"→ "Viễn Chí Bảo"
 *   "Viễn Chí Bảo Silver - Tiktokshop" → "Viễn Chí Bảo Silver"
 */
function extractBrand(channel: { branch_name: string | null; alias: string; platform: string }): string {
  const raw = (channel.branch_name || '').trim()
  if (raw) {
    const dash = raw.split(/\s+[-–—]\s+/)[0]
    return dash || raw
  }
  // Không có branch_name: dùng alias hoặc platform làm fallback
  return channel.alias || channel.platform || '(không xác định)'
}

const PLATFORM_COLOR: Record<string, string> = {
  facebook: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  tiktok: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
  zalo: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
  pos: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  web: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  shopee: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
  other: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20',
}

function getPlatformIcon(platform: string) {
  switch (platform) {
    case 'facebook':
      return <Facebook className="w-3.5 h-3.5" />
    case 'tiktok':
      return <Smartphone className="w-3.5 h-3.5" />
    case 'zalo':
      return <Layers className="w-3.5 h-3.5 text-sky-500" />
    case 'pos':
      return <Store className="w-3.5 h-3.5" />
    case 'web':
      return <Globe className="w-3.5 h-3.5" />
    case 'shopee':
      return <ShoppingBag className="w-3.5 h-3.5 text-orange-500" />
    default:
      return <Sparkles className="w-3.5 h-3.5 text-slate-500" />
  }
}

// ===== Component =====

const EMPTY_CHANNELS: ChannelView[] = []
const EMPTY_MEMBERS: MemberView[] = []

export default function SapoTeamPage() {
  const queryClient = useQueryClient()
  const today = useMemo(() => new Date(), [])
  const defaultFrom = useMemo(() => '2025-01-01', [])
  const defaultTo = useMemo(() => today.toISOString().slice(0, 10), [today])

  const [fromDate, setFromDate] = useState(defaultFrom)
  const [toDate, setToDate] = useState(defaultTo)
  const [tab, setTab] = useState<'overview' | 'monthly' | 'channels' | 'members'>('overview')

  const fromIso = useMemo(() => startOfDay(new Date(fromDate)), [fromDate])
  const toIso = useMemo(() => endOfDay(new Date(toDate)), [toDate])

  const dashboardQuery = useSapoDashboard(fromIso, toIso)
  const channelsQuery = useSapoChannels()
  const membersQuery = useSapoMembers()
  const syncMutation = useSapoV2Sync()
  const saveAssignmentsMutation = useSaveChannelAssignments()
  const saveMediaMutation = useSaveMediaToggles()

  const dashboard = dashboardQuery.data ?? null
  const channels = channelsQuery.data ?? EMPTY_CHANNELS
  const members = membersQuery.data ?? EMPTY_MEMBERS
  const trafficSummary = useMemo(() => {
    const summary = dashboard?.summary
    return {
      orders: summary?.traffic_orders ?? summary?.total_orders ?? 0,
      cancelled: summary?.traffic_cancelled_count ?? summary?.cancelled_count ?? 0,
      paid: summary?.traffic_revenue_paid ?? summary?.revenue_paid ?? 0,
      gross: summary?.traffic_revenue_gross ?? summary?.revenue_total ?? 0,
      received: summary?.traffic_revenue_received ?? summary?.revenue_received ?? 0,
      refunded: summary?.traffic_revenue_refunded ?? summary?.revenue_refunded ?? 0,
      excluded: summary?.excluded_unassigned_orders ?? 0,
    }
  }, [dashboard])

  const loading =
    (dashboardQuery.isLoading && !dashboardQuery.data) ||
    (channelsQuery.isLoading && !channelsQuery.data) ||
    (membersQuery.isLoading && !membersQuery.data)
  const syncing = syncMutation.isPending
  const saving = saveAssignmentsMutation.isPending || saveMediaMutation.isPending

  const [actionError, setActionError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const fetchError = dashboardQuery.error || channelsQuery.error || membersQuery.error
  const error =
    actionError ||
    (fetchError instanceof Error ? fetchError.message : fetchError ? String(fetchError) : null)

  const [channelContexts, setChannelContexts] = useState<Record<string, ChannelContext>>({})
  const [loadingContexts, setLoadingContexts] = useState(false)

  // Pending assignment changes (channel.id → media_member_id|null)
  const [pendingAssignments, setPendingAssignments] = useState<Record<string, number | null>>({})
  // Pending media-team toggles (member.sapo_user_id → is_media_team)
  const [pendingMediaToggles, setPendingMediaToggles] = useState<Record<number, boolean>>({})

  async function syncNow() {
    setActionError(null)
    setMessage(null)
    try {
      const data = await syncMutation.mutateAsync()
      setMessage(
        `Đã đồng bộ thành công: ${data.orders?.orders_upserted ?? 0} đơn hàng mới, phát hiện ${data.orders?.channels_discovered ?? 0} kênh bán hàng, cập nhật ${data.members?.upserted ?? 0} nhân viên.`
      )
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Lỗi không xác định')
    }
  }

  function handleAssignChange(channelId: string, value: string) {
    const memberId = value === '__none__' ? null : Number(value)
    setPendingAssignments((prev) => ({ ...prev, [channelId]: memberId }))
  }

  function handleMediaTeamToggle(memberId: number, checked: boolean) {
    setPendingMediaToggles((prev) => ({ ...prev, [memberId]: checked }))
  }

  async function saveChannelAssignments() {
    const updates = Object.entries(pendingAssignments).map(([channel_id, media_member_id]) => ({
      channel_id,
      media_member_id,
    }))
    if (updates.length === 0) return
    setActionError(null)
    setMessage(null)
    try {
      await saveAssignmentsMutation.mutateAsync(updates)
      setMessage(`Đã cập nhật người phụ trách thành công cho ${updates.length} kênh bán hàng.`)
      setPendingAssignments({})
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Lỗi không xác định')
    }
  }

  async function saveMediaToggles() {
    const toggles = Object.entries(pendingMediaToggles).map(([k, v]) => ({
      sapo_user_id: Number(k),
      is_media_team: v,
    }))
    if (toggles.length === 0) return
    setActionError(null)
    setMessage(null)
    try {
      await saveMediaMutation.mutateAsync(toggles)
      setMessage(`Đã cập nhật trạng thái thuộc đội Media cho ${toggles.length} nhân viên.`)
      setPendingMediaToggles({})
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Lỗi không xác định')
    }
  }

  const mediaMembers = useMemo(
    () => members.filter((m) => m.is_media_team || pendingMediaToggles[m.sapo_user_id] === true)
      .filter((m) => !(pendingMediaToggles[m.sapo_user_id] === false)),
    [members, pendingMediaToggles]
  )

  // Danh sách nhân viên ĐƯỢC GỢI Ý là đội Media/Traffic (auto-detect dựa trên prefix code).
  const suggestedMediaMembers = useMemo(
    () => members.filter((m) => isLikelyMediaTeam(m)),
    [members]
  )

  // Auto-detect: stage tất cả ứng viên là Media team (chỉ stage, user phải bấm Lưu).
  function autoDetectAndStageMedia() {
    const updates: Record<number, boolean> = {}
    let added = 0
    for (const m of suggestedMediaMembers) {
      if (!m.is_media_team) {
        updates[m.sapo_user_id] = true
        added++
      }
    }
    if (added === 0) {
      setMessage(`Tất cả ${suggestedMediaMembers.length} nhân viên Media/Traffic gợi ý đều đã được kích hoạt sẵn rồi.`)
      return
    }
    setPendingMediaToggles((prev) => ({ ...prev, ...updates }))
    setMessage(
      `Đã phát hiện và đánh dấu ${added} nhân viên thuộc đội Media/Traffic (ADS, MEDIA, MKT, AGENCY, KOC, LIVESTREAM...). Bấm "Lưu thay đổi" trong tab Danh sách đội Media để xác nhận.`
    )
  }

  // ===== Auto-assign channels =====
  // Tải dữ liệu context (top creator, top assignee, top Media creator) cho TẤT CẢ kênh,
  // giúp user thấy ngữ cảnh đầy đủ để gán tay hoặc bulk-assign hiệu quả.
  async function loadChannelContexts(): Promise<Record<string, ChannelContext>> {
    setActionError(null)

    const memberIdsForAnalysis = Array.from(
      new Set<number>([
        ...mediaMembers.map((m) => m.sapo_user_id),
        ...suggestedMediaMembers.map((m) => m.sapo_user_id),
      ])
    )
    if (memberIdsForAnalysis.length === 0) {
      setActionError('Chưa có nhân viên Media nào để phân tích. Hãy bấm "Tự động phát hiện đội Media" trước.')
      return {}
    }

    try {
      setLoadingContexts(true)
      const memberIdsKey = memberIdsForAnalysis.join(',')
      const data = await queryClient.fetchQuery({
        queryKey: sapoV2Keys.channelContexts(memberIdsKey),
        queryFn: () => fetchSapoChannelContexts(memberIdsForAnalysis),
        staleTime: 5 * 60 * 1000,
      })

      const map: Record<string, ChannelContext> = {}
      for (const c of data.contexts || []) map[c.channel_id] = c
      setChannelContexts(map)

      if (data.summary) {
        setMessage(
          `Đã phân tích ${data.summary.total_channels} kênh: ${data.summary.has_media_creator} kênh có nhân viên Media tạo đơn, ${data.summary.no_media_creator} kênh đơn được tạo bởi đội Sale/Store/E-commerce. Bạn có thể dùng bulk-assign hoặc gán tay tham khảo top creator hiển thị bên dưới.`
        )
      }
      return map
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Lỗi không xác định khi tải context.')
      return {}
    } finally {
      setLoadingContexts(false)
    }
  }

  // Áp dụng gợi ý dựa trên người tạo đơn nhiều nhất là Media (chỉ áp dụng cho các kênh có Media creator).
  function applyMediaCreatorSuggestions(opts?: { onlyEmpty?: boolean; contexts?: Record<string, ChannelContext> }) {
    const onlyEmpty = opts?.onlyEmpty ?? true
    const ctx = opts?.contexts || channelContexts
    const updates: Record<string, number | null> = {}
    let staged = 0
    let skippedAssigned = 0
    let skippedNoMedia = 0

    for (const ch of channels) {
      const c = ctx[ch.id]
      if (!c || c.top_media_creator_id === null) {
        skippedNoMedia++
        continue
      }
      if (onlyEmpty && ch.media_member_id !== null) {
        skippedAssigned++
        continue
      }
      if (ch.media_member_id === c.top_media_creator_id) continue
      updates[ch.id] = c.top_media_creator_id
      staged++
    }

    if (staged === 0) {
      setMessage(
        `Không có kênh mới để áp dụng (${skippedNoMedia} kênh không có Media creator, ${skippedAssigned} kênh đã có người phụ trách). Dùng bulk-assign bên dưới để gán theo brand / nền tảng.`
      )
    } else {
      setPendingAssignments((prev) => ({ ...prev, ...updates }))
      setMessage(
        `Đã đề xuất ${staged} kênh dựa trên Media member tạo đơn nhiều nhất. Kiểm tra rồi bấm "Lưu thay đổi" để xác nhận.`
      )
    }
  }

  // Tổ hợp: tải context + áp dụng gợi ý ngay
  async function autoAssignFromOrderHistory(opts?: { onlyEmpty?: boolean }) {
    const ctx = await loadChannelContexts()
    if (Object.keys(ctx).length > 0) applyMediaCreatorSuggestions({ onlyEmpty: opts?.onlyEmpty, contexts: ctx })
  }

  // Bulk-assign: gán list channelIds → 1 media member (hoặc null để bỏ gán)
  function bulkAssign(channelIds: string[], mediaMemberId: number | null) {
    if (channelIds.length === 0) return
    const updates: Record<string, number | null> = {}
    for (const id of channelIds) updates[id] = mediaMemberId
    setPendingAssignments((prev) => ({ ...prev, ...updates }))
    setMessage(
      mediaMemberId === null
        ? `Đã bỏ gán phụ trách cho ${channelIds.length} kênh được chọn. Bấm "Lưu thay đổi" để xác nhận.`
        : `Đã đề xuất gán ${channelIds.length} kênh cho 1 nhân viên Media. Bấm "Lưu thay đổi" để xác nhận.`
    )
  }

  const unassignedChannelsCount = useMemo(() => {
    return channels.filter((c) => c.media_member_id === null).length
  }, [channels])

  // ===== Render =====

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1600px] mx-auto text-slate-900 dark:text-slate-100">
      {/* SaaS Loading / Syncing progressive bar indicator */}
      {(loading || syncing || saving) && (
        <div className="fixed top-0 left-0 right-0 h-1 bg-blue-500/20 z-50 overflow-hidden">
          <div className="h-full bg-blue-600 animate-pulse rounded-full" style={{ width: '40%' }}></div>
        </div>
      )}

      {/* Header Banner Block */}
      <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 rounded-xl p-5 lg:p-6 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative overflow-hidden backdrop-blur-md">
        <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-blue-500/5 rounded-full blur-[100px] -z-10" />
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-blue-500/10 text-blue-600 rounded-lg dark:bg-blue-900/30 dark:text-blue-400">
              <Sparkles className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight bg-clip-text bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300">
              Phân Tích Doanh Thu Sapo
            </h1>
            <Badge variant="outline" className="ml-1 bg-blue-500/10 text-blue-600 border-blue-500/20">Team Media</Badge>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-2xl">
            Quản lý doanh thu đa nền tảng trực tiếp từ Sapo API. Gán fanpage / kênh bán hàng cho từng nhân viên Media phụ trách để tự động phân phối và tối ưu hóa hiệu quả chiến dịch.
          </p>
        </div>

        {/* Date Filters & Sync Controls */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="flex items-center bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-1.5 gap-1 shadow-inner">
            <div className="flex items-center px-2 text-slate-400">
              <Calendar className="w-4 h-4 mr-1.5" />
              <span className="text-xs font-semibold uppercase tracking-wider hidden sm:inline">Thời gian</span>
            </div>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-auto h-8 py-0 px-2 text-xs border-0 bg-transparent focus-visible:ring-0 shadow-none font-medium"
            />
            <span className="text-slate-400 text-xs px-1">→</span>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-auto h-8 py-0 px-2 text-xs border-0 bg-transparent focus-visible:ring-0 shadow-none font-medium"
            />
          </div>

          <Button 
            onClick={() => void syncNow()} 
            disabled={syncing} 
            variant={syncing ? 'outline' : 'default'}
            size="sm"
            className="h-11 px-4 font-semibold text-xs rounded-lg flex items-center shadow-sm hover:shadow-md transition duration-150"
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Đang đồng bộ...' : 'Đồng bộ Sapo'}
          </Button>
        </div>
      </div>

      {/* Floating System Messages */}
      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-rose-200 bg-rose-50/70 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/60 text-sm shadow-sm backdrop-blur-md">
          <AlertCircle className="h-5 w-5 shrink-0 text-rose-500" />
          <div className="space-y-1">
            <span className="font-semibold">Lỗi hệ thống</span>
            <p className="opacity-90 leading-relaxed">{error}</p>
          </div>
        </div>
      )}
      {message && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-emerald-200 bg-emerald-50/70 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/40 text-sm shadow-sm backdrop-blur-md">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
          <div className="space-y-1">
            <span className="font-semibold">Đã hoàn tất</span>
            <p className="opacity-90 leading-relaxed">{message}</p>
          </div>
        </div>
      )}

      {/* Metric Highlighting Cards */}
      {dashboard && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              label="Tổng đơn Traffic"
              value={trafficSummary.orders.toLocaleString('vi-VN')}
              sub={`${trafficSummary.cancelled.toLocaleString('vi-VN')} đơn đã hủy`}
              percentage={trafficSummary.orders > 0 ? Math.round((trafficSummary.cancelled / trafficSummary.orders) * 100) : 0}
              percentageLabel="tỷ lệ hủy"
              theme="blue"
              icon={Hash}
            />
            <MetricCard
              label="Doanh thu Traffic đã thanh toán"
              value={formatMoney(trafficSummary.paid)}
              sub={`Gross chưa hủy: ${formatMoney(trafficSummary.gross)}`}
              theme="violet"
              icon={TrendingUp}
            />
            <MetricCard
              label="Thực thu ví"
              value={formatMoney(trafficSummary.received)}
              sub={`Paid / Gross: ${trafficSummary.gross > 0 ? Math.round((trafficSummary.paid / trafficSummary.gross) * 100) : 0}%`}
              percentage={trafficSummary.gross > 0 ? Math.round((trafficSummary.paid / trafficSummary.gross) * 100) : 0}
              percentageLabel="paid/gross"
              theme="emerald"
              icon={CheckCircle2}
            />
            <MetricCard
              label="Tổng tiền hoàn trả"
              value={formatMoney(trafficSummary.refunded)}
              sub="Hoàn hàng / Trả lại ví khách"
              percentage={trafficSummary.paid > 0 ? Number(((trafficSummary.refunded / trafficSummary.paid) * 100).toFixed(1)) : 0}
              percentageLabel="tỷ lệ hoàn"
              theme="rose"
              icon={AlertTriangle}
            />
          </div>
          {trafficSummary.excluded > 0 && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-sm text-amber-800 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Đã loại {trafficSummary.excluded.toLocaleString('vi-VN')} đơn khỏi báo cáo vì chưa thuộc kênh gán cho member Traffic.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Navigation and Tab Layout */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-px gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { key: 'overview' as const, label: 'Tổng quan nền tảng', count: null },
              { key: 'monthly' as const, label: 'Báo cáo theo tháng', count: dashboard?.byMonth.length ?? null },
              { key: 'channels' as const, label: 'Kênh & Gán Media', count: channels.length, unassigned: unassignedChannelsCount },
              { key: 'members' as const, label: 'Danh sách đội Media', count: mediaMembers.length },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => {
                  setTab(t.key)
                  setActionError(null)
                  setMessage(null)
                }}
                className={
                  'px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 transition-all flex items-center gap-1.5 relative ' +
                  (tab === t.key
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-500/5'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50 dark:hover:text-slate-300 dark:hover:bg-slate-900/30')
                }
              >
                {t.label}
                {t.count !== null && (
                  <Badge variant="secondary" className="px-1.5 py-px text-[10px] scale-90 h-4 min-w-4 flex items-center justify-center font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {t.count}
                  </Badge>
                )}
                {t.unassigned && t.unassigned > 0 ? (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-amber-500 text-[9px] font-black text-white animate-bounce shadow-md">
                    {t.unassigned}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          <div className="text-xs text-slate-400 font-medium py-1">
            Lần sync Sapo cuối: {dashboard?.sync?.last_sync_at ? new Date(dashboard.sync.last_sync_at).toLocaleString('vi-VN') : 'chưa có dữ liệu'}
          </div>
        </div>

        {/* Tab content renderer with graceful skeleton wrappers */}
        {loading && !dashboard ? (
          <div className="space-y-4 py-12">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 rounded-xl bg-slate-100 dark:bg-slate-800/50 animate-pulse" />
              ))}
            </div>
            <div className="h-64 rounded-xl bg-slate-100 dark:bg-slate-800/50 animate-pulse" />
          </div>
        ) : (
          <div className="transition-all duration-300">
            {tab === 'overview' && dashboard && <OverviewTab data={dashboard} />}
            {tab === 'monthly' && dashboard && <MonthlyTab data={dashboard} />}
            {tab === 'channels' && (
              <ChannelsTab
                channels={channels}
                channelContexts={channelContexts}
                mediaMembers={mediaMembers}
                allMembers={members}
                suggestedMembers={suggestedMediaMembers}
                pending={pendingAssignments}
                onChange={handleAssignChange}
                onSave={saveChannelAssignments}
                saving={saving}
                loadingContexts={loadingContexts}
                onAutoDetect={autoDetectAndStageMedia}
                onLoadContexts={loadChannelContexts}
                onAutoAssign={autoAssignFromOrderHistory}
                onBulkAssign={bulkAssign}
              />
            )}
            {tab === 'members' && (
              <MembersTab
                members={members}
                suggestedMembers={suggestedMediaMembers}
                pending={pendingMediaToggles}
                onToggle={handleMediaTeamToggle}
                onSave={saveMediaToggles}
                saving={saving}
                onAutoDetect={autoDetectAndStageMedia}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ===== Metric Cards Subcomponent =====

function MetricCard({
  label,
  value,
  sub,
  percentage,
  percentageLabel,
  theme,
  icon: Icon,
}: {
  label: string
  value: string
  sub?: string
  percentage?: number
  percentageLabel?: string
  theme: 'blue' | 'violet' | 'emerald' | 'rose'
  icon: React.ComponentType<{ className?: string }>
}) {
  const styles = {
    blue: {
      bg: 'bg-blue-500/10 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
      badge: 'bg-blue-500/10 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
      border: 'hover:border-blue-500/30 dark:hover:border-blue-500/20',
    },
    violet: {
      bg: 'bg-violet-500/10 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400',
      badge: 'bg-violet-500/10 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
      border: 'hover:border-violet-500/30 dark:hover:border-violet-500/20',
    },
    emerald: {
      bg: 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
      badge: 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
      border: 'hover:border-emerald-500/30 dark:hover:border-emerald-500/20',
    },
    rose: {
      bg: 'bg-rose-500/10 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400',
      badge: 'bg-rose-500/10 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
      border: 'hover:border-rose-500/30 dark:hover:border-rose-500/20',
    },
  }[theme]

  return (
    <Card className={`overflow-hidden transition-all duration-300 hover:shadow-md border border-slate-200 dark:border-slate-800/80 rounded-xl ${styles.border}`}>
      <CardContent className="p-5 flex flex-col justify-between h-full relative">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              {label}
            </span>
            <div className="text-3xl font-extrabold text-slate-900 dark:text-white leading-none tracking-tight">
              {value}
            </div>
          </div>
          <span className={`p-2.5 rounded-xl ${styles.bg}`}>
            <Icon className="h-5 w-5" />
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-1.5 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/80">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate max-w-[150px]">
            {sub}
          </span>
          {percentage !== undefined && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${styles.badge}`}>
              <Percent className="w-2.5 h-2.5" />
              {percentage}% {percentageLabel}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function PlatformBadge({ platform }: { platform: string }) {
  const label = PLATFORM_LABEL[platform] || platform
  const cls = PLATFORM_COLOR[platform] || PLATFORM_COLOR.other
  const icon = getPlatformIcon(platform)
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full border shadow-sm transition ${cls}`}>
      {icon}
      {label}
    </span>
  )
}

// ===== Tab Components =====

function OverviewTab({ data }: { data: DashboardData }) {
  const [channelSearch, setChannelSearch] = useState('')
  const [mediaSearch, setMediaSearch] = useState('')
  const [tableMonthFrom, setTableMonthFrom] = useState(() => monthValue())
  const [tableMonthTo, setTableMonthTo] = useState(() => monthValue())
  const trafficGross = data.summary.traffic_revenue_gross ?? data.summary.revenue_total ?? 0
  const [effectiveMonthFrom, effectiveMonthTo] = useMemo(() => {
    return tableMonthFrom <= tableMonthTo
      ? [tableMonthFrom, tableMonthTo]
      : [tableMonthTo, tableMonthFrom]
  }, [tableMonthFrom, tableMonthTo])
  const tableFromIso = useMemo(() => monthStartIso(effectiveMonthFrom), [effectiveMonthFrom])
  const tableToIso = useMemo(() => monthEndIso(effectiveMonthTo), [effectiveMonthTo])
  const tableDashboardQuery = useSapoDashboard(tableFromIso, tableToIso)
  const tableData = tableDashboardQuery.data ?? data
  const tableMonthLabel = formatMonthRange(effectiveMonthFrom, effectiveMonthTo)
  const currentMonth = monthValue()

  const filteredChannels = useMemo(() => {
    if (!channelSearch) return tableData.byChannel
    const q = channelSearch.toLowerCase()
    return tableData.byChannel.filter((c) =>
      c.channel_name.toLowerCase().includes(q) ||
      (c.media_member_name || '').toLowerCase().includes(q)
    )
  }, [tableData.byChannel, channelSearch])

  const topTrafficMembers = useMemo(() => {
    const ranked = [...tableData.byMediaMember].sort((a, b) => b.paid - a.paid || b.revenue - a.revenue)
    if (!mediaSearch) return ranked
    const q = mediaSearch.toLowerCase()
    return ranked.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      (c.prefix || '').toLowerCase().includes(q)
    )
  }, [tableData.byMediaMember, mediaSearch])

  return (
    <div className="flex flex-col gap-6">
      {/* Platform breakdown */}
      <Card className="order-3 border border-slate-200 dark:border-slate-800/80 shadow-sm rounded-xl">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800 p-5">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base font-bold flex items-center gap-2 text-slate-800 dark:text-white">
                <Layers className="w-4 h-4 text-blue-500" />
                Phân bố Doanh thu theo Nền Tảng
              </CardTitle>
              <CardDescription className="text-xs">
                So sánh số liệu đơn hàng và doanh thu tích lũy giữa các nền tảng bán hàng.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50 dark:bg-slate-950">
              <TableRow className="border-b border-slate-100 dark:border-slate-800 hover:bg-transparent">
                <TableHead className="font-semibold text-xs py-3">Platform</TableHead>
                <TableHead className="text-right font-semibold text-xs py-3">Số lượng đơn</TableHead>
                <TableHead className="text-right font-semibold text-xs py-3">Doanh thu gộp</TableHead>
                <TableHead className="text-right font-semibold text-xs py-3">Đã thu tiền</TableHead>
                <TableHead className="text-right font-semibold text-xs py-3">% Doanh số</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.byPlatform.map((p) => {
                const pct = trafficGross > 0
                  ? (p.revenue / trafficGross) * 100
                  : 0
                return (
                  <TableRow key={p.platform} className="border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-500/5 transition">
                    <TableCell className="py-3.5"><PlatformBadge platform={p.platform} /></TableCell>
                    <TableCell className="text-right font-semibold py-3.5">{p.orders.toLocaleString('vi-VN')}</TableCell>
                    <TableCell className="text-right font-extrabold py-3.5 text-slate-900 dark:text-white">{formatMoney(p.revenue)} ₫</TableCell>
                    <TableCell className="text-right py-3.5 font-semibold text-emerald-600 dark:text-emerald-400">{formatMoney(p.paid)} ₫</TableCell>
                    <TableCell className="text-right py-3.5">
                      <div className="inline-flex items-center gap-2">
                        <span className="font-bold text-slate-500">{pct.toFixed(1)}%</span>
                        <div className="w-16 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500" style={{ width: `${pct}%` }}></div>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Media team split */}
      <Card className="order-4 border border-slate-200 dark:border-slate-800/80 shadow-sm rounded-xl">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800 p-5">
          <div className="space-y-1">
            <CardTitle className="text-base font-bold flex items-center gap-2 text-slate-800 dark:text-white">
              <Users className="w-4 h-4 text-violet-500" />
              Doanh thu theo Nhân Viên Media (Qua các kênh đã gán)
            </CardTitle>
            <CardDescription className="text-xs">
              Tính toán doanh thu của những người phụ trách trực tiếp các kênh bán hàng (Traffic, Content).
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {data.byMediaMember.length === 0 ? (
            <div className="text-center py-12 text-slate-400 space-y-3">
              <AlertTriangle className="h-8 w-8 mx-auto text-amber-500/70" />
              <p className="text-sm">
                Chưa có dữ liệu gán người phụ trách. Vui lòng chuyển sang tab <strong className="text-blue-500 font-semibold">&quot;Kênh &amp; gán Media&quot;</strong> để thiết lập.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-slate-50 dark:bg-slate-950">
                <TableRow className="border-b border-slate-100 dark:border-slate-800 hover:bg-transparent">
                  <TableHead className="font-semibold text-xs py-3">Họ và tên</TableHead>
                  <TableHead className="text-right font-semibold text-xs py-3">Số lượng kênh phụ trách</TableHead>
                  <TableHead className="text-right font-semibold text-xs py-3">Tổng đơn</TableHead>
                  <TableHead className="text-right font-semibold text-xs py-3">Tổng doanh thu</TableHead>
                  <TableHead className="text-right font-semibold text-xs py-3">Đã thu tiền</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.byMediaMember.map((m) => (
                  <TableRow key={m.sapo_user_id} className="border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-500/5 transition">
                    <TableCell className="py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-violet-500/10 text-violet-600 flex items-center justify-center font-extrabold text-sm uppercase dark:bg-violet-900/30 dark:text-violet-400">
                          {m.name.slice(0, 2)}
                        </div>
                        <div>
                          <div className="font-bold text-slate-800 dark:text-white">{m.name}</div>
                          {m.prefix && (
                            <Badge variant="outline" className="scale-90 origin-left mt-0.5 text-[9px] font-semibold bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-900/20 dark:border-slate-800 dark:text-slate-400">
                              {m.prefix}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold py-3.5">
                      <Badge variant="secondary" className="bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">{m.channels} kênh</Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold py-3.5">{m.orders.toLocaleString('vi-VN')}</TableCell>
                    <TableCell className="text-right font-extrabold text-slate-900 dark:text-white py-3.5">{formatMoney(m.revenue)} ₫</TableCell>
                    <TableCell className="text-right text-emerald-600 dark:text-emerald-400 font-bold py-3.5">{formatMoney(m.paid)} ₫</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="order-1 flex flex-col lg:flex-row lg:items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/60 p-4 shadow-sm">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 text-sm font-extrabold text-slate-800 dark:text-white">
            <Calendar className="h-4 w-4 text-blue-500" />
            Bộ lọc tháng cho Top kênh và Top Traffic
            {tableDashboardQuery.isFetching && <RefreshCw className="h-3.5 w-3.5 animate-spin text-slate-400" />}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Đang hiển thị {tableMonthLabel}. Mặc định là tháng hiện tại.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <label className="space-y-1">
            <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">Từ tháng</span>
            <Input
              type="month"
              value={tableMonthFrom}
              onChange={(e) => setTableMonthFrom(e.target.value || currentMonth)}
              className="h-9 w-full sm:w-[150px] rounded-lg text-sm"
            />
          </label>
          <label className="space-y-1">
            <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">Đến tháng</span>
            <Input
              type="month"
              value={tableMonthTo}
              onChange={(e) => setTableMonthTo(e.target.value || currentMonth)}
              className="h-9 w-full sm:w-[150px] rounded-lg text-sm"
            />
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 rounded-lg font-bold"
            disabled={tableMonthFrom === currentMonth && tableMonthTo === currentMonth}
            onClick={() => {
              setTableMonthFrom(currentMonth)
              setTableMonthTo(currentMonth)
            }}
          >
            Tháng hiện tại
          </Button>
        </div>
      </div>

      {/* Grid: Channels and Traffic members list */}
      <div className="order-2 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top channels list */}
        <Card className="border border-slate-200 dark:border-slate-800/80 shadow-sm rounded-xl">
          <CardHeader className="border-b border-slate-100 dark:border-slate-800 p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-800 dark:text-white">
                  <Building2 className="w-4 h-4 text-emerald-500" />
                  Top Kênh Bán Hàng tốt nhất
                </CardTitle>
                <CardDescription className="text-xs">Xếp hạng kênh theo doanh số gộp thực tế.</CardDescription>
              </div>
              <div className="relative max-w-[200px] w-full shrink-0">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <Input
                  placeholder="Lọc kênh, người phụ trách..."
                  value={channelSearch}
                  onChange={(e) => setChannelSearch(e.target.value)}
                  className="pl-8 h-8 text-xs rounded-lg"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0 max-h-[500px] overflow-y-auto">
            <Table>
              <TableHeader className="bg-slate-50 dark:bg-slate-950/80 sticky top-0 z-10">
                <TableRow className="border-b border-slate-100 dark:border-slate-800 hover:bg-transparent">
                  <TableHead className="font-semibold text-xs py-2">Kênh bán hàng</TableHead>
                  <TableHead className="font-semibold text-xs py-2">Platform</TableHead>
                  <TableHead className="font-semibold text-xs py-2">Phụ trách</TableHead>
                  <TableHead className="text-right font-semibold text-xs py-2">Doanh thu</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredChannels.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-xs text-slate-400">
                      Không tìm thấy kênh phù hợp
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredChannels.map((c) => (
                    <TableRow key={c.channel_id} className="border-b border-slate-100 dark:border-slate-800/40 hover:bg-slate-500/5 transition">
                      <TableCell className="py-2.5 font-bold text-xs max-w-[200px] truncate" title={c.channel_name}>
                        {c.channel_name}
                      </TableCell>
                      <TableCell className="py-2.5">
                        <span className="scale-90 origin-left inline-block">
                          <PlatformBadge platform={c.platform || 'other'} />
                        </span>
                      </TableCell>
                      <TableCell className="py-2.5 text-xs">
                        {c.media_member_name ? (
                          <span className="font-semibold text-slate-700 dark:text-slate-300">{c.media_member_name}</span>
                        ) : (
                          <span className="text-[10px] text-amber-500 bg-amber-500/5 border border-amber-500/10 px-1.5 py-0.5 rounded font-medium">Chưa gán</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-extrabold text-slate-800 dark:text-white py-2.5 text-xs">
                        {formatMoney(c.revenue)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Top traffic members list */}
        <Card className="border border-slate-200 dark:border-slate-800/80 shadow-sm rounded-xl">
          <CardHeader className="border-b border-slate-100 dark:border-slate-800 p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-800 dark:text-white">
                  <Users className="w-4 h-4 text-sky-500" />
                  Top Nhân Viên Traffic có doanh thu cao nhất
                </CardTitle>
                <CardDescription className="text-xs">Chỉ tính member thuộc team Traffic/Media, theo kênh đã gán.</CardDescription>
              </div>
              <div className="relative max-w-[200px] w-full shrink-0">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <Input
                  placeholder="Lọc tên, mã đội..."
                  value={mediaSearch}
                  onChange={(e) => setMediaSearch(e.target.value)}
                  className="pl-8 h-8 text-xs rounded-lg"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0 max-h-[500px] overflow-y-auto">
            <Table>
              <TableHeader className="bg-slate-50 dark:bg-slate-950/80 sticky top-0 z-10">
                <TableRow className="border-b border-slate-100 dark:border-slate-800 hover:bg-transparent">
                  <TableHead className="font-semibold text-xs py-2">Nhân viên Traffic</TableHead>
                  <TableHead className="font-semibold text-xs py-2">Mã đội</TableHead>
                  <TableHead className="text-right font-semibold text-xs py-2">Đơn</TableHead>
                  <TableHead className="text-right font-semibold text-xs py-2">Đã thanh toán</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topTrafficMembers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-xs text-slate-400">
                      Không tìm thấy nhân viên Traffic phù hợp
                    </TableCell>
                  </TableRow>
                ) : (
                  topTrafficMembers.map((c) => (
                    <TableRow key={c.sapo_user_id} className="border-b border-slate-100 dark:border-slate-800/40 hover:bg-slate-500/5 transition">
                      <TableCell className="py-2.5 font-bold text-xs">{c.name}</TableCell>
                      <TableCell className="py-2.5">
                        {c.prefix ? (
                          <Badge variant="secondary" className="text-[10px] scale-90 origin-left py-px font-bold bg-blue-500/10 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                            {c.prefix}
                          </Badge>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-xs py-2.5">{c.orders.toLocaleString('vi-VN')}</TableCell>
                      <TableCell className="text-right font-extrabold text-slate-850 dark:text-white py-2.5 text-xs">
                        {formatMoney(c.paid)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function MonthlyTab({ data }: { data: DashboardData }) {
  const monthsLabel = (m: string) => {
    const [y, mo] = m.split('-')
    return `Tháng ${parseInt(mo, 10)} / ${y}`
  }

  const allPlatforms = useMemo(() => {
    const set = new Set<string>()
    for (const m of data.byMonth) {
      for (const p of Object.keys(m.by_platform)) set.add(p)
    }
    return [...set].sort()
  }, [data.byMonth])

  const maxRevenue = Math.max(1, ...data.byMonth.map((m) => m.revenue))

  if (data.byMonth.length === 0) {
    return (
      <div className="py-16 text-center text-slate-400 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-xl">
        <AlertTriangle className="h-8 w-8 mx-auto text-slate-300 mb-3" />
        <p className="text-sm">Chưa có dữ liệu nào trong thời gian này.</p>
      </div>
    )
  }

  const totals = data.byMonth.reduce(
    (acc, m) => ({
      orders: acc.orders + m.orders,
      cancelled: acc.cancelled + m.cancelled,
      revenue: acc.revenue + m.revenue,
      paid: acc.paid + m.paid,
      received: acc.received + m.received,
      refunded: acc.refunded + m.refunded,
    }),
    { orders: 0, cancelled: 0, revenue: 0, paid: 0, received: 0, refunded: 0 }
  )

  return (
    <div className="space-y-6">
      {/* High-fidelity Visual Chart widget */}
      <Card className="border border-slate-200 dark:border-slate-800/80 shadow-sm rounded-xl overflow-hidden">
        <CardHeader className="bg-slate-50 dark:bg-slate-950/40 p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <CardTitle className="text-base font-bold flex items-center gap-2 text-slate-800 dark:text-white">
                <TrendingUp className="w-4 h-4 text-blue-500" />
                Biểu đồ Tốc độ Doanh thu theo Tháng
              </CardTitle>
              <CardDescription className="text-xs">Đối chiếu cột doanh thu gộp so với doanh thu thực tế đã thanh toán.</CardDescription>
            </div>
            <div className="flex items-center gap-4 text-xs font-semibold">
              <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                <span className="w-3 h-3 bg-blue-500/80 rounded-full" /> Doanh thu gộp
              </span>
              <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                <span className="w-3 h-3 bg-emerald-500/80 rounded-full" /> Thực tế đã thanh toán
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="space-y-4">
            {data.byMonth.map((m) => {
              const pct = (m.revenue / maxRevenue) * 100
              const paidPct = (m.paid / maxRevenue) * 100
              return (
                <div key={m.month} className="group/row flex items-center gap-4 text-sm hover:bg-slate-500/5 p-1 rounded-lg transition-colors">
                  <div className="w-24 text-slate-700 dark:text-slate-300 font-bold shrink-0 text-xs">
                    {monthsLabel(m.month)}
                  </div>
                  <div className="flex-1 relative h-9 bg-slate-100 dark:bg-slate-800/80 rounded-lg overflow-hidden border border-slate-200/20 shadow-inner flex items-center">
                    {/* Background total revenue bar */}
                    <div
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500/40 to-blue-500/80 transition-all duration-500 group-hover/row:brightness-110"
                      style={{ width: `${pct}%` }}
                      title={`Doanh thu: ${formatMoney(m.revenue)} ₫`}
                    />
                    {/* Foreground paid revenue bar */}
                    <div
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500/50 to-emerald-500/85 transition-all duration-500 border-r border-emerald-400 group-hover/row:brightness-110"
                      style={{ width: `${paidPct}%` }}
                      title={`Đã thanh toán: ${formatMoney(m.paid)} ₫`}
                    />
                    {/* Inline statistics values inside bar with text protection filter overlay */}
                    <div className="absolute inset-0 flex items-center justify-between px-3 text-xs font-black text-slate-800 dark:text-white pointer-events-none">
                      <span className="drop-shadow-[0_1px_1px_rgba(255,255,255,0.8)] dark:drop-shadow-[0_1.5px_1px_rgba(0,0,0,0.9)] flex items-center gap-1.5">
                        {formatMoney(m.revenue)} ₫
                        <span className="text-[10px] font-semibold opacity-70">
                          (Thanh toán {formatMoney(m.paid)} ₫)
                        </span>
                      </span>
                      <span className="text-[10px] font-bold opacity-85 bg-white/40 dark:bg-black/30 px-1.5 py-0.5 rounded font-mono">
                        {m.orders.toLocaleString('vi-VN')} đơn
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Aggregate metrics table widget */}
      <Card className="border border-slate-200 dark:border-slate-800/80 shadow-sm rounded-xl">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800 p-5">
          <CardTitle className="text-base font-bold flex items-center gap-2 text-slate-800 dark:text-white">
            <Layers className="w-4 h-4 text-violet-500" />
            Bảng Số Liệu Chi Tiết Theo Tháng
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50 dark:bg-slate-950">
              <TableRow className="border-b border-slate-100 dark:border-slate-800 hover:bg-transparent">
                <TableHead className="font-semibold text-xs py-3">Thời gian</TableHead>
                <TableHead className="text-right font-semibold text-xs py-3">Tổng đơn</TableHead>
                <TableHead className="text-right font-semibold text-xs py-3">Đã hủy</TableHead>
                <TableHead className="text-right font-semibold text-xs py-3">Doanh thu gộp</TableHead>
                <TableHead className="text-right font-semibold text-xs py-3">Đã thu tiền</TableHead>
                <TableHead className="text-right font-semibold text-xs py-3">Thực thu ngân quỹ</TableHead>
                <TableHead className="text-right font-semibold text-xs py-3">Refund</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.byMonth.map((m) => (
                <TableRow key={m.month} className="border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-500/5 transition">
                  <TableCell className="font-bold py-3.5">{monthsLabel(m.month)}</TableCell>
                  <TableCell className="text-right font-semibold py-3.5">{m.orders.toLocaleString('vi-VN')}</TableCell>
                  <TableCell className="text-right text-slate-400 py-3.5">{m.cancelled.toLocaleString('vi-VN')}</TableCell>
                  <TableCell className="text-right font-extrabold text-slate-900 dark:text-white py-3.5">{formatMoney(m.revenue)} ₫</TableCell>
                  <TableCell className="text-right text-emerald-600 dark:text-emerald-400 font-extrabold py-3.5">{formatMoney(m.paid)} ₫</TableCell>
                  <TableCell className="text-right font-semibold py-3.5">{formatMoney(m.received)} ₫</TableCell>
                  <TableCell className="text-right text-rose-500 font-bold py-3.5">{formatMoney(m.refunded)} ₫</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-slate-100/50 dark:bg-slate-950/70 font-extrabold border-t-2 border-slate-200 dark:border-slate-850 hover:bg-slate-100">
                <TableCell className="py-4 text-xs tracking-wider">TỔNG CỘNG</TableCell>
                <TableCell className="text-right py-4">{totals.orders.toLocaleString('vi-VN')}</TableCell>
                <TableCell className="text-right text-slate-400 py-4">{totals.cancelled.toLocaleString('vi-VN')}</TableCell>
                <TableCell className="text-right text-slate-900 dark:text-white py-4">{formatMoney(totals.revenue)} ₫</TableCell>
                <TableCell className="text-right text-emerald-600 dark:text-emerald-400 py-4">{formatMoney(totals.paid)} ₫</TableCell>
                <TableCell className="text-right py-4">{formatMoney(totals.received)} ₫</TableCell>
                <TableCell className="text-right text-red-500 py-4">{formatMoney(totals.refunded)} ₫</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Platform monthly split grid */}
      <Card className="border border-slate-200 dark:border-slate-800/80 shadow-sm rounded-xl">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800 p-5">
          <CardTitle className="text-base font-bold flex items-center gap-2 text-slate-800 dark:text-white">
            <SlidersHorizontal className="w-4 h-4 text-emerald-500" />
            Chi tiết Nền Tảng bán hàng theo Từng Tháng
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50 dark:bg-slate-950">
              <TableRow className="border-b border-slate-100 dark:border-slate-800 hover:bg-transparent">
                <TableHead className="font-semibold text-xs py-3 min-w-[120px]">Tháng</TableHead>
                {allPlatforms.map((p) => (
                  <TableHead key={p} className="text-right font-semibold text-xs py-3">
                    <PlatformBadge platform={p} />
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.byMonth.map((m) => (
                <TableRow key={m.month} className="border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-500/5 transition">
                  <TableCell className="font-bold whitespace-nowrap py-3.5 text-xs">{monthsLabel(m.month)}</TableCell>
                  {allPlatforms.map((p) => {
                    const stat = m.by_platform[p]
                    return (
                      <TableCell key={p} className="text-right py-3.5">
                        {stat ? (
                          <div className="space-y-0.5">
                            <div className="font-bold text-slate-900 dark:text-white text-xs">{formatMoney(stat.revenue)} ₫</div>
                            <div className="text-[10px] text-slate-400 font-medium">{stat.orders.toLocaleString('vi-VN')} đơn</div>
                          </div>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-700 text-xs">—</span>
                        )}
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function ChannelsTab({
  channels,
  channelContexts,
  mediaMembers,
  allMembers,
  suggestedMembers,
  pending,
  onChange,
  onSave,
  saving,
  loadingContexts,
  onAutoDetect,
  onLoadContexts,
  onAutoAssign,
  onBulkAssign,
}: {
  channels: ChannelView[]
  channelContexts: Record<string, ChannelContext>
  mediaMembers: MemberView[]
  allMembers: MemberView[]
  suggestedMembers: MemberView[]
  pending: Record<string, number | null>
  onChange: (channelId: string, value: string) => void
  onSave: () => void
  saving: boolean
  loadingContexts: boolean
  onAutoDetect: () => void
  onLoadContexts: () => Promise<Record<string, ChannelContext>>
  onAutoAssign: (opts?: { onlyEmpty?: boolean }) => Promise<void>
  onBulkAssign: (channelIds: string[], mediaMemberId: number | null) => void
}) {
  const pendingCount = Object.keys(pending).length
  const [search, setSearch] = useState('')
  const [platformFilter, setPlatformFilter] = useState<string>('all')
  const [showAllStaff, setShowAllStaff] = useState(false)
  const [onlyEmptyForAuto, setOnlyEmptyForAuto] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkTarget, setBulkTarget] = useState<string>('__none__')

  // Danh sách trong dropdown:
  // - Nếu đã có Media team: chỉ Media team (gọn, đúng người)
  // - Nếu chưa có Media team: hiện gợi ý (suggested) + cờ "showAllStaff" để xem tất cả khi cần
  const memberOptions = useMemo(() => {
    if (showAllStaff) {
      // Đưa Media/Suggested lên đầu, sau đó tới các member khác — sắp xếp theo tên
      const mediaIds = new Set([
        ...mediaMembers.map((m) => m.sapo_user_id),
        ...suggestedMembers.map((m) => m.sapo_user_id),
      ])
      const media = allMembers.filter((m) => mediaIds.has(m.sapo_user_id))
      const others = allMembers
        .filter((m) => !mediaIds.has(m.sapo_user_id))
        .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
      return [...media, ...others]
    }
    if (mediaMembers.length > 0) return mediaMembers
    return suggestedMembers
  }, [mediaMembers, allMembers, suggestedMembers, showAllStaff])

  const filteredChannels = useMemo(() => {
    return channels.filter((c) => {
      const matchSearch =
        (c.branch_name || '').toLowerCase().includes(search.toLowerCase()) ||
        c.alias.toLowerCase().includes(search.toLowerCase()) ||
        (c.branch_external_id || '').toLowerCase().includes(search.toLowerCase())
      const matchPlatform = platformFilter === 'all' || c.platform === platformFilter
      return matchSearch && matchPlatform
    })
  }, [channels, search, platformFilter])

  const suggestedMediaIds = useMemo(
    () => new Set(suggestedMembers.map((m) => m.sapo_user_id)),
    [suggestedMembers]
  )
  const memberById = useMemo(
    () => new Map(allMembers.map((m) => [m.sapo_user_id, m])),
    [allMembers]
  )

  const allFilteredSelected = filteredChannels.length > 0 && filteredChannels.every((c) => selectedIds.has(c.id))
  const hasContexts = Object.keys(channelContexts).length > 0

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAllVisible() {
    const allIds = new Set(filteredChannels.map((c) => c.id))
    setSelectedIds((prev) => {
      if (filteredChannels.every((c) => prev.has(c.id))) {
        const next = new Set(prev)
        for (const id of allIds) next.delete(id)
        return next
      }
      return new Set([...prev, ...allIds])
    })
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  function selectByBrand(brand: string) {
    const ids = filteredChannels.filter((c) => extractBrand(c) === brand).map((c) => c.id)
    setSelectedIds(new Set(ids))
  }

  function applyBulk() {
    if (selectedIds.size === 0) return
    const memberId = bulkTarget === '__none__' ? null : Number(bulkTarget)
    onBulkAssign(Array.from(selectedIds), memberId)
    clearSelection()
  }

  // Phân nhóm kênh theo brand (để hỗ trợ chọn cả nhóm)
  const brandStats = useMemo(() => {
    const map = new Map<string, { brand: string; channels: ChannelView[]; total_orders: number; platforms: Set<string> }>()
    for (const c of filteredChannels) {
      const b = extractBrand(c)
      if (!map.has(b)) map.set(b, { brand: b, channels: [], total_orders: 0, platforms: new Set() })
      const entry = map.get(b)!
      entry.channels.push(c)
      entry.total_orders += c.orders_count
      if (c.platform) entry.platforms.add(c.platform)
    }
    return Array.from(map.values()).sort((a, b) => b.total_orders - a.total_orders)
  }, [filteredChannels])

  return (
    <Card className="border border-slate-200 dark:border-slate-800/80 shadow-sm rounded-xl">
      <CardHeader className="border-b border-slate-100 dark:border-slate-800 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-base font-bold flex items-center gap-2 text-slate-800 dark:text-white">
              <Building2 className="w-4 h-4 text-blue-500" />
              Gán Quyền Phụ Trách Kênh Bán Hàng
            </CardTitle>
            <CardDescription className="text-xs">
              Gán người phụ trách cho từng kênh để phân phối doanh thu cho đội ngũ Media.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              onClick={() => void onLoadContexts()}
              disabled={loadingContexts || saving}
              size="sm"
              variant="outline"
              className="font-bold text-xs h-9 rounded-lg flex items-center border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-300"
              title="Phân tích sapo_orders để tìm top creator/assignee mỗi kênh, giúp gán có ngữ cảnh"
            >
              {loadingContexts ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Layers className="h-3.5 w-3.5 mr-1.5" />}
              Phân tích kênh
            </Button>
            <Button
              onClick={() => void onAutoAssign({ onlyEmpty: onlyEmptyForAuto })}
              disabled={saving || loadingContexts}
              size="sm"
              variant="outline"
              className="font-bold text-xs h-9 rounded-lg flex items-center border-violet-400/40 bg-violet-50 hover:bg-violet-100 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-700/40 dark:hover:bg-violet-900/40 shadow-sm"
              title="Quét sapo_orders, tìm người Media tạo nhiều đơn nhất cho từng kênh và đề xuất gán"
            >
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              Tự động gán (theo Media tạo đơn)
            </Button>
            <Button
              onClick={onSave}
              disabled={pendingCount === 0 || saving}
              size="sm"
              className="font-bold text-xs h-9 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center shadow-sm"
            >
              {saving ? (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5 mr-1.5" />
              )}
              Lưu thay đổi {pendingCount > 0 ? `(${pendingCount})` : ''}
            </Button>
          </div>
        </div>

        {/* Filters and search inline */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Tìm kiếm nhanh theo tên kênh, ID chi nhánh..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 rounded-lg"
            />
          </div>
          <div className="w-full sm:w-[200px]">
            <Select value={platformFilter} onValueChange={(v) => setPlatformFilter(v ?? 'all')}>
              <SelectTrigger className="w-full h-9 rounded-lg">
                <SelectValue placeholder="Tất cả nền tảng" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả nền tảng</SelectItem>
                <SelectItem value="facebook">Facebook</SelectItem>
                <SelectItem value="tiktok">TikTok</SelectItem>
                <SelectItem value="zalo">Zalo</SelectItem>
                <SelectItem value="pos">POS / Cửa hàng</SelectItem>
                <SelectItem value="web">Website</SelectItem>
                <SelectItem value="shopee">Shopee</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {mediaMembers.length === 0 ? (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-sm">
            <div className="flex items-start gap-3 flex-1">
              <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0 text-amber-500" />
              <div className="space-y-1">
                <p className="font-bold text-amber-700 dark:text-amber-300">
                  Chưa có ai được đánh dấu thuộc đội Media / Traffic
                </p>
                <p className="text-xs text-amber-700/80 dark:text-amber-400/80 leading-relaxed">
                  Hệ thống đã phát hiện <strong>{suggestedMembers.length} nhân viên</strong> có tiền tố thuộc team Traffic (ADS, MEDIA, MKT, AGENCY, KOC, LIVESTREAM...). Bấm nút bên cạnh để tự động đánh dấu tất cả.
                </p>
              </div>
            </div>
            <Button
              onClick={onAutoDetect}
              size="sm"
              disabled={suggestedMembers.length === 0}
              className="bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs h-9 rounded-lg shadow-sm shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              Tự động đánh dấu {suggestedMembers.length > 0 ? `(${suggestedMembers.length})` : ''}
            </Button>
          </div>
        ) : null}

        {/* Toggle để xem toàn bộ nhân viên (mặc định chỉ hiện Media team) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <span className="font-semibold text-slate-600 dark:text-slate-400">Danh sách trong ô chọn:</span>
            <Badge variant="outline" className="font-bold bg-blue-500/5 border-blue-500/20 text-blue-700 dark:text-blue-300">
              {showAllStaff
                ? `${memberOptions.length} người (toàn bộ)`
                : mediaMembers.length > 0
                  ? `${mediaMembers.length} người (đội Media)`
                  : `${suggestedMembers.length} người (đội Media gợi ý)`}
            </Badge>
          </div>
          <div className="flex items-center gap-5">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <span className="text-xs font-medium text-slate-500">Auto-gán: chỉ kênh chưa có người</span>
              <div className="relative inline-flex items-center">
                <input
                  type="checkbox"
                  checked={onlyEmptyForAuto}
                  onChange={(e) => setOnlyEmptyForAuto(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none dark:bg-slate-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-violet-600"></div>
              </div>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <span className="text-xs font-medium text-slate-500">Hiện toàn bộ nhân viên</span>
              <div className="relative inline-flex items-center">
                <input
                  type="checkbox"
                  checked={showAllStaff}
                  onChange={(e) => setShowAllStaff(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none dark:bg-slate-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
              </div>
            </label>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {/* Brand quick-picker: gom các kênh theo thương hiệu để chọn nhanh */}
        {brandStats.length > 0 && (
          <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Chọn nhanh theo thương hiệu</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {brandStats.slice(0, 15).map((b) => (
                <button
                  key={b.brand}
                  onClick={() => selectByBrand(b.brand)}
                  className="px-2.5 py-1 text-[11px] font-semibold rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition flex items-center gap-1.5"
                >
                  <span>{b.brand}</span>
                  <Badge variant="secondary" className="text-[9px] py-0 px-1 h-4 bg-slate-100 dark:bg-slate-800 font-bold">{b.channels.length}</Badge>
                  <span className="text-slate-400">·</span>
                  <span className="text-[9px] text-slate-400 font-mono">{b.total_orders.toLocaleString('vi-VN')} đơn</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Bulk action bar: hiện khi có channel được chọn */}
        {selectedIds.size > 0 && (
          <div className="px-5 py-3 border-b border-blue-200 dark:border-blue-800/60 bg-blue-50/80 dark:bg-blue-950/30 flex flex-col lg:flex-row lg:items-center justify-between gap-3 sticky top-0 z-20 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-blue-700 dark:text-blue-300">
                Đã chọn {selectedIds.size} kênh
              </span>
              <button
                onClick={clearSelection}
                className="text-[11px] font-semibold text-slate-500 hover:text-rose-600 underline-offset-2 hover:underline"
              >
                Bỏ chọn
              </button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Gán cho:</span>
              <Select value={bulkTarget} onValueChange={(v) => setBulkTarget(v ?? '__none__')}>
                <SelectTrigger className="h-9 min-w-[260px] rounded-lg bg-white dark:bg-slate-900">
                  <SelectValue placeholder="-- Chọn nhân viên Media --" />
                </SelectTrigger>
                <SelectContent className="max-w-[400px]">
                  <SelectItem value="__none__">
                    <span className="text-slate-400 italic">-- Bỏ gán --</span>
                  </SelectItem>
                  {memberOptions.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-slate-400">Không có nhân viên — bật &quot;Hiện toàn bộ&quot;.</div>
                  ) : (
                    memberOptions.map((m) => {
                      const isMarked = m.is_media_team
                      const isSuggested = suggestedMediaIds.has(m.sapo_user_id)
                      return (
                        <SelectItem key={m.sapo_user_id} value={String(m.sapo_user_id)}>
                          <div className="flex items-center gap-2 min-w-0 w-full">
                            <div className="w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-[10px] text-slate-600 dark:text-slate-300 shrink-0">
                              {(m.full_name || 'NV').slice(0, 2).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-sm truncate">{m.full_name || `#${m.sapo_user_id}`}</div>
                              {m.prefix_code && <div className="text-[10px] text-slate-400 truncate">[{m.prefix_code}]</div>}
                            </div>
                            {isMarked ? (
                              <Badge className="text-[9px] bg-blue-500/20 text-blue-700 dark:text-blue-300 border-0 font-bold px-1.5 py-0 h-4">Media</Badge>
                            ) : isSuggested ? (
                              <Badge className="text-[9px] bg-amber-500/20 text-amber-700 dark:text-amber-300 border-0 font-bold px-1.5 py-0 h-4">Gợi ý</Badge>
                            ) : null}
                          </div>
                        </SelectItem>
                      )
                    })
                  )}
                </SelectContent>
              </Select>
              <Button
                onClick={applyBulk}
                size="sm"
                className="h-9 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-sm"
              >
                <Check className="w-3.5 h-3.5 mr-1.5" />
                Áp dụng cho {selectedIds.size} kênh
              </Button>
            </div>
          </div>
        )}
        <Table>
          <TableHeader className="bg-slate-50 dark:bg-slate-950">
            <TableRow className="border-b border-slate-100 dark:border-slate-800 hover:bg-transparent">
              <TableHead className="w-[40px] py-3">
                <Checkbox
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleSelectAllVisible}
                  className="cursor-pointer"
                  title={allFilteredSelected ? 'Bỏ chọn tất cả hàng đang hiển thị' : 'Chọn tất cả hàng đang hiển thị'}
                />
              </TableHead>
              <TableHead className="font-semibold text-xs py-3">Kênh bán hàng</TableHead>
              <TableHead className="font-semibold text-xs py-3">Platform</TableHead>
              <TableHead className="text-right font-semibold text-xs py-3">Lượt đơn</TableHead>
              <TableHead className="font-semibold text-xs py-3">
                <div className="flex items-center gap-1">
                  Top tạo đơn / xử lý
                  {!hasContexts && (
                    <span className="text-[9px] text-slate-300 italic">(bấm &quot;Phân tích kênh&quot;)</span>
                  )}
                </div>
              </TableHead>
              <TableHead className="min-w-[260px] font-semibold text-xs py-3">Nhân viên Media phụ trách</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredChannels.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-slate-400 text-sm">
                  Không tìm thấy kênh bán hàng nào phù hợp với bộ lọc.
                </TableCell>
              </TableRow>
            ) : (
              filteredChannels.map((c) => {
                const current = pending[c.id] !== undefined ? pending[c.id] : c.media_member_id
                const currentMember = current ? memberById.get(Number(current)) : null
                const isPending = pending[c.id] !== undefined
                const isSelected = selectedIds.has(c.id)
                const ctx = channelContexts[c.id]
                return (
                  <TableRow
                    key={c.id}
                    className={`border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-500/5 transition ${
                      isPending ? 'bg-amber-500/5 dark:bg-amber-500/10' : ''
                    } ${isSelected ? 'bg-blue-500/5 dark:bg-blue-500/10' : ''}`}
                  >
                    <TableCell className="py-3">
                      <Checkbox
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelected(c.id)}
                        className="cursor-pointer"
                      />
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="flex flex-col">
                        <span className="font-bold text-sm text-slate-900 dark:text-white max-w-[320px] truncate" title={c.branch_name || c.alias}>
                          {c.branch_name || `Kênh: ${c.alias}`}
                        </span>
                        {c.branch_external_id && (
                          <span className="text-[10px] text-slate-400 font-mono mt-0.5">ID: {c.branch_external_id}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      <PlatformBadge platform={c.platform} />
                    </TableCell>
                    <TableCell className="text-right font-bold py-3 text-sm">
                      {c.orders_count.toLocaleString('vi-VN')}
                    </TableCell>
                    <TableCell className="py-3">
                      {ctx ? (
                        <div className="space-y-0.5 text-[11px]">
                          {ctx.top_creator_id ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-400 w-7 text-[9px] font-mono uppercase">Tạo</span>
                              <span className="truncate max-w-[160px] font-semibold text-slate-700 dark:text-slate-200" title={ctx.top_creator_name || ''}>
                                {ctx.top_creator_name}
                              </span>
                              {ctx.top_creator_prefix && (
                                <Badge variant="outline" className={`text-[8px] py-0 px-1 h-3.5 font-bold ${ctx.top_creator_is_media ? 'bg-blue-500/10 text-blue-700 border-blue-500/30' : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
                                  {ctx.top_creator_prefix}
                                </Badge>
                              )}
                              <span className="text-slate-400 text-[9px]">×{ctx.top_creator_orders}</span>
                            </div>
                          ) : (
                            <span className="text-slate-300 text-[10px] italic">Chưa có người tạo</span>
                          )}
                          {ctx.top_media_creator_id && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-amber-500 w-7 text-[9px] font-mono uppercase">Media</span>
                              <span className="truncate max-w-[160px] font-semibold text-amber-700 dark:text-amber-300" title={ctx.top_media_creator_name || ''}>
                                {ctx.top_media_creator_name}
                              </span>
                              {ctx.top_media_creator_prefix && (
                                <Badge className="text-[8px] py-0 px-1 h-3.5 bg-amber-500/15 text-amber-700 dark:text-amber-300 border-0 font-bold">
                                  {ctx.top_media_creator_prefix}
                                </Badge>
                              )}
                              <span className="text-amber-500 text-[9px]">×{ctx.top_media_creator_orders}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-300 text-[10px] italic">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="flex items-center gap-2">
                        <Select
                          value={current === null || current === undefined ? '__none__' : String(current)}
                          onValueChange={(v) => onChange(c.id, v ?? '__none__')}
                        >
                          <SelectTrigger className={`w-full max-w-[280px] h-9 rounded-lg ${isPending ? 'border-amber-400 ring-2 ring-amber-400/20' : ''}`}>
                            <SelectValue placeholder="-- Chọn nhân viên phụ trách --">
                              {currentMember?.full_name || (current ? `#${current}` : '-- Bỏ gán --')}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent className="max-w-[360px]">
                            <SelectItem value="__none__">
                              <span className="text-slate-400 italic">-- Bỏ gán --</span>
                            </SelectItem>
                            {memberOptions.length === 0 ? (
                              <div className="px-3 py-2 text-xs text-slate-400">
                                Không có nhân viên nào — bật &quot;Hiện toàn bộ nhân viên&quot; ở trên.
                              </div>
                            ) : (
                              memberOptions.map((m) => {
                                const isSuggested = suggestedMediaIds.has(m.sapo_user_id)
                                const isMarked = m.is_media_team
                                return (
                                  <SelectItem key={m.sapo_user_id} value={String(m.sapo_user_id)}>
                                    <div className="flex items-center gap-2 min-w-0 w-full">
                                      <div className="w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-[10px] text-slate-600 dark:text-slate-300 shrink-0">
                                        {(m.full_name || 'NV').slice(0, 2).toUpperCase()}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="font-semibold text-sm truncate">
                                          {m.full_name || `#${m.sapo_user_id}`}
                                        </div>
                                        {m.prefix_code && (
                                          <div className="text-[10px] text-slate-400 truncate">[{m.prefix_code}]{m.email ? ` · ${m.email}` : ''}</div>
                                        )}
                                      </div>
                                      {isMarked ? (
                                        <Badge className="text-[9px] bg-blue-500/20 text-blue-700 dark:text-blue-300 border-0 font-bold px-1.5 py-0 h-4 shrink-0">Media</Badge>
                                      ) : isSuggested ? (
                                        <Badge className="text-[9px] bg-amber-500/20 text-amber-700 dark:text-amber-300 border-0 font-bold px-1.5 py-0 h-4 shrink-0">Gợi ý</Badge>
                                      ) : null}
                                    </div>
                                  </SelectItem>
                                )
                              })
                            )}
                          </SelectContent>
                        </Select>
                        {isPending && (
                          <span className="text-[10px] font-bold text-amber-600 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full whitespace-nowrap">Chờ lưu</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function MembersTab({
  members,
  suggestedMembers,
  pending,
  onToggle,
  onSave,
  saving,
  onAutoDetect,
}: {
  members: MemberView[]
  suggestedMembers: MemberView[]
  pending: Record<number, boolean>
  onToggle: (memberId: number, checked: boolean) => void
  onSave: () => void
  saving: boolean
  onAutoDetect: () => void
}) {
  const [filter, setFilter] = useState('')
  const [memberToAdd, setMemberToAdd] = useState<string>('')
  const [memberAddSearch, setMemberAddSearch] = useState('')
  // Mặc định: hiện nhân viên Media (đã đánh dấu hoặc gợi ý) để user không bị rối
  const initialFilter: 'all' | 'media' | 'suggested' | 'non_media' = useMemo(() => {
    const anyMedia = members.some((m) => m.is_media_team)
    return anyMedia ? 'media' : 'suggested'
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [statusFilter, setStatusFilter] = useState<'all' | 'media' | 'suggested' | 'non_media'>(initialFilter)

  const suggestedIds = useMemo(
    () => new Set(suggestedMembers.map((m) => m.sapo_user_id)),
    [suggestedMembers]
  )

  const filtered = useMemo(() => {
    return members.filter((m) => {
      const matchSearch =
        (m.full_name || '').toLowerCase().includes(filter.toLowerCase()) ||
        (m.email || '').toLowerCase().includes(filter.toLowerCase()) ||
        (m.prefix_code || '').toLowerCase().includes(filter.toLowerCase())

      const checked = pending[m.sapo_user_id] !== undefined ? pending[m.sapo_user_id] : m.is_media_team
      const isSuggested = suggestedIds.has(m.sapo_user_id)
      const matchStatus =
        statusFilter === 'all' ||
        (statusFilter === 'media' && checked) ||
        (statusFilter === 'suggested' && isSuggested) ||
        (statusFilter === 'non_media' && !checked)

      return matchSearch && matchStatus
    })
  }, [members, filter, statusFilter, pending, suggestedIds])

  const pendingCount = Object.keys(pending).length
  const enabledCount = members.filter((m) => {
    const v = pending[m.sapo_user_id]
    return v === undefined ? m.is_media_team : v
  }).length
  const addableMembers = useMemo(() => {
    return members
      .filter((m) => {
        const checked = pending[m.sapo_user_id] !== undefined ? pending[m.sapo_user_id] : m.is_media_team
        return !checked
      })
      .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
  }, [members, pending])
  const filteredAddableMembers = useMemo(() => {
    const q = memberAddSearch.trim().toLowerCase()
    if (!q) return addableMembers
    return addableMembers.filter((m) =>
      (m.full_name || '').toLowerCase().includes(q) ||
      (m.email || '').toLowerCase().includes(q) ||
      (m.prefix_code || '').toLowerCase().includes(q) ||
      String(m.sapo_user_id).includes(q)
    )
  }, [addableMembers, memberAddSearch])

  function addMemberToMedia() {
    const id = Number(memberToAdd)
    if (!Number.isFinite(id)) return
    onToggle(id, true)
    setMemberToAdd('')
    setMemberAddSearch('')
    setStatusFilter('media')
  }

  return (
    <Card className="border border-slate-200 dark:border-slate-800/80 shadow-sm rounded-xl">
      <CardHeader className="border-b border-slate-100 dark:border-slate-800 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-base font-bold flex items-center gap-2 text-slate-800 dark:text-white">
              <Users className="w-4 h-4 text-violet-500" />
              Thiết Lập Đội Ngũ Media / Traffic
              <Badge variant="outline" className="ml-1 text-[10px] bg-blue-500/10 text-blue-600 border-blue-500/20 font-bold">
                {enabledCount} / {members.length}
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs">
              Tick chọn để ghi nhận nhân viên thuộc đội Media phụ trách kênh (doanh thu sẽ hiển thị trong báo cáo).
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={onAutoDetect}
              size="sm"
              variant="outline"
              disabled={suggestedMembers.length === 0}
              className="font-bold text-xs h-9 rounded-lg flex items-center border-amber-400/40 bg-amber-50 hover:bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-700/40 dark:hover:bg-amber-900/40 shadow-sm"
            >
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              Tự động phát hiện ({suggestedMembers.length})
            </Button>
            <Button
              onClick={onSave}
              disabled={pendingCount === 0 || saving}
              size="sm"
              className="font-bold text-xs h-9 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center shadow-sm"
            >
              {saving ? (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5 mr-1.5" />
              )}
              Lưu thay đổi {pendingCount > 0 ? `(${pendingCount})` : ''}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-3">
          <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 text-xs text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/25 dark:text-blue-200">
            <div className="font-bold mb-1">Ảnh hưởng khi gán member vào kênh</div>
            <p className="leading-relaxed">
              Gán kênh cho member Media không sửa đơn gốc trên Sapo. Nó chỉ đổi cách báo cáo phân bổ:
              kênh chưa gán khi được gán vào Traffic sẽ làm tăng tổng đơn/doanh thu Traffic; kênh đã gán đổi sang người khác
              thì doanh thu chuyển từ member cũ sang member mới.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 p-3">
            <div className="flex flex-col sm:flex-row sm:items-end gap-2">
              <div className="flex-1 space-y-1">
                <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  Thêm nhanh member Media
                </span>
                <Select value={memberToAdd} onValueChange={(v) => setMemberToAdd(v || '')}>
                  <SelectTrigger className="h-9 rounded-lg bg-white dark:bg-slate-900">
                    <SelectValue placeholder="Chọn nhân viên Sapo chưa thuộc Media..." />
                  </SelectTrigger>
                  <SelectContent className="max-w-[420px] max-h-[360px] overflow-y-auto" alignItemWithTrigger>
                    <div
                      className="sticky top-0 z-20 bg-white dark:bg-slate-900 p-1 pb-2 border-b border-slate-100 dark:border-slate-800"
                      onKeyDown={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                        <Input
                          value={memberAddSearch}
                          onChange={(e) => setMemberAddSearch(e.target.value)}
                          placeholder="Tìm tên, email, prefix, Sapo ID..."
                          className="h-8 pl-8 text-xs rounded-md"
                        />
                      </div>
                    </div>
                    {addableMembers.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-slate-400">
                        Tất cả nhân viên hiện có đã thuộc Media hoặc đang chờ lưu.
                      </div>
                    ) : filteredAddableMembers.length === 0 ? (
                      <div className="px-3 py-3 text-xs text-slate-400">
                        Không tìm thấy nhân viên phù hợp.
                      </div>
                    ) : (
                      filteredAddableMembers.map((m) => (
                        <SelectItem key={m.sapo_user_id} value={String(m.sapo_user_id)}>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-semibold truncate">{m.full_name || `#${m.sapo_user_id}`}</span>
                            {m.prefix_code && (
                              <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">
                                {m.prefix_code}
                              </Badge>
                            )}
                            <span className="text-[10px] text-slate-400">#{m.sapo_user_id}</span>
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                size="sm"
                className="h-9 rounded-lg font-bold"
                disabled={!memberToAdd}
                onClick={addMemberToMedia}
              >
                <Users className="h-3.5 w-3.5 mr-1.5" />
                Thêm vào Media
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              Sau khi thêm, bấm “Lưu thay đổi” để ghi `is_media_team=true` vào DB.
            </p>
          </div>
        </div>

        {/* Realtime filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Tìm theo tên nhân viên, email, mã đội (KD...)..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-9 h-9 rounded-lg"
            />
          </div>
          <div className="w-full sm:w-[260px]">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as never)}>
              <SelectTrigger className="w-full h-9 rounded-lg">
                <SelectValue placeholder="Lọc theo trạng thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="media">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    Đã đánh dấu Media ({enabledCount})
                  </span>
                </SelectItem>
                <SelectItem value="suggested">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    Gợi ý là Media ({suggestedMembers.length})
                  </span>
                </SelectItem>
                <SelectItem value="non_media">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-slate-400" />
                    Không thuộc Media ({members.length - enabledCount})
                  </span>
                </SelectItem>
                <SelectItem value="all">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-slate-500" />
                    Tất cả nhân viên ({members.length})
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader className="bg-slate-50 dark:bg-slate-950">
            <TableRow className="border-b border-slate-100 dark:border-slate-800 hover:bg-transparent">
              <TableHead className="w-[120px] font-semibold text-xs py-3 text-center">Bật Đội Media</TableHead>
              <TableHead className="font-semibold text-xs py-3">Tên nhân viên</TableHead>
              <TableHead className="font-semibold text-xs py-3">Địa chỉ email</TableHead>
              <TableHead className="font-semibold text-xs py-3">Mã đội / Prefix</TableHead>
              <TableHead className="font-semibold text-xs py-3 w-[110px]">Gợi ý</TableHead>
              <TableHead className="font-semibold text-xs py-3">Sapo User ID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-slate-400 text-sm">
                  Không tìm thấy nhân viên nào phù hợp với bộ lọc tìm kiếm.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((m) => {
                const checked = pending[m.sapo_user_id] !== undefined ? pending[m.sapo_user_id] : m.is_media_team
                const isPending = pending[m.sapo_user_id] !== undefined
                const isSuggested = suggestedIds.has(m.sapo_user_id)
                return (
                  <TableRow key={m.sapo_user_id} className={`border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-500/5 transition ${isPending ? 'bg-amber-500/5 dark:bg-amber-500/10' : ''}`}>
                    <TableCell className="py-3 text-center">
                      <div className="flex items-center justify-center">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => onToggle(m.sapo_user_id, e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none dark:bg-slate-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-xs uppercase dark:bg-slate-800 dark:text-slate-300">
                          {(m.full_name || 'NV').slice(0, 2)}
                        </div>
                        <span className="font-bold text-slate-900 dark:text-white">{m.full_name || '(Không tên)'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3 text-slate-500 dark:text-slate-400 text-xs font-semibold">{m.email || '—'}</TableCell>
                    <TableCell className="py-3">
                      {m.prefix_code ? (
                        <Badge variant="secondary" className="font-extrabold text-[10px] bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {m.prefix_code}
                        </Badge>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-3">
                      {isSuggested ? (
                        <Badge className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-bold">
                          <Sparkles className="w-2.5 h-2.5 mr-1" />
                          Traffic
                        </Badge>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-400 dark:text-slate-600 py-3">{m.sapo_user_id}</TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
