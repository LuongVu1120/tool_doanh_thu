export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { exchangeCodeForToken, normalizeStore } from '@/lib/sapo-api/client'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const cookieState = request.cookies.get('sapo_oauth_state')?.value
  if (!code || !state || !cookieState) {
    return redirectWithError(request, 'missing_oauth_params')
  }

  let parsedState: { store: string; nonce: string }
  try {
    parsedState = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'))
  } catch {
    return redirectWithError(request, 'invalid_state')
  }

  if (parsedState.nonce !== cookieState) {
    return redirectWithError(request, 'state_mismatch')
  }

  const store = normalizeStore(searchParams.get('shop') || parsedState.store)
  const redirectUri = getRedirectUri(request)
  const token = await exchangeCodeForToken({ store, code, redirectUri })

  const serviceClient = await createServiceClient()
  await serviceClient.from('users').upsert({
    id: user.id,
    email: user.email ?? '',
    full_name: (user.user_metadata?.full_name as string) ?? null,
    avatar_url: (user.user_metadata?.avatar_url as string) ?? null,
  }, { onConflict: 'id', ignoreDuplicates: true })

  const { error: upsertError } = await serviceClient
    .from('sapo_connections')
    .upsert({
      store,
      access_token: token.access_token,
      scopes: token.scope || process.env.SAPO_SCOPES || 'read_orders,write_orders',
      connected_by: user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'store' })

  if (upsertError) {
    return redirectWithError(request, 'save_failed')
  }

  const response = NextResponse.redirect(new URL('/revenue/sapo?connected=1', request.url))
  response.cookies.delete('sapo_oauth_state')
  return response
}

function getRedirectUri(request: NextRequest): string {
  if (process.env.SAPO_REDIRECT_URI) return process.env.SAPO_REDIRECT_URI
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
  return `${appUrl.replace(/\/$/, '')}/api/sapo/oauth/callback`
}

function redirectWithError(request: NextRequest, error: string): NextResponse {
  return NextResponse.redirect(new URL(`/revenue/sapo?error=${encodeURIComponent(error)}`, request.url))
}
