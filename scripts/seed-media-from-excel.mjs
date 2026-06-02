/**
 * Seed Media owners and channel assignments from the accounting workbook.
 *
 * Usage:
 *   node scripts/seed-media-from-excel.mjs --file "C:\path\BC Doanh thu theo nhóm VCB 2026 (1).xlsx"
 *   node scripts/seed-media-from-excel.mjs --file "C:\path\BC Doanh thu theo nhóm VCB 2026 (1).xlsx" --apply
 *
 * The workbook "Tổng..." sheets are the source of truth:
 *   owner -> channel reference/name.
 *
 * We create internal Media members with negative IDs so revenue attribution no
 * longer depends on Sapo users/Gmail accounts.
 */

import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import XLSX from 'xlsx'

const APPLY = process.argv.includes('--apply')
const OVERWRITE = !process.argv.includes('--no-overwrite')
const CLEAR_SAPO_MEDIA = !process.argv.includes('--keep-sapo-media')
const UPSERT_ALIAS_REVIEW = !process.argv.includes('--no-alias-review')
const filePath = resolveWorkbookPath(readArg('--file'))

function readArg(name) {
  const idx = process.argv.indexOf(name)
  if (idx < 0) return null
  return process.argv[idx + 1] || null
}

function resolveWorkbookPath(input) {
  if (input && fs.existsSync(input)) return input
  const downloads = 'C:/Users/vudai/Downloads'
  if (fs.existsSync(downloads)) {
    const fileName = fs
      .readdirSync(downloads)
      .find((name) => name.startsWith('BC Doanh thu theo') && name.includes('VCB 2026') && name.endsWith('.xlsx'))
    if (fileName) return path.join(downloads, fileName)
  }
  return input || 'C:/Users/vudai/Downloads/BC Doanh thu theo nh?m VCB 2026 (1).xlsx'
}

function loadEnv() {
  const envPath = path.resolve('.env')
  const env = {}
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue
    const [key, ...rest] = line.split('=')
    if (!key) continue
    env[key.trim()] = rest.join('=').trim().replace(/^"|"$/g, '')
  }
  return env
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function compact(value) {
  return normalize(value).replace(/\s+/g, '')
}

function titleOwner(owner) {
  return String(owner || '').trim().replace(/\s+/g, ' ')
}

function isLikelyOwner(owner) {
  const raw = titleOwner(owner)
  const n = normalize(raw)
  if (!raw || raw.length > 40) return false
  if (raw !== raw.toLocaleUpperCase('vi-VN')) return false
  if (raw.includes('.') || raw.includes('@')) return false
  if (/^(fb|tt|tiktok|zalo|ig|huyk|shopify|web|pos)\b/.test(n)) return false
  if (/^(doanh|tong|xac nhan)$/i.test(n)) return false
  return true
}

function stableMemberId(owner) {
  const hash = crypto.createHash('sha1').update(normalize(owner)).digest().readUInt32BE(0)
  return -1_000_000_000 - hash
}

function parseMoney(value) {
  const n = Number(String(value ?? '').replace(/[,\s]/g, ''))
  return Number.isFinite(n) ? n : 0
}

function parseMonthKey(sheetName) {
  const key = compact(sheetName)
  const m2026 = /^tong(\d{1,2})26$/i.exec(key)
  if (m2026) return `2026-${String(Number(m2026[1])).padStart(2, '0')}`
  const m2025 = /^tong(\d{1,2})$/i.exec(key)
  if (m2025) return `2025-${String(Number(m2025[1])).padStart(2, '0')}`
  return null
}

function inferPlatform(label) {
  const n = normalize(label)
  if (n.startsWith('fb ') || n.includes(' facebook') || n.includes('page ')) return 'facebook'
  if (n.startsWith('tt ') || n.startsWith('ttshop ') || n.includes('tiktok')) return 'tiktok'
  if (n.startsWith('zalo') || n.includes(' zalo')) return 'zalo'
  if (n.includes('shopee')) return 'shopee'
  if (n.includes('pos')) return 'pos'
  if (n.includes('web')) return 'website'
  return null
}

function extractExternalIds(...values) {
  const text = values.map((v) => String(v || '')).join(' ')
  const ids = new Set()
  for (const re of [
    /page_id[_\s-]*(\d{5,})/gi,
    /id[_\s-]*(\d{5,})/gi,
    /\b(\d{12,})\b/g,
  ]) {
    let match
    while ((match = re.exec(text))) ids.add(match[1])
  }
  return [...ids]
}

