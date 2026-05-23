import * as XLSX from 'xlsx'
import { parseSapoDate } from './parse-excel'

export interface ReturnOrder {
  /** Mã đơn trả hàng */
  returnCode: string
  /** Mã đơn hàng — the original order code this return refers to */
  originalOrderCode: string
  /** Tổng giá trị trả hàng */
  returnAmount: number
  /** Lý do trả hàng */
  returnReason: string
  /** Ngày hoàn thành of the return */
  returnDate: Date | null
}

/**
 * Column names in the returns file.
 */
const RETURN_COLUMNS = {
  returnCode: 'Mã đơn trả hàng',
  originalOrderCode: 'Mã đơn hàng',
  returnAmount: 'Tổng giá trị trả hàng',
  returnReason: 'Lý do trả hàng',
  returnDate: 'Ngày hoàn thành',
} as const

/**
 * Auto-detect header row in the returns file.
 * Python uses header=4 as the primary attempt, then tries 0, 1, 2, 3.
 */
function detectReturnsHeaderRow(
  rawData: (string | number | boolean | null)[][]
): number {
  const candidates = [4, 0, 1, 2, 3]
  for (const h of candidates) {
    const row = rawData[h]
    if (!row) continue
    const hasOrderCode = row.some(
      (cell) => cell !== null && String(cell).trim() === 'Mã đơn hàng'
    )
    if (hasOrderCode) return h
  }
  return 4
}

/**
 * Parse the total return amount. Sapo stores this as a number.
 */
function parseReturnAmount(raw: string | number | boolean | null): number {
  if (raw === null || raw === undefined || raw === '') return 0
  if (typeof raw === 'number') return Math.round(raw)
  const cleaned = String(raw).replace(/[^\d.]/g, '')
  const value = parseFloat(cleaned)
  return isNaN(value) ? 0 : Math.round(value)
}

/**
 * Parse order_return_export.xlsx.
 *
 * Python reference:
 *   ret = pd.read_excel(returns_path, header=4)
 *   ret['Mã đơn hàng'] = ret['Mã đơn hàng'].astype(str)
 *
 * Key columns: Mã đơn trả hàng, Mã đơn hàng, Tổng giá trị trả hàng,
 *              Lý do trả hàng, Ngày hoàn thành
 */
export function parseReturnsFile(buffer: ArrayBuffer): ReturnOrder[] {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false })

  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    throw new Error('File trả hàng không có sheet nào.')
  }

  const sheet = workbook.Sheets[sheetName]

  const rawData: (string | number | boolean | null)[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    blankrows: true,
  })

  const headerRowIndex = detectReturnsHeaderRow(rawData)
  const headerRow = rawData[headerRowIndex] || []

  const colIndex = new Map<string, number>()
  headerRow.forEach((cell, idx) => {
    if (cell !== null && cell !== undefined) {
      colIndex.set(String(cell).trim(), idx)
    }
  })

  const getCell = (
    row: (string | number | boolean | null)[],
    colName: string
  ): string | number | boolean | null => {
    const idx = colIndex.get(colName)
    if (idx === undefined) return null
    return row[idx] ?? null
  }

  const getCellStr = (
    row: (string | number | boolean | null)[],
    colName: string
  ): string => {
    const val = getCell(row, colName)
    if (val === null || val === undefined) return ''
    return String(val).trim()
  }

  const dataRows = rawData.slice(headerRowIndex + 1)
  const returns: ReturnOrder[] = []

  for (const row of dataRows) {
    if (!row || row.length === 0) continue

    const returnCode = getCellStr(row, RETURN_COLUMNS.returnCode)
    const originalOrderCode = getCellStr(row, RETURN_COLUMNS.originalOrderCode)

    // Skip rows without at least one of the key codes
    if (!returnCode && !originalOrderCode) continue

    const returnAmountRaw = getCell(row, RETURN_COLUMNS.returnAmount)
    const returnReason = getCellStr(row, RETURN_COLUMNS.returnReason)
    const returnDateStr = getCellStr(row, RETURN_COLUMNS.returnDate)

    returns.push({
      returnCode,
      originalOrderCode,
      returnAmount: parseReturnAmount(returnAmountRaw),
      returnReason,
      returnDate: returnDateStr ? parseSapoDate(returnDateStr) : null,
    })
  }

  // Dedupe by returnCode — Sapo exports one row per product, but we only want one
  // return record per Mã đơn trả hàng (matching Python's drop_duplicates behaviour).
  const seen = new Set<string>()
  return returns.filter((r) => {
    const key = r.returnCode || r.originalOrderCode
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}
