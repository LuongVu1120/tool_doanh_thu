export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { parseExcelBuffer } from '@/lib/sapo-parser'
import { parseMappingFile } from '@/lib/sapo-parser/mapping-parser'
import { parseReturnsFile } from '@/lib/sapo-parser/returns-parser'
import { normalize } from '@/lib/sapo-parser/normalize'
import { buildOrderImportRows, loadActiveMappingLookup } from '@/lib/revenue/order-import'
import type { TypedSupabaseClient } from '@/lib/supabase/types'

export const maxDuration = 60

// ---------------------------------------------------------------------------
// POST /api/revenue/upload
// fileType: "orders" | "mapping" | "returns"
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const fileType = (formData.get('fileType') as string | null) ?? 'orders'

    if (!file) {
      return NextResponse.json({ error: 'Không tìm thấy file' }, { status: 400 })
    }
    if (!['orders', 'mapping', 'returns'].includes(fileType)) {
      return NextResponse.json({ error: 'fileType không hợp lệ' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()

    // Ensure user profile exists in public.users (needed for FK in revenue_imports)
    const serviceClient = await createServiceClient()
    await serviceClient.from('users').upsert({
      id: user.id,
      email: user.email ?? '',
      full_name: (user.user_metadata?.full_name as string) ?? null,
      avatar_url: (user.user_metadata?.avatar_url as string) ?? null,
    }, { onConflict: 'id', ignoreDuplicates: true })

    if (fileType === 'mapping') return handleMappingUpload(serviceClient, user.id, file.name, arrayBuffer)
    if (fileType === 'returns') return handleReturnsUpload(serviceClient, user.id, file.name, arrayBuffer)

    // ── ORDERS UPLOAD ──────────────────────────────────────────────────────
    const period = formData.get('period') as string | null
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      return NextResponse.json({ error: 'Kỳ doanh thu không hợp lệ (YYYY-MM)' }, { status: 400 })
    }

    // Check lock
    const { data: periodLock } = await serviceClient
      .from('period_locks').select('period').eq('period', period).maybeSingle()
    if (periodLock) {
      return NextResponse.json({ error: `Kỳ ${period} đã bị khóa` }, { status: 400 })
    }

    // Existing order codes for dedup
    const { data: existingOrders } = await serviceClient.from('orders').select('order_code')
    const existingOrderCodes = new Set<string>(
      (existingOrders || []).map((o: { order_code: string }) => o.order_code)
    )

    // Load active mapping
    const mappingLookup = await loadActiveMappingLookup(serviceClient)

    // Log import
    const { data: importRecord, error: importError } = await serviceClient
      .from('revenue_imports')
      .insert({
        uploaded_by: user.id,
        file_name: file.name,
        file_type: 'orders',
        status: 'processing',
      })
      .select().single()

    if (importError || !importRecord) {
      console.error('Import record error:', importError)
      return NextResponse.json({ error: `Lỗi tạo import record: ${importError?.message ?? 'unknown'}` }, { status: 500 })
    }

    // Run revenue recognition, and persist all raw orders so later imports can
    // update non-completed status changes.
    const { rows: orderRows, stats } = await buildOrderImportRows(parseExcelBuffer(arrayBuffer), {
      mappingLookup,
    })

    let ordersUpserted = 0
    let ordersNew = 0

    if (orderRows.length > 0) {
      const { error: upsertError } = await serviceClient
        .from('orders')
        .upsert(orderRows, { onConflict: 'order_code' })

      if (upsertError) {
        console.error('Orders upsert error:', upsertError)
        await serviceClient.from('revenue_imports')
          .update({ status: 'error', error_message: upsertError.message })
          .eq('id', importRecord.id)
        return NextResponse.json({
          error: 'Lỗi khi lưu đơn hàng',
          detail: upsertError.message,
          code: upsertError.code,
        }, { status: 500 })
      }

      ordersUpserted = orderRows.length
      ordersNew = orderRows.filter(r => !existingOrderCodes.has(r.order_code)).length
    }

    // Update import record to done
    await serviceClient.from('revenue_imports').update({
      status: 'done',
      orders_upserted: ordersUpserted,
      orders_new: ordersNew,
      orders_status_changed: orderRows.filter((r) => existingOrderCodes.has(r.order_code)).length,
    }).eq('id', importRecord.id)

    return NextResponse.json({
      importId: importRecord.id,
      totalOrders: orderRows.length,
      stats,
    })
  } catch (error) {
    console.error('Upload error:', error)
    const message = error instanceof Error ? error.message : 'Lỗi server không xác định'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// Handle mapping file upload
// ---------------------------------------------------------------------------
async function handleMappingUpload(
  supabase: TypedSupabaseClient,
  userId: string,
  fileName: string,
  buffer: ArrayBuffer
): Promise<NextResponse> {
  try {
    const mappingResult = parseMappingFile(buffer)

    // Close previous active mapping
    await supabase
      .from('mapping_imports')
      .update({ active_to: new Date().toISOString() })
      .is('active_to', null)

    // Create new mapping import
    const { data: importRecord, error: importError } = await supabase
      .from('mapping_imports')
      .insert({
        uploaded_by: userId,
        file_name: fileName,
        total_rows: mappingResult.totalRows,
        total_employees: mappingResult.totalEmployees,
        total_channels: mappingResult.totalChannels,
        unassigned_count: mappingResult.unassignedCount,
        active_from: new Date().toISOString(),
        active_to: null,
      })
      .select().single()

    if (importError || !importRecord) {
      console.error('Mapping import error:', importError)
      return NextResponse.json({ error: `Lỗi tạo mapping import record: ${importError?.message ?? 'unknown'}` }, { status: 500 })
    }

    // Build tag rows using ACTUAL column names from database.ts
    const seen = new Set<string>()
    const tagRows: {
      mapping_import_id: string
      tag_name_normalized: string
      tag_name_original: string
      channel_display: string
      employee_name: string
      employee_id: null
    }[] = []

    for (const entry of mappingResult.entries) {
      const addTag = (original: string) => {
        const norm = normalize(original)
        if (!norm || seen.has(norm)) return
        seen.add(norm)
        tagRows.push({
          mapping_import_id: importRecord.id,
          tag_name_normalized: norm,
          tag_name_original: original,
          channel_display: entry.channelDisplay,
          employee_name: entry.employeeName || 'CHƯA GÁN',
          employee_id: null,
        })
      }

      if (entry.channelDisplay) addTag(entry.channelDisplay)
      for (const id of entry.ids) if (id) addTag(id)
    }

    if (tagRows.length > 0) {
      const { error: tagsError } = await supabase.from('channel_tags').insert(tagRows)
      if (tagsError) {
        console.error('Channel tags insert error:', tagsError)
        return NextResponse.json({ error: 'Lỗi khi lưu channel tags' }, { status: 500 })
      }
    }

    return NextResponse.json({
      importId: importRecord.id,
      totalRows: mappingResult.totalRows,
      totalEmployees: mappingResult.totalEmployees,
      totalChannels: mappingResult.totalChannels,
      unassignedCount: mappingResult.unassignedCount,
      tagRowsInserted: tagRows.length,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Lỗi server'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// Handle returns file upload
// ---------------------------------------------------------------------------
async function handleReturnsUpload(
  supabase: TypedSupabaseClient,
  userId: string,
  fileName: string,
  buffer: ArrayBuffer
): Promise<NextResponse> {
  try {
    const returnOrders = parseReturnsFile(buffer)
    if (returnOrders.length === 0) {
      return NextResponse.json({ message: 'Không có đơn trả', totalReturns: 0, matchedCount: 0, unmatchedCount: 0 })
    }

    const { data: importRecord, error: importError } = await supabase
      .from('return_imports')
      .insert({
        uploaded_by: userId,
        file_name: fileName,
        total_returns: returnOrders.length,
        matched_count: 0,
        unmatched_count: returnOrders.length,
      })
      .select().single()

    if (importError || !importRecord) {
      console.error('Return import error:', importError)
      return NextResponse.json({ error: `Lỗi tạo return import record: ${importError?.message ?? 'unknown'}` }, { status: 500 })
    }

    // Insert return records (deduped by returnCode already in parser)
    const returnRows = returnOrders.map((r) => ({
      return_code: r.returnCode,
      return_import_id: importRecord.id,
      original_order_code: r.originalOrderCode,
      return_amount: r.returnAmount,
      return_reason: r.returnReason,
      return_date: r.returnDate ? r.returnDate.toISOString() : null,
      matched: false,
    }))

    await supabase.from('returns').upsert(returnRows, { onConflict: 'return_code' })

    // Match returns → orders in DB
    let matchedCount = 0
    const originalCodes = returnOrders.map((r) => r.originalOrderCode).filter(Boolean)

    if (originalCodes.length > 0) {
      const { data: matchedOrders } = await supabase
        .from('orders').select('order_code').in('order_code', originalCodes)

      const matchedSet = new Set<string>(
        (matchedOrders || []).map((o: { order_code: string }) => o.order_code)
      )

      const toUpdate = returnOrders.filter((r) => matchedSet.has(r.originalOrderCode))
      matchedCount = toUpdate.length

      for (const ret of toUpdate) {
        await supabase.from('orders').update({
          is_returned: true,
          return_code: ret.returnCode,
          return_amount: ret.returnAmount,
          return_date: ret.returnDate ? ret.returnDate.toISOString() : null,
          last_updated_at: new Date().toISOString(),
        }).eq('order_code', ret.originalOrderCode)

        await supabase.from('returns').update({ matched: true }).eq('return_code', ret.returnCode)
      }
    }

    const unmatchedCount = returnOrders.length - matchedCount
    await supabase.from('return_imports')
      .update({ matched_count: matchedCount, unmatched_count: unmatchedCount })
      .eq('id', importRecord.id)

    return NextResponse.json({ importId: importRecord.id, totalReturns: returnOrders.length, matchedCount, unmatchedCount })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Lỗi server'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
