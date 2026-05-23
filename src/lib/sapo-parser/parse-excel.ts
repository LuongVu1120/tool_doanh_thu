import * as XLSX from 'xlsx'
import type { SapoRawRow } from '@/types/sapo'

/**
 * Column names we look for in the Sapo Excel header row.
 * We read by column NAME, not position, making parsing robust to column reordering.
 */
const REQUIRED_COLUMN_NAMES = {
  orderCode: 'Mã đơn hàng',
  source: 'Nguồn',
  status: 'Trạng thái đơn hàng',
  totalAmount: 'Tổng tiền',
  notes: 'Ghi chú',
  tags: 'Tags',
  orderDate: 'Ngày đặt hàng',
  completedAt: 'Ngày hoàn thành',
} as const

/**
 * Auto-detect the header row in a Sapo Excel file.
 * Python tries rows 4, 0, 1, 2, 3 — we do the same.
 * Returns the 0-based header row index where "Mã đơn hàng" is found.
 */
function detectHeaderRow(
  rawData: (string | number | boolean | null)[][]
): number {
  const candidates = [4, 0, 1, 2, 3]
  for (const h of candidates) {
    const headerRow = rawData[h]
    if (!headerRow) continue
    const hasOrderCode = headerRow.some(
      (cell) => cell !== null && String(cell).trim() === 'Mã đơn hàng'
    )
    if (hasOrderCode) return h
  }
  // Fallback: use row 4 (Sapo standard)
  return 4
}

/**
 * Build a column-name → column-index map from a header row.
 */
function buildColumnIndex(
  headerRow: (string | number | boolean | null)[]
): Map<string, number> {
  const map = new Map<string, number>()
  headerRow.forEach((cell, idx) => {
    if (cell !== null && cell !== undefined) {
      map.set(String(cell).trim(), idx)
    }
  })
  return map
}

/**
 * Read an Excel buffer and return raw rows.
 * Auto-detects header row (tries row 4 first, per Python logic).
 * Reads columns BY NAME (robust against reordering).
 * Forward-fills "Mã đơn hàng" (blank in product sub-rows).
 */
export function parseExcelBuffer(buffer: ArrayBuffer): SapoRawRow[] {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false })

  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    throw new Error('File Excel không có sheet nào.')
  }

  const sheet = workbook.Sheets[sheetName]

  // Convert to array-of-arrays (raw, preserving all rows including header)
  const rawData: (string | number | boolean | null)[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    blankrows: true,
  })

  // Auto-detect header row
  const headerRowIndex = detectHeaderRow(rawData)
  const headerRow = rawData[headerRowIndex] || []
  const colIndex = buildColumnIndex(headerRow)

  // Data starts at the row AFTER the header
  const dataRows = rawData.slice(headerRowIndex + 1)

  // Helper to safely get a cell value as string
  const getCell = (row: (string | number | boolean | null)[], colName: string): string | null => {
    const idx = colIndex.get(colName)
    if (idx === undefined) return null
    const val = row[idx]
    if (val === null || val === undefined || val === '') return null
    return String(val).trim() || null
  }

  // Map to typed rows, forward-filling orderCode
  const rows: SapoRawRow[] = []
  let lastOrderCode: string | null = null

  for (const row of dataRows) {
    if (!row || row.length === 0) continue

    // Forward-fill Mã đơn hàng
    const rawOrderCode = getCell(row, REQUIRED_COLUMN_NAMES.orderCode)
    if (rawOrderCode) {
      lastOrderCode = rawOrderCode
    }

    // Skip rows with no order code at all (completely empty or footer rows)
    if (!lastOrderCode) continue

    const mappedRow: SapoRawRow = {
      orderCode: lastOrderCode,
      source: getCell(row, REQUIRED_COLUMN_NAMES.source),
      status: getCell(row, REQUIRED_COLUMN_NAMES.status),
      totalAmount: getCell(row, REQUIRED_COLUMN_NAMES.totalAmount),
      notes: getCell(row, REQUIRED_COLUMN_NAMES.notes),
      tags: getCell(row, REQUIRED_COLUMN_NAMES.tags),
      orderDate: getCell(row, REQUIRED_COLUMN_NAMES.orderDate),
      completedAt: getCell(row, REQUIRED_COLUMN_NAMES.completedAt),
    }

    rows.push(mappedRow)
  }

  return rows
}

/**
 * Parse date from Sapo format "DD-MM-YYYY HH:MM" or "DD/MM/YYYY HH:MM".
 */
export function parseSapoDate(dateStr: string): Date | null {
  if (!dateStr) return null

  const match = dateStr.trim().match(
    /^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/
  )
  if (!match) return null

  const day = parseInt(match[1], 10)
  const month = parseInt(match[2], 10) - 1 // 0-indexed
  const year = parseInt(match[3], 10)
  const hour = match[4] ? parseInt(match[4], 10) : 0
  const minute = match[5] ? parseInt(match[5], 10) : 0

  const date = new Date(year, month, day, hour, minute, 0)

  if (isNaN(date.getTime())) return null
  if (date.getFullYear() !== year) return null
  if (date.getMonth() !== month) return null
  if (date.getDate() !== day) return null

  return date
}

/**
 * Parse total amount from the Tổng tiền column. Sapo uses numeric format.
 */
export function parseOrderAmount(raw: string | null): number {
  if (!raw) return 0
  const cleaned = raw.replace(/[^\d.]/g, '')
  const value = parseFloat(cleaned)
  return isNaN(value) ? 0 : Math.round(value)
}

/**
 * Parse tags from the Tags column (comma-separated string).
 */
export function parseTags(raw: string | null): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

/**
 * Deduplicate rows by order code (keep first occurrence per code).
 */
export function dedupeByOrderCode(rows: SapoRawRow[]): SapoRawRow[] {
  const seen = new Set<string>()
  const result: SapoRawRow[] = []

  for (const row of rows) {
    const code = row.orderCode
    if (!code) continue
    if (seen.has(code)) continue
    seen.add(code)
    result.push(row)
  }

  return result
}