function channelNameKeys(value) {
  const raw = String(value || '')
  const variants = new Set([raw])
  variants.add(raw.replace(/^(FB|TT|TT Shop|Zalo|Web|POS)\s*[-:]\s*/i, ''))
  variants.add(raw.replace(/^TT-?/i, 'TikTok '))
  variants.add(raw.replace(/^FB-?/i, 'Facebook '))
  return [...variants].map(normalize).filter(Boolean)
}

function parseWorkbook(file) {
  const workbook = XLSX.readFile(file, { cellDates: true })
  const rows = []

  for (const sheetName of workbook.SheetNames) {
    const month = parseMonthKey(sheetName)
    if (!month) continue

    const sheet = workbook.Sheets[sheetName]
    const values = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false, blankrows: false })
    if (values.length < 2) continue

    const header = values[0].map((v) => normalize(v))
    const idIdx = header.findIndex((h) => h === 'id')
    const channelIdx = header.findIndex((h) => h === 'kenh')
    const revenueIdx = header.findIndex((h) => h === 'doanh thu')

    for (let i = 1; i < values.length; i++) {
      const row = values[i]
      const owner = titleOwner(row[0])
      const channelRef = idIdx >= 0 ? String(row[idIdx] || '').trim() : ''
      const channelName = channelIdx >= 0 ? String(row[channelIdx] || '').trim() : ''
      if (!owner || !channelName) continue
      if (!isLikelyOwner(owner)) continue
      if (normalize(owner) === normalize(channelName)) continue

      rows.push({
        sheetName,
        month,
        rowNumber: i + 1,
        owner,
        ownerKey: normalize(owner),
        memberId: stableMemberId(owner),
        channelRef,
        channelName,
        revenue: revenueIdx >= 0 ? parseMoney(row[revenueIdx]) : 0,
        externalIds: extractExternalIds(channelRef, channelName),
        platform: inferPlatform(`${channelRef} ${channelName}`),
      })
    }
  }

  const latestByChannel = new Map()
  for (const row of rows) {
    const keySource = row.externalIds[0] || row.channelName
    const key = row.externalIds[0] ? `id:${row.externalIds[0]}` : `name:${compact(keySource)}`
    const previous = latestByChannel.get(key)
    if (!previous || row.month > previous.month) latestByChannel.set(key, row)
  }

  return [...latestByChannel.values()].sort((a, b) => a.channelName.localeCompare(b.channelName, 'vi'))
}

function buildChannelIndexes(channels) {
  const byExtId = new Map()
  const byName = new Map()

  for (const channel of channels) {
    if (channel.branch_external_id) {
      const k = String(channel.branch_external_id).trim()
      if (!byExtId.has(k)) byExtId.set(k, [])
      byExtId.get(k).push(channel)
    }

    for (const value of [channel.branch_name, channel.alias, channel.main_name, channel.sub_name]) {
      for (const key of channelNameKeys(value)) {
        if (!byName.has(key)) byName.set(key, [])
        byName.get(key).push(channel)
      }
    }
  }

  return { byExtId, byName }
}

function filterPlatform(candidates, platform) {
  if (!platform) return candidates
  const exact = candidates.filter((c) => c.platform === platform)
  return exact
}

function aliasLookupKeys(row) {
  const keys = new Set()
  for (const key of channelNameKeys(row.channelName)) keys.add(`${row.platform || ''}|${key}`)
  for (const key of channelNameKeys(row.channelRef)) keys.add(`${row.platform || ''}|${key}`)
  for (const key of channelNameKeys(row.channelName)) keys.add(`|${key}`)
  for (const key of channelNameKeys(row.channelRef)) keys.add(`|${key}`)
  return [...keys].filter((key) => !key.endsWith('|'))
}

function matchChannel(row, indexes, confirmedAliasByKey = new Map(), channelById = new Map()) {
  for (const key of aliasLookupKeys(row)) {
    const alias = confirmedAliasByKey.get(key)
    const channel = alias?.channel_id ? channelById.get(alias.channel_id) : null
    if (channel) {
      return {
        channels: [channel],
        strategy: `alias:${alias.alias_text}`,
        alias,
      }
    }
  }

  for (const extId of row.externalIds) {
    const candidates = filterPlatform(indexes.byExtId.get(extId) || [], row.platform)
    if (candidates.length === 1) return { channels: candidates, strategy: `external_id:${extId}` }
    if (candidates.length > 1) return { channel: null, strategy: `ambiguous_external_id:${extId}`, candidates }
  }

  for (const key of channelNameKeys(row.channelName)) {
    const candidates = filterPlatform(indexes.byName.get(key) || [], row.platform)
    if (candidates.length === 1) return { channels: candidates, strategy: `name:${key}` }
    if (candidates.length > 1 && row.platform && candidates.every((c) => c.platform === row.platform)) {
      return { channels: candidates, strategy: `multi_name:${key}` }
    }
    if (candidates.length > 1) return { channel: null, strategy: `ambiguous_name:${key}`, candidates }
  }

  return { channels: [], strategy: 'not_found', candidates: [] }
}

