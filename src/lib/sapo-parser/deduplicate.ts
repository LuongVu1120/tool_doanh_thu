import type { SapoOrder, DedupResult } from '@/types/sapo'

/**
 * Step 2: Anti-duplicate check against existing DB order codes.
 * Orders already in DB are skipped (logged as duplicate).
 */
export function deduplicateAgainstDB(
  orders: SapoOrder[],
  existingOrderCodes: Set<string>
): DedupResult {
  const newOrders: SapoOrder[] = []
  const duplicateOrderCodes: string[] = []

  for (const order of orders) {
    if (existingOrderCodes.has(order.orderCode)) {
      duplicateOrderCodes.push(order.orderCode)
    } else {
      newOrders.push(order)
    }
  }

  return {
    newOrders,
    duplicateOrderCodes,
  }
}
