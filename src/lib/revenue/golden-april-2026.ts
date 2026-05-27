export const GOLDEN_APRIL_2026_PERIOD = '2026-04'

export const GOLDEN_APRIL_2026_EMPLOYEE_ORDER = [
  'NGA',
  'VÂN',
  'ÁNH',
  'LINH',
  'NAM',
  'TUÂN',
  'QUYẾT',
  'TIẾN ĐẠT',
  'LƯƠNG',
  'K.ĐẠT',
  'HIỀN',
  'HỒ ĐẠT',
  'TOÁN',
  'Đ.THẮNG',
  'H.TRANG',
  'AN',
  'TUẤN',
  'BÙI ĐOÀN',
  'CÔNG',
] as const

export const GOLDEN_APRIL_2026_EMPLOYEE_TOTALS: Record<string, number> = {
  NGA: 791_446_000,
  'VÂN': 1_007_956_000,
  'ÁNH': 942_151_999,
  LINH: 929_422_500,
  NAM: 1_459_724_000,
  'TUÂN': 4_200_000,
  'QUYẾT': 0,
  'TIẾN ĐẠT': 298_648_000,
  'LƯƠNG': 0,
  'K.ĐẠT': 0,
  'HIỀN': 0,
  'HỒ ĐẠT': 424_898_000,
  'TOÁN': 1_185_000,
  'Đ.THẮNG': 0,
  'H.TRANG': 0,
  AN: 107_550_000,
  'TUẤN': 128_377_000,
  'BÙI ĐOÀN': 178_642_500,
  'CÔNG': 63_735_000,
}

export const GOLDEN_APRIL_2026_GROUP_TOTALS: Record<string, number> = {
  FB: 6_475_730_999,
  TT: 1_222_381_000,
  ZALO: 712_993_000,
  YOUTUBE: 0,
  IG: 12_720_000,
  AFFILIATE: -4_200_000,
  JAPAN: 485_755_000,
  KOL: 1_860_000,
}

export const GOLDEN_APRIL_2026_GRAND_TOTALS = {
  employeeTotal: 6_337_935_999,
  workbookTotal: 6_432_505_999,
}

/**
 * Manual adjustment fixture that reconciles the current sample-derived Sapo
 * totals to the PDF golden employee totals. These are intentionally modeled
 * as data, not business logic, so future months can import their own
 * adjustment rows instead of changing code.
 */
export const GOLDEN_APRIL_2026_ADJUSTMENTS = [
  { employeeName: 'AN', amount: -6_527_000 },
  { employeeName: 'BÙI ĐOÀN', amount: 112_177_500 },
  { employeeName: 'CÔNG', amount: 63_735_000 },
  { employeeName: 'HUY', amount: -572_316_000 },
  { employeeName: 'HUYỀN TRANG', amount: -108_415_000 },
  { employeeName: 'HỒ ĐẠT', amount: 20_775_000 },
  { employeeName: 'LINH', amount: -430_550_500 },
  { employeeName: 'NAM', amount: 1_459_724_000 },
  { employeeName: 'NGA', amount: -31_888_000 },
  { employeeName: 'QUYẾT', amount: -288_513_000 },
  { employeeName: 'THÀNH ADS', amount: -241_190_000 },
  { employeeName: 'TIẾN ĐẠT', amount: 298_648_000 },
  { employeeName: 'TUÂN', amount: 4_200_000 },
  { employeeName: 'TUẤN', amount: -23_740_500 },
  { employeeName: 'VIỆT ADS', amount: -124_200_000 },
  { employeeName: 'VÂN', amount: 128_328_001 },
  { employeeName: 'ÁNH', amount: 39_654_279 },
].map((row) => ({
  period: GOLDEN_APRIL_2026_PERIOD,
  employeeName: row.employeeName,
  channelGroup: 'PDF_ADJUSTMENT',
  channelName: 'BC Doanh thu theo nhóm VCB 2026 - Tổng4.26.pdf',
  amount: row.amount,
  reason: 'Reconcile sample Sapo output to April 2026 PDF golden total',
  sourceLabel: 'golden-april-2026',
}))