function displayChannel(channel) {
  return `${channel.branch_name || channel.alias || channel.id} [${channel.platform}] ${channel.branch_external_id || ''}`.trim()
}

function aliasUniqueKey(row) {
  return `excel_2026|${row.platform || ''}|${normalize(row.channelName)}`
}

function aliasReviewRow(row, status, match) {
  return {
    alias_text: row.channelName,
    normalized_alias: normalize(row.channelName),
    platform: row.platform,
    platform_key: row.platform || '',
    excel_owner: row.owner,
    excel_month: row.month,
    excel_revenue: row.revenue,
    owner_member_id: row.memberId,
    source: 'excel_2026',
    confidence: 'review',
    status,
    candidates: (match.candidates || []).slice(0, 12).map((channel) => ({
      channel_id: channel.id,
      name: channel.branch_name || channel.alias || channel.id,
      alias: channel.alias,
      platform: channel.platform,
      external_id: channel.branch_external_id,
      orders_count: channel.orders_count || 0,
    })),
    notes: row.channelRef || null,
  }
}

const env = loadEnv()
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const mappings = parseWorkbook(filePath)
const { data: channels, error: channelError } = await supabase
  .from('sapo_channels')
  .select('id, alias, branch_name, branch_external_id, platform, main_name, sub_name, orders_count, media_member_id')

if (channelError) throw new Error(channelError.message)

const { data: aliasRows, error: aliasError } = await supabase
  .from('sapo_channel_aliases')
  .select('id, alias_text, normalized_alias, platform, platform_key, channel_id, owner_member_id, status')

if (aliasError) throw new Error(`load channel aliases: ${aliasError.message}`)

const { data: existingMembers, error: memberError } = await supabase
  .from('sapo_members')
  .select('sapo_user_id, full_name, email, prefix_code, is_media_team')

if (memberError) throw new Error(memberError.message)

const memberHintByOwner = new Map()
for (const member of existingMembers || []) {
  const keys = [
    normalize(member.prefix_code),
    normalize(member.full_name).split(' ').pop(),
    normalize(member.full_name),
  ].filter(Boolean)
  for (const key of keys) {
    if (!memberHintByOwner.has(key)) memberHintByOwner.set(key, member)
  }
}

const indexes = buildChannelIndexes(channels || [])
const channelById = new Map((channels || []).map((c) => [c.id, c]))
const confirmedAliasByKey = new Map()
const existingAliasByKey = new Map()
for (const alias of aliasRows || []) {
  existingAliasByKey.set(`excel_2026|${alias.platform_key || alias.platform || ''}|${alias.normalized_alias}`, alias)
  if (alias.source && alias.source !== 'excel_2026') {
    existingAliasByKey.set(`${alias.source}|${alias.platform_key || alias.platform || ''}|${alias.normalized_alias}`, alias)
  }
  if (alias.status !== 'matched' || !alias.channel_id) continue
  confirmedAliasByKey.set(`${alias.platform_key || alias.platform || ''}|${alias.normalized_alias}`, alias)
}
const owners = new Map()
const assignments = []
const unmatched = []
const ambiguous = []
const aliasReviewRows = []

for (const row of mappings) {
  const match = matchChannel(row, indexes, confirmedAliasByKey, channelById)
  const hint = memberHintByOwner.get(row.ownerKey)
  if (!owners.has(row.ownerKey)) {
    owners.set(row.ownerKey, {
      owner: row.owner,
      memberId: row.memberId,
      fullName: hint?.full_name || row.owner,
      email: hint?.email || null,
      prefixCode: row.owner,
      channelCount: 0,
    })
  }

  if (!match.channels || match.channels.length === 0) {
    const target = match.strategy.startsWith('ambiguous') ? ambiguous : unmatched
    const status = match.strategy.startsWith('ambiguous') ? 'ambiguous' : 'unmatched'
    target.push({
      owner: row.owner,
      channelName: row.channelName,
      channelRef: row.channelRef,
      strategy: match.strategy,
      candidates: (match.candidates || []).map(displayChannel),
    })
    const existingAlias = existingAliasByKey.get(aliasUniqueKey(row))
    if (!existingAlias || !['matched', 'ignored'].includes(existingAlias.status)) {
      aliasReviewRows.push(aliasReviewRow(row, status, match))
    }
    continue
  }

  owners.get(row.ownerKey).channelCount += match.channels.length
  for (const channel of match.channels) {
    assignments.push({
      ...row,
      memberId: match.alias?.owner_member_id ?? row.memberId,
      channel,
      strategy: match.strategy,
    })
  }
}

