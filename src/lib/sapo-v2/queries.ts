import type {
  ChannelContext,
  ChannelView,
  DashboardData,
  MemberView,
  SapoStatus,
} from '@/types/sapo-v2-ui'

export const sapoV2Keys = {
  all: ['sapo-v2'] as const,
  dashboard: (from: string, to: string) => [...sapoV2Keys.all, 'dashboard', from, to] as const,
  channels: () => [...sapoV2Keys.all, 'channels'] as const,
  members: () => [...sapoV2Keys.all, 'members'] as const,
  channelContexts: (memberIds: string) => [...sapoV2Keys.all, 'channel-contexts', memberIds] as const,
}

export const sapoKeys = {
  all: ['sapo'] as const,
  status: () => [...sapoKeys.all, 'status'] as const,
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const data = await res.json()
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed: ${res.status}`)
  }
  return data as T
}

export function fetchSapoDashboard(from: string, to: string) {
  return fetchJson<DashboardData>(
    `/api/sapo-v2/dashboard?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
  )
}

export function fetchSapoChannels() {
  return fetchJson<{ channels: ChannelView[] }>('/api/sapo-v2/channels')
}

export function fetchSapoMembers() {
  return fetchJson<{ members: MemberView[] }>('/api/sapo-v2/members')
}

export function createSapoExternalMember(input: { full_name: string; prefix_code?: string | null; email?: string | null }) {
  return fetchJson<{ ok?: boolean; member?: MemberView }>('/api/sapo-v2/members', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function fetchSapoChannelContexts(memberIds: number[]) {
  const params = new URLSearchParams({ member_ids: memberIds.join(',') })
  return fetchJson<{
    contexts?: ChannelContext[]
    summary?: { total_channels: number; has_media_creator: number; no_media_creator: number }
  }>(`/api/sapo-v2/auto-assign?${params.toString()}`)
}

export function fetchSapoStatus() {
  return fetchJson<SapoStatus>('/api/sapo/status')
}

export function postSapoV2Sync(incremental = true) {
  return fetchJson<{
    orders?: { orders_upserted?: number; channels_discovered?: number }
    members?: { upserted?: number }
  }>(`/api/sapo-v2/sync${incremental ? '?incremental=1' : ''}`, { method: 'POST' })
}

export function patchSapoChannels(assignments: Array<{ channel_id: string; media_member_id: number | null }>) {
  return fetchJson<{ ok?: boolean }>('/api/sapo-v2/channels', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assignments }),
  })
}

export function patchSapoMembers(toggles: Array<{ sapo_user_id: number; is_media_team: boolean }>) {
  return fetchJson<{ ok?: boolean }>('/api/sapo-v2/members', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toggles }),
  })
}

export function postSapoLegacySync(full = false) {
  return fetchJson<{ results?: Array<{ upserted: number }> }>(
    `/api/sapo/sync${full ? '?full=1' : ''}`,
    { method: 'POST' }
  )
}

export function shouldPersistQuery(query: { queryKey: readonly unknown[] }) {
  const root = query.queryKey[0]
  return root === 'sapo-v2' || root === 'sapo'
}
