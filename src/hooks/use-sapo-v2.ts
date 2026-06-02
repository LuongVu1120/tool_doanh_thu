'use client'

import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query'
import {
  fetchSapoChannelContexts,
  fetchSapoChannels,
  fetchSapoDashboard,
  fetchSapoMembers,
  fetchSapoStatus,
  createSapoExternalMember,
  patchSapoChannels,
  patchSapoMembers,
  postSapoLegacySync,
  postSapoV2Sync,
  sapoKeys,
  sapoV2Keys,
} from '@/lib/sapo-v2/queries'

const FIVE_MINUTES = 5 * 60 * 1000
const TEN_MINUTES = 10 * 60 * 1000
const TWO_MINUTES = 2 * 60 * 1000

export function useSapoDashboard(fromIso: string, toIso: string) {
  return useQuery({
    queryKey: sapoV2Keys.dashboard(fromIso, toIso),
    queryFn: () => fetchSapoDashboard(fromIso, toIso),
    staleTime: TEN_MINUTES,
    placeholderData: keepPreviousData,
    enabled: Boolean(fromIso && toIso),
  })
}

export function useSapoChannels() {
  return useQuery({
    queryKey: sapoV2Keys.channels(),
    queryFn: async () => {
      const data = await fetchSapoChannels()
      return data.channels || []
    },
    staleTime: FIVE_MINUTES,
  })
}

export function useSapoMembers() {
  return useQuery({
    queryKey: sapoV2Keys.members(),
    queryFn: async () => {
      const data = await fetchSapoMembers()
      return data.members || []
    },
    staleTime: FIVE_MINUTES,
  })
}

export function useSapoChannelContexts(memberIds: number[], enabled: boolean) {
  const memberIdsKey = memberIds.join(',')
  return useQuery({
    queryKey: sapoV2Keys.channelContexts(memberIdsKey),
    queryFn: async () => {
      const data = await fetchSapoChannelContexts(memberIds)
      const map: Record<string, import('@/types/sapo-v2-ui').ChannelContext> = {}
      for (const c of data.contexts || []) map[c.channel_id] = c
      return { map, summary: data.summary }
    },
    enabled: enabled && memberIds.length > 0,
    staleTime: FIVE_MINUTES,
  })
}

export function useSapoStatus() {
  return useQuery({
    queryKey: sapoKeys.status(),
    queryFn: fetchSapoStatus,
    staleTime: TWO_MINUTES,
  })
}

export function useSapoV2Sync() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => postSapoV2Sync(true),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sapoV2Keys.all })
    },
  })
}

export function useSaveChannelAssignments() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (assignments: Array<{ channel_id: string; media_member_id: number | null }>) =>
      patchSapoChannels(assignments),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sapoV2Keys.all })
    },
  })
}

export function useSaveMediaToggles() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (toggles: Array<{ sapo_user_id: number; is_media_team: boolean }>) =>
      patchSapoMembers(toggles),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sapoV2Keys.all })
    },
  })
}

export function useCreateMediaMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { full_name: string; prefix_code?: string | null; email?: string | null }) =>
      createSapoExternalMember(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sapoV2Keys.all })
    },
  })
}

export function useSapoLegacySync() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (full: boolean) => postSapoLegacySync(full),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sapoKeys.status() })
    },
  })
}
