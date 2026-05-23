/**
 * Phân tích 2 file Excel Sapo: chua_loc.xlsx vs da_loc.xlsx
 * Mục tiêu: Hiểu logic lọc hiện tại + xác định rules cho team traffic
 */
import XLSX from 'xlsx'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SAMPLES = path.resolve(__dirname, '..', 'samples')

// ============================================================
// HELPERS
// ============================================================

function readSheet(filePath) {
  const buf = fs.readFileSync(filePath)
  const wb = XLSX.read(buf, { cellDates: false })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  // Đọc raw: header ở dòng 5 (index 4), skip 4 dòng đầu
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null })
  return raw
}

function getHeaders(raw) {
  // Dòng 5 (index 4) là header columns
  return raw[4] || []
}

function getDataRows(raw) {
  // Data bắt đầu từ dòng 6 (index 5)
  const dataRows = raw.slice(5).filter(r => r && r.some(c => c !== null))
  
  // Forward-fill col2 (Mã đơn hàng) - index 1
  let lastCode = null
  for (const row of dataRows) {
    if (row[1]) lastCode = String(row[1]).trim()
    else row[1] = lastCode
  }
  return dataRows
}

function safeStr(val) { return val != null ? String(val).trim() : '' }
function safeNum(val) {
  if (val == null) return 0
  const n = Number(String(val).replace(/[^0-9.-]/g, ''))
  return isNaN(n) ? 0 : n
}

// ============================================================
// PHÂN TÍCH FILE
// ============================================================

