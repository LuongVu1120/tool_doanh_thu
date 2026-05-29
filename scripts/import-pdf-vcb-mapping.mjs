/**
 * Import mapping kênh ↔ chủ kênh từ file
 *   "BC Doanh thu theo nhóm VCB 2026 - Tổng4.26.pdf"
 *
 * Cách chạy:
 *   1) DRY-RUN (xem thử kết quả match):
 *        node scripts/import-pdf-vcb-mapping.mjs
 *
 *   2) APPLY (ghi vào DB):
 *        node scripts/import-pdf-vcb-mapping.mjs --apply
 *
 * Script làm 2 việc:
 *   A) Match channel_ref → sapo_channels.id
 *      - Numeric (>= 13 chữ số): exact match qua branch_external_id
 *      - Text:                    fuzzy match qua branch_name (loại bỏ dấu + lowercase + token)
 *   B) Resolve owner short_name → sapo_user_id
 *      - Lookup từ SHORT_NAME_TO_SAPO_ID
 *      - Đánh dấu owner null → cần user gán tay
 *
 * Output cuối: tự động bật is_media_team=true cho các owner được map,
 *              và set media_member_id cho từng channel.
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import { SHORT_NAME_TO_SAPO_ID, PDF_ENTRIES } from './data/pdf-vcb-mapping.mjs'

const env = {}
for (const line of fs.readFileSync('.env', 'utf-8').split('\n')) {
  const [k, ...v] = line.split('=')
  if (k) env[k.trim()] = v.join('=').trim().replace(/^"|"$/g, '')
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const APPLY = process.argv.includes('--apply')

// ============================================================
// HELPERS
// ============================================================
function normalize(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function isAllDigits(s) {
  return /^\d{12,}$/.test(String(s || '').trim())
}

// ============================================================
// LOAD DATA
// ============================================================
const { data: channels } = await supabase
  .from('sapo_channels')
  .select('id, alias, branch_name, branch_external_id, platform, main_name, sub_name, orders_count, media_member_id')

const { data: members } = await supabase
  .from('sapo_members')
  .select('sapo_user_id, full_name, prefix_code, is_media_team')

const channelsByExtId = new Map()
for (const c of channels || []) {
  if (c.branch_external_id) channelsByExtId.set(String(c.branch_external_id).trim(), c)
}

const channelsByNorm = new Map()
for (const c of channels || []) {
  const keys = [normalize(c.branch_name), normalize(c.alias)]
  for (const k of keys) {
    if (!k) continue
    if (!channelsByNorm.has(k)) channelsByNorm.set(k, [])
    channelsByNorm.get(k).push(c)
  }
}

const memberById = new Map((members || []).map((m) => [m.sapo_user_id, m]))

console.log(`\n=== ĐÃ LOAD: ${channels?.length} kênh, ${members?.length} nhân viên ===\n`)

// Map PDF label prefix → Sapo platform để tránh cross-platform false-positive khi fuzzy match.
function inferPlatformFromLabel(label) {
  const l = String(label || '').toLowerCase()
  if (l.startsWith('fb -') || l.startsWith('fb-')) return 'facebook'
  if (l.startsWith('tt shop') || l.startsWith('tt-shop')) return 'tiktok'
  if (l.startsWith('tt -') || l.startsWith('tt-')) return 'tiktok'
  if (l.startsWith('zalo')) return 'zalo'
  if (l.startsWith('ig -') || l.startsWith('ig-')) return 'other' // instagram nằm trong 'other'
  if (l.startsWith('youtube')) return 'other' // youtube cũng 'other'
  return null
}

// ============================================================
// RESOLVE: PDF entry → Sapo channel + Sapo member
// ============================================================
const results = []
const ownerStats = new Map()  // owner → { resolvedId, channelCount }
const missingOwners = new Set()

function resolveChannel(refs, label) {
  // 1) Thử numeric exact match qua branch_external_id (chính xác 100%)
  for (const ref of refs) {
    const r = String(ref || '').trim()
    if (isAllDigits(r) && channelsByExtId.has(r)) {
      return { channel: channelsByExtId.get(r), strategy: `ext_id=${r}` }
    }
  }
  // 2) Fuzzy match qua branch_name — CHỈ trong cùng platform (tránh false-positive)
  const targetPlatform = inferPlatformFromLabel(label)
  const filterByPlatform = (list) => (targetPlatform ? list.filter((c) => c.platform === targetPlatform) : list)

  for (const ref of refs) {
    const norm = normalize(ref)
    if (!norm) continue
    if (channelsByNorm.has(norm)) {
      const list = filterByPlatform(channelsByNorm.get(norm))
      if (list.length > 0) {
        const top = list.sort((a, b) => b.orders_count - a.orders_count)[0]
        return { channel: top, strategy: `name~"${ref}" → "${top.branch_name || top.alias}" (${top.platform})` }
      }
    }
    // partial match — cũng filter platform
    for (const [k, list] of channelsByNorm.entries()) {
      if (k.length > 5 && (k.includes(norm) || norm.includes(k))) {
        const filtered = filterByPlatform(list)
        if (filtered.length > 0) {
          const top = filtered.sort((a, b) => b.orders_count - a.orders_count)[0]
          return {
            channel: top,
            strategy: `name partial "${ref}" → "${top.branch_name || top.alias}" (${top.platform})`,
          }
        }
      }
    }
  }
  return { channel: null, strategy: null }
}

for (const entry of PDF_ENTRIES) {
  const { channel, strategy } = resolveChannel(entry.refs, entry.label)
  const ownerId = SHORT_NAME_TO_SAPO_ID[entry.owner] ?? null

  if (!ownerId) missingOwners.add(entry.owner)

  if (ownerId) {
    if (!ownerStats.has(ownerId)) ownerStats.set(ownerId, { sapoId: ownerId, channels: [] })
    if (channel) ownerStats.get(ownerId).channels.push(channel)
  }

  results.push({
    pdf_label: entry.label,
    pdf_owner: entry.owner,
    pdf_refs: entry.refs,
    resolved_owner_id: ownerId,
    resolved_owner_name: ownerId ? memberById.get(ownerId)?.full_name : null,
    resolved_channel_id: channel?.id || null,
    resolved_channel_name: channel ? channel.branch_name || channel.alias : null,
    resolved_channel_orders: channel?.orders_count ?? null,
    resolved_strategy: strategy,
    status:
      channel && ownerId
        ? 'OK'
        : !channel && ownerId
          ? 'NO_CHANNEL'
          : channel && !ownerId
            ? 'NO_OWNER'
            : 'BOTH_MISSING',
  })
}

// ============================================================
// REPORT
// ============================================================
const ok = results.filter((r) => r.status === 'OK')
const noChannel = results.filter((r) => r.status === 'NO_CHANNEL')
const noOwner = results.filter((r) => r.status === 'NO_OWNER')
const bothMissing = results.filter((r) => r.status === 'BOTH_MISSING')

console.log('=== KẾT QUẢ MATCH ===')
console.log(`✅ OK            : ${ok.length} entries (channel + owner đều khớp)`)
console.log(`⚠️  NO_CHANNEL    : ${noChannel.length} (owner ok, channel chưa tìm thấy)`)
console.log(`⚠️  NO_OWNER      : ${noOwner.length} (channel ok, owner chưa map)`)
console.log(`❌ BOTH_MISSING  : ${bothMissing.length}`)

if (ok.length > 0) {
  console.log('\n=== ✅ Entries khớp hoàn toàn ===')
  console.table(
    ok.map((r) => ({
      label: r.pdf_label,
      pdf_owner: r.pdf_owner,
      sapo_owner: r.resolved_owner_name,
      channel: r.resolved_channel_name,
      orders: r.resolved_channel_orders,
      strategy: r.resolved_strategy,
    }))
  )
}

if (noChannel.length > 0) {
  console.log('\n=== ⚠️ Tên kênh trong PDF không khớp với Sapo (cần đặt tên hoặc kiểm tra) ===')
  console.table(
    noChannel.map((r) => ({
      label: r.pdf_label,
      owner: r.pdf_owner,
      refs: r.pdf_refs.join(' | '),
    }))
  )
}

if (noOwner.length > 0) {
  console.log('\n=== ⚠️ Channel khớp nhưng owner chưa map trong SHORT_NAME_TO_SAPO_ID ===')
  console.table(
    noOwner.map((r) => ({
      pdf_owner: r.pdf_owner,
      channel: r.resolved_channel_name,
      orders: r.resolved_channel_orders,
    }))
  )
}

if (missingOwners.size > 0) {
  console.log('\n=== 🔍 Owner cần user xác nhận sapo_user_id ===')
  console.log('Hãy edit file scripts/data/pdf-vcb-mapping.mjs và gán số id thực:')
  console.log([...missingOwners].map((o) => `  '${o}': null,`).join('\n'))
}

// ============================================================
// APPLY (nếu có --apply)
// ============================================================
if (!APPLY) {
  console.log('\n⏸  DRY-RUN. Để ghi vào DB, chạy:')
  console.log('    node scripts/import-pdf-vcb-mapping.mjs --apply')
  process.exit(0)
}

console.log('\n=== ✍️ ĐANG GHI VÀO DB ===')

// Phát hiện conflict: cùng 1 channel được gán cho nhiều owner khác nhau
const channelOwnerMap = new Map() // channelId → Set<ownerId>
for (const r of ok) {
  if (!channelOwnerMap.has(r.resolved_channel_id)) channelOwnerMap.set(r.resolved_channel_id, new Map())
  const owners = channelOwnerMap.get(r.resolved_channel_id)
  if (!owners.has(r.resolved_owner_id)) owners.set(r.resolved_owner_id, [])
  owners.get(r.resolved_owner_id).push(r.pdf_label)
}

const conflicts = []
for (const [chId, owners] of channelOwnerMap.entries()) {
  if (owners.size > 1) {
    conflicts.push({
      channel_id: chId,
      channel_name: ok.find((r) => r.resolved_channel_id === chId)?.resolved_channel_name,
      owners: [...owners.entries()].map(([oid, labels]) => ({
        owner_id: oid,
        owner_name: memberById.get(oid)?.full_name,
        from_pdf_labels: labels,
      })),
    })
  }
}

if (conflicts.length > 0) {
  console.log(`\n⚠️ Phát hiện ${conflicts.length} kênh bị gán cho nhiều người khác nhau (sẽ chọn người đầu tiên theo thứ tự xuất hiện trong PDF):`)
  for (const c of conflicts) {
    console.log(`\n  📍 ${c.channel_name}:`)
    for (const o of c.owners) {
      console.log(`     - ${o.owner_name} ← từ ${o.from_pdf_labels.join(' | ')}`)
    }
  }
}

// Deduplicate: chọn owner đầu tiên gặp được cho mỗi channel
const finalAssignments = new Map() // channelId → ownerId
for (const r of ok) {
  if (!finalAssignments.has(r.resolved_channel_id)) {
    finalAssignments.set(r.resolved_channel_id, r.resolved_owner_id)
  }
}

// 1) Bật is_media_team = true cho tất cả owner được map
const ownerIds = [...ownerStats.keys()]
console.log(`\n[1/2] Bật is_media_team=true cho ${ownerIds.length} nhân viên...`)
for (const id of ownerIds) {
  const m = memberById.get(id)
  if (!m) {
    console.log(`  - bỏ qua #${id}: không tìm thấy trong sapo_members`)
    continue
  }
  if (m.is_media_team) {
    console.log(`  - #${id} ${m.full_name}: đã bật, bỏ qua`)
    continue
  }
  const { error } = await supabase
    .from('sapo_members')
    .update({ is_media_team: true })
    .eq('sapo_user_id', id)
  if (error) console.log(`  ❌ #${id} ${m.full_name}: ${error.message}`)
  else console.log(`  ✅ #${id} ${m.full_name}: đã bật is_media_team=true`)
}

// 2) Gán media_member_id cho từng channel (đã dedupe)
console.log(`\n[2/2] Gán chủ kênh cho ${finalAssignments.size} kênh duy nhất (từ ${ok.length} entries PDF)...`)
let success = 0
let failed = 0
for (const [channelId, ownerId] of finalAssignments.entries()) {
  const { error } = await supabase
    .from('sapo_channels')
    .update({ media_member_id: ownerId })
    .eq('id', channelId)
  if (error) {
    const r = ok.find((x) => x.resolved_channel_id === channelId)
    console.log(`  ❌ ${r?.pdf_label || channelId}: ${error.message}`)
    failed++
  } else {
    success++
  }
}

console.log(`\n✅ Hoàn tất: ${success} kênh đã gán thành công, ${failed} thất bại.`)

// Lưu report ra JSON để user xem chi tiết
const reportPath = 'pdf-vcb-import-report.json'
fs.writeFileSync(
  reportPath,
  JSON.stringify({ summary: { ok: ok.length, noChannel: noChannel.length, noOwner: noOwner.length }, results, missingOwners: [...missingOwners] }, null, 2)
)
console.log(`📄 Báo cáo chi tiết: ${reportPath}`)
