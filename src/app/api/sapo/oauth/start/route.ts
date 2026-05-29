export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildAuthorizeUrl, normalizeStore } from '@/lib/sapo-api/client'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const rawStore = searchParams.get('store')
  if (!rawStore) {
    return NextResponse.json({ error: 'Thiếu store Sapo' }, { status: 400 })
  }

  const store = normalizeStore(rawStore)
  if (!/^[a-z0-9][a-z0-9-]*$/.test(store)) {
    return NextResponse.json({ error: 'Store Sapo không hợp lệ' }, { status: 400 })
  }

  const nonce = crypto.randomUUID()
  const state = Buffer.from(JSON.stringify({ store, nonce })).toString('base64url')
  const redirectUri = getRedirectUri(request)
  const response = NextResponse.redirect(buildAuthorizeUrl({ store, state, redirectUri }))
  response.cookies.set('sapo_oauth_state', nonce, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 10 * 60,
  })
  return response
}

function getRedirectUri(request: NextRequest): string {
  if (process.env.SAPO_REDIRECT_URI) return process.env.SAPO_REDIRECT_URI
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
  return `${appUrl.replace(/\/$/, '')}/api/sapo/oauth/callback`
}
