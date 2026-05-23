// Raw row from Sapo Excel — read by column NAME, not position
export interface SapoRawRow {
  /** Mã đơn hàng (KEY — forward-filled across product sub-rows) */
  orderCode: string | null
  /** Nguồn (traffic source, e.g. Facebook, Tiktok for Business, Zalo) */
  source: string | null
  /** Trạng thái đơn hàng (e.g. "Đã hoàn thành") */
  status: string | null
  /** Tổng tiền */
  totalAmount: string | null
  /** Ghi chú */
  notes: string | null
  /** Tags (comma-separated) */
  tags: string | null
  /** Ngày đặt hàng (DD-MM-YYYY HH:MM) */
  orderDate: string | null
  /** Ngày hoàn thành (DD-MM-YYYY HH:MM) */
  completedAt: string | null
  [key: string]: string | null
}

// Parsed and normalized order
export interface SapoOrder {
  orderCode: string
  source: string
  status: string
  totalAmount: number
  notes: string
  tags: string[]
  completedAt: Date
  /** Ngày đặt hàng — may be undefined if not present in file */
  orderDate?: Date
  rawTags: string
}

// Return order from order_return_export.xlsx
export interface ReturnOrder {
  returnCode: string
  originalOrderCode: string
  returnAmount: number
  returnReason: string
  returnDate: Date | null
}

// Mapping lookup result
export interface MappingLookupResult {
  lookup: Map<string, { employeeName: string; channelDisplay: string }>
  totalRows: number
  totalEmployees: number
  totalChannels: number
  unassignedCount: number
}

// Step 1: Filter result
export interface FilterResult {
  orders: SapoOrder[]
  skippedCount: number
  skippedReasons: Record<string, number>
}

// Step 2: Dedup result
export interface DedupResult {
  newOrders: SapoOrder[]
  duplicateOrderCodes: string[]
}

// Step 3: Exchange detection result
export interface ExchangeInfo {
  isExchange: boolean
  exchangeType: 'no_extra' | 'with_extra' | 'needs_review' | null
  extraAmount: number | null
  signal: 'tag_no_cod' | 'tag_exchange' | 'note_regex' | null
}

export interface ExchangeDetectionResult {
  order: SapoOrder
  exchange: ExchangeInfo
}

export type ExchangeStatus = 'normal' | 'exchange_no_extra' | 'exchange_with_extra' | 'needs_review'

// Step 4: Tag mapping result
export interface TagMappingResult {
  order: SapoOrder
  channelTag: string | null
  employeeId: string | null
  employeeName: string | null
  exchangeStatus: ExchangeStatus
  effectiveAmount: number
}

// Pipeline result
export interface PipelineResult {
  processed: TagMappingResult[]
  duplicates: string[]
  needsReview: SapoOrder[]
  excluded: Array<{ order: SapoOrder; reason: string }>
  stats: {
    totalRows: number
    filteredRows: number
    duplicatesSkipped: number
    exchangesExcluded: number
    needsReview: number
    finalOrders: number
  }
}

// Import session
export interface ImportSession {
  id: string
  userId: string
  fileName: string
  period: string // "YYYY-MM"
  status: 'pending' | 'preview' | 'needs_review' | 'confirmed' | 'failed'
  pipelineResult: PipelineResult | null
  createdAt: Date
  updatedAt: Date
}

export interface ChannelTag {
  id: string
  tag: string
  normalizedTag: string
  employeeId: string
  employeeName: string
  platform: 'facebook' | 'tiktok'
  createdAt: Date
}

export interface ParsedAmount {
  raw: string
  value: number | null
  parsed: boolean
}