function analyzeFile(name, filePath) {
  console.log(`\n${'='.repeat(70)}`)
  console.log(`📊 PHÂN TÍCH: ${name}`)
  console.log('='.repeat(70))

  const raw = readSheet(filePath)
  const headers = getHeaders(raw)
  const rows = getDataRows(raw)

  console.log(`\n📋 Tổng quan:`)
  console.log(`  - Số dòng header: 4`)
  console.log(`  - Số cột: ${headers.length}`)
  console.log(`  - Tổng dòng data (bao gồm multi-product): ${rows.length}`)

  // Dedupe by order code
  const seen = new Set()
  const uniqueRows = rows.filter(r => {
    const code = safeStr(r[1])
    if (!code || seen.has(code)) return false
    seen.add(code)
    return true
  })
  console.log(`  - Số đơn unique: ${uniqueRows.length}`)
  console.log(`  - Tỷ lệ dòng/đơn: ${(rows.length / uniqueRows.length).toFixed(1)}`)

  // ============================================================
  // PHÂN TÍCH STATUS (col7, index 6)
  // ============================================================
  console.log(`\n📌 TRẠNG THÁI ĐƠN HÀNG (cột 7):`)
  const statusCounts = {}
  for (const r of uniqueRows) {
    const s = safeStr(r[6]) || '(trống)'
    statusCounts[s] = (statusCounts[s] || 0) + 1
  }
  const sortedStatus = Object.entries(statusCounts).sort((a, b) => b[1] - a[1])
  for (const [status, count] of sortedStatus) {
    const pct = ((count / uniqueRows.length) * 100).toFixed(1)
    console.log(`  ${status}: ${count} đơn (${pct}%)`)
  }

  // ============================================================
  // PHÂN TÍCH NGUỒN (col5, index 4)
  // ============================================================
  console.log(`\n📌 NGUỒN (cột 5):`)
  const sourceCounts = {}
  for (const r of uniqueRows) {
    const s = safeStr(r[4]) || '(trống)'
    sourceCounts[s] = (sourceCounts[s] || 0) + 1
  }
  const sortedSources = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1])
  for (const [source, count] of sortedSources) {
    const pct = ((count / uniqueRows.length) * 100).toFixed(1)
    console.log(`  ${source}: ${count} đơn (${pct}%)`)
  }

  // ============================================================
  // PHÂN TÍCH TAGS (col18, index 17)
  // ============================================================
  console.log(`\n📌 TAGS (cột 18):`)
  
  // Phân loại tags
  const tagCategories = {
    'page_HuyK': { count: 0, revenue: 0 },
    'tiktok_business_HuyK': { count: 0, revenue: 0 },
    'bán trực tiếp': { count: 0, revenue: 0 },
    'zalo': { count: 0, revenue: 0 },
    'Không có tag': { count: 0, revenue: 0 },
    'Khác': { count: 0, revenue: 0 },
  }

  let hasBanTrucTiep = 0
  let hasZaloTag = 0
  let hasHuyKTag = 0
  let noTag = 0
  let allTagsSet = new Set()

  for (const r of uniqueRows) {
    const tagsRaw = safeStr(r[17])
    const amount = safeNum(r[15])
    const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : []
    
    if (tags.length === 0) {
      tagCategories['Không có tag'].count++
      tagCategories['Không có tag'].revenue += amount
      noTag++
      continue
    }

    tags.forEach(t => allTagsSet.add(t))

    let categorized = false
    for (const tag of tags) {
      const lower = tag.toLowerCase()
      if (lower.startsWith('page_huyk')) {
        tagCategories['page_HuyK'].count++
        tagCategories['page_HuyK'].revenue += amount
        categorized = true
        hasHuyKTag++
      } else if (lower.startsWith('tiktok_business_huyk')) {
        tagCategories['tiktok_business_HuyK'].count++
        tagCategories['tiktok_business_HuyK'].revenue += amount
        categorized = true
        hasHuyKTag++
      } else if (lower.includes('bán trực tiếp') || lower.includes('ban truc tiep')) {
        tagCategories['bán trực tiếp'].count++
        tagCategories['bán trực tiếp'].revenue += amount
        categorized = true
        hasBanTrucTiep++
      } else if (lower.includes('zalo')) {
        tagCategories['zalo'].count++
        tagCategories['zalo'].revenue += amount
        categorized = true
        hasZaloTag++
      }
    }
    if (!categorized) {
      tagCategories['Khác'].count++
      tagCategories['Khác'].revenue += amount
    }
  }

  for (const [cat, info] of Object.entries(tagCategories)) {
    if (info.count > 0) {
      const pct = ((info.count / uniqueRows.length) * 100).toFixed(1)
      const rev = (info.revenue / 1_000_000).toFixed(1)
      console.log(`  ${cat}: ${info.count} đơn (${pct}%) | ~${rev}M VND`)
    }
  }

  console.log(`\n  Tổng số tag unique: ${allTagsSet.size}`)

  // ============================================================
  // TỔNG DOANH THU
  // ============================================================
  const totalRevenue = uniqueRows.reduce((sum, r) => sum + safeNum(r[15]), 0)
  console.log(`\n💰 TỔNG DOANH THU: ${(totalRevenue / 1_000_000_000).toFixed(2)} tỷ VND`)

  // Revenue by source
  console.log(`\n📌 DOANH THU THEO NGUỒN:`)
  const revBySource = {}
  for (const r of uniqueRows) {
    const src = safeStr(r[4]) || '(trống)'
    revBySource[src] = (revBySource[src] || 0) + safeNum(r[15])
  }
  for (const [src, rev] of Object.entries(revBySource).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${src}: ${(rev / 1_000_000).toFixed(0)}M VND`)
  }

  // ============================================================
  // PHÂN TÍCH GHI CHÚ (col17, index 16)
  // ============================================================
  const exchangeKeywords = ['đổi hàng', 'đổi size', 'đổi sản phẩm', 'không thu', 'bù']
  let exchangeCount = 0
  for (const r of uniqueRows) {
    const note = safeStr(r[16]).toLowerCase()
    if (exchangeKeywords.some(k => note.includes(k))) exchangeCount++
  }
  console.log(`\n📌 GHI CHÚ:`)
  console.log(`  Đơn có keyword đổi hàng: ${exchangeCount} (${((exchangeCount/uniqueRows.length)*100).toFixed(1)}%)`)

  return {
    name,
    totalRows: rows.length,
    uniqueOrders: uniqueRows.length,
    statusCounts,
    sourceCounts,
    tagCategories,
    totalRevenue,
    hasBanTrucTiep,
    hasZaloTag,
    hasHuyKTag,
    noTag,
    exchangeCount,
    allTags: [...allTagsSet],
    revBySource,
    rows: uniqueRows,
  }
}

// ============================================================
// SO SÁNH 2 FILE
// ============================================================

function compareFiles(resultA, resultB) {
  console.log(`\n${'='.repeat(70)}`)
  console.log(`🔍 SO SÁNH ${resultA.name} vs ${resultB.name}`)
  console.log('='.repeat(70))

  console.log(`\n| Chỉ số | ${resultA.name} | ${resultB.name} | Khác biệt |`)
  console.log('|--------|--------|--------|--------|')
  
  const compare = (label, valA, valB, fmt) => {
    const diff = valB - valA
    const diffStr = diff > 0 ? `+${fmt(diff)}` : fmt(diff)
    console.log(`| ${label} | ${fmt(valA)} | ${fmt(valB)} | ${diffStr} |`)
  }

  compare('Tổng dòng', resultA.totalRows, resultB.totalRows, v => v)
  compare('Đơn unique', resultA.uniqueOrders, resultB.uniqueOrders, v => v)
  compare('Doanh thu (tỷ)', resultA.totalRevenue/1e9, resultB.totalRevenue/1e9, v => v.toFixed(2))
  compare('Có HuyK tag', resultA.hasHuyKTag, resultB.hasHuyKTag, v => v)
  compare('Bán trực tiếp', resultA.hasBanTrucTiep, resultB.hasBanTrucTiep, v => v)
  compare('Có Zalo tag', resultA.hasZaloTag, resultB.hasZaloTag, v => v)
  compare('Không tag', resultA.noTag, resultB.noTag, v => v)
  compare('Đổi hàng', resultA.exchangeCount, resultB.exchangeCount, v => v)

  // So sánh status
  console.log(`\n📌 Khác biệt về Status:`)
  const allStatuses = new Set([...Object.keys(resultA.statusCounts), ...Object.keys(resultB.statusCounts)])
  for (const s of allStatuses) {
    const a = resultA.statusCounts[s] || 0
    const b = resultB.statusCounts[s] || 0
    if (a !== b) {
      console.log(`  "${s}": ${a} → ${b} (${b-a > 0 ? '+' : ''}${b-a})`)
    }
  }

  // So sánh source
  console.log(`\n📌 Khác biệt về Nguồn:`)
  const allSources = new Set([...Object.keys(resultA.sourceCounts), ...Object.keys(resultB.sourceCounts)])
  for (const s of allSources) {
    const a = resultA.sourceCounts[s] || 0
    const b = resultB.sourceCounts[s] || 0
    if (a !== b) {
      console.log(`  "${s}": ${a} → ${b} (${b-a > 0 ? '+' : ''}${b-a})`)
    }
  }

  // Tags chỉ có trong file A (đã bị lọc)
  const tagsOnlyInA = resultA.allTags.filter(t => !resultB.allTags.includes(t))
  if (tagsOnlyInA.length > 0) {
    console.log(`\n📌 Tags CHỈ có trong ${resultA.name} (đã bị lọc):`)
    tagsOnlyInA.slice(0, 20).forEach(t => console.log(`  - "${t}"`))
    if (tagsOnlyInA.length > 20) console.log(`  ... và ${tagsOnlyInA.length - 20} tags khác`)
  }

  // Tags chỉ có trong file B (mới xuất hiện)
  const tagsOnlyInB = resultB.allTags.filter(t => !resultA.allTags.includes(t))
  if (tagsOnlyInB.length > 0) {
    console.log(`\n📌 Tags CHỈ có trong ${resultB.name} (mới):`)
    tagsOnlyInB.slice(0, 20).forEach(t => console.log(`  - "${t}"`))
  }
}

// ============================================================
// PHÂN TÍCH TEAM TRAFFIC
// ============================================================
function analyzeTrafficTeam(result) {
  console.log(`\n${'='.repeat(70)}`)
  console.log(`🎯 PHÂN TÍCH TEAM TRAFFIC`)
  console.log('='.repeat(70))

  console.log(`\n📋 Quy tắc lọc cho team traffic:`)
  console.log(`  1. Chỉ lấy đơn "Đã hoàn thành"`)
  console.log(`  2. LOẠI BỎ đơn có tag "bán trực tiếp" (của Cửa hàng)`)
  console.log(`  3. Zalo: mỗi media phụ trách 1 kênh Zalo → cần map riêng`)
  console.log(`  4. Facebook không tag: thuộc team traffic nhưng KHÔNG gán được cho ai`)
  console.log(`  5. Chỉ lấy nguồn: Facebook, Tiktok for Business, Zalo`)

  // Lọc đơn hoàn thành
  const completed = result.rows.filter(r => safeStr(r[6]) === 'Đã hoàn thành')
  console.log(`\n📊 Sau khi lọc "Đã hoàn thành": ${completed.length} đơn`)

  // Lọc bỏ bán trực tiếp
  const noBanTrucTiep = completed.filter(r => {
    const tags = safeStr(r[17]).toLowerCase()
    return !tags.includes('bán trực tiếp') && !tags.includes('ban truc tiep')
  })
  console.log(`📊 Sau khi bỏ "bán trực tiếp": ${noBanTrucTiep.length} đơn (loại ${completed.length - noBanTrucTiep.length})`)

  // Phân loại theo nguồn
  const trafficSources = ['Facebook', 'Tiktok for Business', 'Zalo']
  const bySource = {}
  let fbNoTag = 0
  let fbNoTagRev = 0

  for (const r of noBanTrucTiep) {
    const src = safeStr(r[4])
    const tags = safeStr(r[17])
    const amount = safeNum(r[15])

    if (!trafficSources.includes(src)) continue

    bySource[src] = bySource[src] || { count: 0, revenue: 0, noTagCount: 0, noTagRevenue: 0, tags: {} }

    bySource[src].count++
    bySource[src].revenue += amount

    // Parse tags
    const tagList = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : []
    if (tagList.length === 0) {
      bySource[src].noTagCount++
      bySource[src].noTagRevenue += amount
    }
    tagList.forEach(t => {
      bySource[src].tags[t] = (bySource[src].tags[t] || 0) + 1
    })
  }

  console.log(`\n📊 Phân tích theo nguồn (traffic):`)
  for (const [src, info] of Object.entries(bySource)) {
    console.log(`\n  🔹 ${src}:`)
    console.log(`     Tổng đơn: ${info.count}`)
    console.log(`     Doanh thu: ${(info.revenue / 1_000_000).toFixed(0)}M VND`)
    console.log(`     Không tag: ${info.noTagCount} đơn (${(info.noTagRevenue / 1_000_000).toFixed(0)}M VND) — KHÔNG GÁN ĐƯỢC`)
    
    // Top tags
    const topTags = Object.entries(info.tags).sort((a, b) => b[1] - a[1]).slice(0, 5)
    console.log(`     Top tags: ${topTags.map(([t, c]) => `${t} (${c})`).join(', ')}`)
  }

  // Tổng kết traffic
  const totalTrafficOrders = Object.values(bySource).reduce((s, i) => s + i.count, 0)
  const totalTrafficRevenue = Object.values(bySource).reduce((s, i) => s + i.revenue, 0)
  const totalNoTag = Object.values(bySource).reduce((s, i) => s + i.noTagCount, 0)
  const totalNoTagRev = Object.values(bySource).reduce((s, i) => s + i.noTagRevenue, 0)

  console.log(`\n${'─'.repeat(50)}`)
  console.log(`🎯 TỔNG TEAM TRAFFIC:`)
  console.log(`  Đơn: ${totalTrafficOrders}`)
  console.log(`  Doanh thu: ${(totalTrafficRevenue / 1_000_000_000).toFixed(2)} tỷ VND`)
  console.log(`  Gán được: ${totalTrafficOrders - totalNoTag} đơn | ${((totalTrafficRevenue - totalNoTagRev) / 1_000_000_000).toFixed(2)} tỷ`)
  console.log(`  KHÔNG GÁN ĐƯỢC (không tag): ${totalNoTag} đơn | ${(totalNoTagRev / 1_000_000_000).toFixed(2)} tỷ`)

  return {
    completed: completed.length,
    noBanTrucTiep: noBanTrucTiep.length,
    bySource,
    totalTrafficOrders,
    totalTrafficRevenue,
    totalNoTag,
    totalNoTagRev,
  }
}

// ============================================================
// MAIN
// ============================================================

function main() {
  const fileChuaLoc = path.join(SAMPLES, 'chua_loc.xlsx')
  const fileDaLoc = path.join(SAMPLES, 'da_loc.xlsx')

  if (!fs.existsSync(fileChuaLoc)) {
    console.error('❌ Không tìm thấy chua_loc.xlsx')
    process.exit(1)
  }
  if (!fs.existsSync(fileDaLoc)) {
    console.error('❌ Không tìm thấy da_loc.xlsx')
    process.exit(1)
  }

  // Analyze both files
  const resultChuaLoc = analyzeFile('chua_loc.xlsx (CHƯA LỌC)', fileChuaLoc)
  const resultDaLoc = analyzeFile('da_loc.xlsx (ĐÃ LỌC)', fileDaLoc)

  // Compare
  compareFiles(resultChuaLoc, resultDaLoc)

  // Traffic team analysis on raw file
  analyzeTrafficTeam(resultChuaLoc)
}

main()