const ownerRows = [...owners.values()].map((owner) => ({
  sapo_user_id: owner.memberId,
  email: owner.email,
  first_name: null,
  last_name: owner.fullName,
  full_name: owner.fullName,
  phone_number: null,
  prefix_code: owner.prefixCode,
  is_media_team: true,
  is_active: true,
  last_synced_at: new Date().toISOString(),
  raw: {
    source: 'excel_media_seed',
    owner: owner.owner,
    channel_count: owner.channelCount,
    workbook: path.basename(filePath),
  },
}))

const assignmentByChannelId = new Map()
for (const assignment of assignments) {
  const previous = assignmentByChannelId.get(assignment.channel.id)
  if (!previous || assignment.month > previous.month) assignmentByChannelId.set(assignment.channel.id, assignment)
}
const finalAssignments = [...assignmentByChannelId.values()]

console.log('\n=== EXCEL MEDIA SEED DRY RUN ===')
console.log(`Workbook: ${filePath}`)
console.log(`Mappings read: ${mappings.length}`)
console.log(`Owners: ${ownerRows.length}`)
console.log(`Matched channel assignments: ${finalAssignments.length}`)
console.log(`Unmatched: ${unmatched.length}`)
console.log(`Ambiguous: ${ambiguous.length}`)
console.log(`Alias review rows: ${aliasReviewRows.length}`)
console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`)
console.log(`Clear positive Sapo media flags: ${CLEAR_SAPO_MEDIA}`)
console.log(`Overwrite existing channel assignments: ${OVERWRITE}`)

console.log('\nTop owners by matched channels:')
console.table(
  ownerRows
    .map((o) => ({ id: o.sapo_user_id, owner: o.raw.owner, name: o.full_name, channels: o.raw.channel_count }))
    .sort((a, b) => b.channels - a.channels)
    .slice(0, 30)
)

if (unmatched.length) {
  console.log('\nUnmatched samples:')
  console.table(unmatched.slice(0, 30))
}

if (ambiguous.length) {
  console.log('\nAmbiguous samples:')
  console.dir(ambiguous.slice(0, 15), { depth: 4 })
}

if (!APPLY) {
  console.log('\nDry-run only. Add --apply to upsert excel media members and channel assignments.')
  process.exit(0)
}

if (CLEAR_SAPO_MEDIA) {
  const { error } = await supabase
    .from('sapo_members')
    .update({ is_media_team: false })
    .gte('sapo_user_id', 0)
  if (error) throw new Error(`clear sapo media flags: ${error.message}`)
}

for (let i = 0; i < ownerRows.length; i += 500) {
  const batch = ownerRows.slice(i, i + 500)
  const { error } = await supabase
    .from('sapo_members')
    .upsert(batch, { onConflict: 'sapo_user_id' })
  if (error) throw new Error(`upsert excel media members: ${error.message}`)
}

let updated = 0
let skipped = 0
for (const assignment of finalAssignments) {
  if (!OVERWRITE && assignment.channel.media_member_id) {
    skipped++
    continue
  }
  const { error } = await supabase
    .from('sapo_channels')
    .update({ media_member_id: assignment.memberId })
    .eq('id', assignment.channel.id)
  if (error) throw new Error(`assign channel ${assignment.channel.id}: ${error.message}`)
  updated++
}

let aliasReviewUpserted = 0
if (UPSERT_ALIAS_REVIEW && aliasReviewRows.length > 0) {
  for (let i = 0; i < aliasReviewRows.length; i += 200) {
    const batch = aliasReviewRows.slice(i, i + 200)
    const { error } = await supabase
      .from('sapo_channel_aliases')
      .upsert(batch, { onConflict: 'source,normalized_alias,platform_key' })
    if (error) throw new Error(`upsert channel alias review rows: ${error.message}`)
    aliasReviewUpserted += batch.length
  }
}

console.log('\n=== APPLIED ===')
console.log(`Excel media members upserted: ${ownerRows.length}`)
console.log(`Channel assignments updated: ${updated}`)
console.log(`Channel assignments skipped: ${skipped}`)
console.log(`Alias review rows upserted: ${aliasReviewUpserted}`)
console.log(`Unmatched still needs review: ${unmatched.length}`)
console.log(`Ambiguous still needs review: ${ambiguous.length}`)
