import type { SapoRawRow } from '@/types/sapo'
import type { SapoOrderMeta } from '@/lib/revenue/order-import'
import type { SapoOrderResponse } from './types'

const PAID_STATUS = 'Đã hoàn thành'
const CANCELLED_STATUS = 'Đã hủy'

export interface NormalizedSapoOrder {
  rawRow: SapoRawRow
  meta: SapoOrderMeta
}

export function normalizeSapoOrder(order: SapoOrderResponse): NormalizedSapoOrder {
  const orderCode = firstString(
    order.code,
    order.order_code,
    order.name,
    order.order_number,
    order.id
  )

  const financialStatus = order.financial_status ? String(order.financial_status) : null
  const sapoStatus = order.status ? String(order.status) : null
  const lowerFinancial = financialStatus?.toLowerCase()
  const lowerStatus = sapoStatus?.toLowerCase()
  const isPaid = lowerFinancial === 'paid'
  const isCancelled = lowerStatus === 'cancelled' || Boolean(order.cancelled_on)

  const orderDate = firstString(order.created_on, order.processed_on)
  const completedAt = isPaid ? firstString(order.processed_on, order.created_on) : null

  return {
    rawRow: {
      orderCode,
      source: firstString(order.source_name, order.landing_site_ref, order.gateway),
      status: isCancelled ? CANCELLED_STATUS : isPaid ? PAID_STATUS : firstString(order.status, order.financial_status),
      totalAmount: stringifyAmount(order.total_price),
      notes: order.note ? String(order.note) : null,
      tags: normalizeTags(order.tags),
      orderDate,
      completedAt,
    },
    meta: {
      sapo_order_id: order.id === undefined || order.id === null ? null : String(order.id),
      sapo_financial_status: financialStatus,
      sapo_fulfillment_status: order.fulfillment_status ? String(order.fulfillment_status) : null,
      sapo_status: sapoStatus,
      sapo_modified_on: firstString(order.modified_on, order.updated_on),
      sapo_raw: order,
    },
  }
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (value === null || value === undefined) continue
    const str = String(value).trim()
    if (str) return str
  }
  return null
}

function stringifyAmount(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const str = String(value).trim()
  return str || null
}

function normalizeTags(tags: SapoOrderResponse['tags']): string | null {
  if (Array.isArray(tags)) return tags.map((tag) => String(tag).trim()).filter(Boolean).join(', ')
  if (tags === null || tags === undefined) return null
  return String(tags).trim() || null
}
