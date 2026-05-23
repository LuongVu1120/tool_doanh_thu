import * as XLSX from 'xlsx'
import { normalize } from './normalize'

/**
 * One row from DANH_SACH_CAC_KENH_MEDIA.xlsx.
 * Columns: TÊN (employee name), ID (one or more IDs), Kênh (channel display name).
 */
export interface MappingEntry {
  /** Employee full name from the TÊN column. Empty string if unassigned. */
  employeeName: string
  /** Channel display name from the Kênh column. */
  channelDisplay: string
  /** IDs split from the ID column by '/', ',', or ' và '. */
  ids: string[]
}

export interface MappingLookup {
  /**
   * normalized_key → { employeeName, channelDisplay }
   * Keys are:
   *   - normalize(channelDisplay)
   *   - normalize(each id part)
   */
  lookup: Map<string, { employeeName: string; channelDisplay: string }>
  totalRows: number
  totalEmployees: number
  totalChannels: number
  unassignedCount: number
  entries: MappingEntry[]
}

/**
 * Split an ID cell value into individual ID strings.
 * Python: re.split(r'[/,]', str(ids)) then split each part by ' và '
 */
function splitIds(raw: string): string[] {
  if (!raw || raw.trim() === '') return []

  // Split by '/' or ','
  const parts = raw.split(/[/,]/)
  const result: string[] = []

  for (const part of parts) {
    // Each part may also contain ' và '
    const subParts = part.split(' và ')
    for (const sub of subParts) {
      const trimmed = sub.trim()
      if (trimmed) result.push(trimmed)
    }
  }

  return result
}

/**
 * Parse DANH_SACH_CAC_KENH_MEDIA.xlsx and build a normalized lookup map.
 *
 * File format: plain Excel, no skip rows, columns: TÊN | ID | Kênh
 * 71 rows of data.
 *
 * For each row:
 *   - normalize(channelDisplay) → (employeeName, channelDisplay)
 *   - for each id in split(ID): normalize(id) → (employeeName, channelDisplay)
 */
export function parseMappingFile(buffer: ArrayBuffer): MappingLookup {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false })

  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    throw new Error('File DANH SACH không có sheet nào.')
  }

  const sheet = workbook.Sheets[sheetName]

  // Read as array-of-arrays to find the header row
  const rawData: (string | number | boolean | null)[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
  })

  // Find header row containing TÊN, ID, Kênh
  let headerRowIndex = 0
  for (let i = 0; i < Math.min(rawData.length, 5); i++) {
    const row = rawData[i]
    if (!row) continue
    const hasName = row.some((c) => c !== null && String(c).trim() === 'TÊN')
    const hasChannel = row.some((c) => c !== null && String(c).trim() === 'Kênh')
    if (hasName && hasChannel) {
      headerRowIndex = i
      break
    }
  }

  const headerRow = rawData[headerRowIndex] || []
  const colIndex = new Map<string, number>()
  headerRow.forEach((cell, idx) => {
    if (cell !== null && cell !== undefined) {
      colIndex.set(String(cell).trim(), idx)
    }
  })

  const tenIdx = colIndex.get('TÊN') ?? -1
  const idIdx = colIndex.get('ID') ?? -1
  const kenhIdx = colIndex.get('Kênh') ?? -1

  const getCell = (row: (string | number | boolean | null)[], idx: number): string => {
    if (idx < 0) return ''
    const val = row[idx]
    if (val === null || val === undefined) return ''
    return String(val).trim()
  }

  const lookup = new Map<string, { employeeName: string; channelDisplay: string }>()
  const entries: MappingEntry[] = []
  const employeeSet = new Set<string>()
  const channelSet = new Set<string>()
  let unassignedCount = 0

  const dataRows = rawData.slice(headerRowIndex + 1)

  for (const row of dataRows) {
    if (!row || row.length === 0) continue

    const employeeName = getCell(row, tenIdx)
    const idRaw = getCell(row, idIdx)
    const channelDisplay = getCell(row, kenhIdx)

    // Skip completely empty rows
    if (!employeeName && !idRaw && !channelDisplay) continue

    const ids = splitIds(idRaw)

    const entry: MappingEntry = {
      employeeName,
      channelDisplay,
      ids,
    }
    entries.push(entry)

    if (employeeName) {
      employeeSet.add(employeeName)
    } else {
      unassignedCount++
    }

    if (channelDisplay) {
      channelSet.add(channelDisplay)
    }

    const value = {
      employeeName: employeeName || 'CHƯA GÁN',
      channelDisplay,
    }

    // Index by normalized channel display name
    if (channelDisplay) {
      const normChannel = normalize(channelDisplay)
      if (normChannel) {
        lookup.set(normChannel, value)
      }
    }

    // Index by each normalized ID
    for (const id of ids) {
      const normId = normalize(id)
      if (normId) {
        lookup.set(normId, value)
      }
    }
  }

  return {
    lookup,
    totalRows: entries.length,
    totalEmployees: employeeSet.size,
    totalChannels: channelSet.size,
    unassignedCount,
    entries,
  }
}
