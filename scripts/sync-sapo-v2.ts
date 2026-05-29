/**
 * CLI để chạy Sapo first-class sync trực tiếp từ terminal (không cần dev server).
 *
 * Cách dùng:
 *   npx tsx -r dotenv/config scripts/sync-sapo-v2.ts dotenv_config_path=.env [--days=7] [--max=500] [--incremental] [--only=members]
 *
 * Tham số:
 *   --days=N       : Chỉ sync đơn được tạo trong N ngày gần nhất (mặc định: không filter)
 *   --from=DATE    : Sync đơn tạo từ ngày này (YYYY-MM-DD). Ưu tiên hơn --days nếu cùng truyền.
 *   --max=N        : Sync tối đa N đơn (an toàn cho test đầu)
 *   --incremental  : Dùng cursor modified_on từ lần sync trước
 *   --only=members : Chỉ sync sapo_members, bỏ qua orders
 *   --count        : Chỉ in số đơn theo Sapo /orders/count.json (không sync), kết hợp với --from/--days
 */
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { fetchSapoOrdersCount, getEnvSapoV2Auth } from '../src/lib/sapo-v2/client'
import { syncSapoMembers, syncSapoOrders } from '../src/lib/sapo-v2/sync'

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue
    const eq = arg.indexOf('=')
    if (eq >= 0) {
      out[arg.slice(2, eq)] = arg.slice(eq + 1)
    } else {
      out[arg.slice(2)] = '1'
    }
  }
  return out
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const auth = getEnvSapoV2Auth()
  if (!auth) {
    console.error('Missing Sapo env (SAPO_STORE + SAPO_API_KEY + SAPO_API_SECRET)')
    process.exit(1)
  }

  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  console.log('============================================================')
  console.log(' Sapo v2 Sync')
  console.log('============================================================')
  console.log(` Store:  ${auth.store}.mysapo.net`)
  console.log(` Args:   ${JSON.stringify(args)}`)
  console.log('------------------------------------------------------------\n')

  // 1) Sync members
  console.log('[1/2] Sync sapo_members ...')
  const m = await syncSapoMembers(supabase as never, auth)
  console.log(`  -> total=${m.total}, upserted=${m.upserted}\n`)

  if (args.only === 'members') {
    console.log('Done (only=members).')
    return
  }

  // 2) Sync orders
  let createdOnMin: string | null = null
  let modifiedOnMin: string | null = null

  if (args.incremental) {
    const { data: state } = await supabase
      .from('sapo_sync_state')
      .select('orders_cursor_modified_on')
      .eq('store', auth.store)
      .maybeSingle()
    modifiedOnMin = state?.orders_cursor_modified_on ?? null
    console.log(`[2/2] Incremental sync since modified_on=${modifiedOnMin || '(none)'}`)
  } else if (args.from) {
    const d = new Date(args.from)
    if (isNaN(d.getTime())) throw new Error(`Invalid --from=${args.from} (expect YYYY-MM-DD)`)
    createdOnMin = d.toISOString()
    console.log(`[2/2] Sync \u0111\u01a1n t\u1eeb ${args.from} (since ${createdOnMin})`)
  } else if (args.days) {
    const since = new Date()
    since.setDate(since.getDate() - parseInt(args.days, 10))
    createdOnMin = since.toISOString()
    console.log(`[2/2] Sync \u0111\u01a1n trong ${args.days} ng\u00e0y g\u1ea7n nh\u1ea5t (since ${createdOnMin})`)
  } else {
    console.log('[2/2] Sync TO\u00c0N B\u1ed8 \u0111\u01a1n (kh\u00f4ng filter th\u1eddi gian)')
  }

  if (args.count) {
    const total = await fetchSapoOrdersCount({ auth, createdOnMin, modifiedOnMin })
    console.log(`\nSapo says: ${total.toLocaleString('vi-VN')} \u0111\u01a1n.`)
    console.log(`Estimated pages (250/page): ${Math.ceil(total / 250)}`)
    console.log(`Estimated time @ 0.6s/page: ~${Math.ceil((total / 250) * 0.6)}s = ~${Math.ceil((total / 250) * 0.6 / 60)}m`)
    return
  }

  const stats = await syncSapoOrders(supabase as never, auth, {
    createdOnMin,
    modifiedOnMin,
    maxOrders: args.max ? parseInt(args.max, 10) : undefined,
    onProgress: ({ page, totalPages, fetched, total, rateLimit }) => {
      console.log(`  Page ${page}/${totalPages} | fetched ${fetched}/${total} | rate ${rateLimit || '?/?'}`)
    },
  })

  console.log('\n============================================================')
  console.log(' KẾT QUẢ')
  console.log('============================================================')
  console.log(JSON.stringify(stats, null, 2))
}

main().catch((err) => {
  console.error('Sync failed:', err)
  process.exit(1)
})
