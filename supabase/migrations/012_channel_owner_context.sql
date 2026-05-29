-- ============================================================
-- Migration 012: Nâng cấp gợi ý người phụ trách kênh.
-- Trả về ngữ cảnh đầy đủ cho từng channel: top creator (bất kỳ team), top assignee,
-- top Media creator (nếu có) — giúp UI hiển thị context để user quyết định.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_channel_owner_context(
  p_media_ids bigint[]
)
RETURNS TABLE (
  channel_id text,
  channel_alias text,
  channel_branch_name text,
  platform text,
  total_orders integer,
  -- top creator bất kỳ (kể cả không phải Media)
  top_creator_id bigint,
  top_creator_name text,
  top_creator_prefix text,
  top_creator_orders bigint,
  top_creator_is_media boolean,
  -- top Media creator (chỉ trong p_media_ids), null nếu không có
  top_media_creator_id bigint,
  top_media_creator_name text,
  top_media_creator_prefix text,
  top_media_creator_orders bigint,
  -- top assignee bất kỳ
  top_assignee_id bigint,
  top_assignee_name text,
  top_assignee_prefix text,
  top_assignee_orders bigint,
  top_assignee_is_media boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH creator_counts AS (
  SELECT
    o.channel_id,
    o.creator_member_id,
    COUNT(*)::bigint AS cnt
  FROM public.sapo_orders o
  WHERE o.channel_id IS NOT NULL
    AND o.creator_member_id IS NOT NULL
    AND o.cancelled_on IS NULL
  GROUP BY o.channel_id, o.creator_member_id
),
assignee_counts AS (
  SELECT
    o.channel_id,
    o.assignee_member_id,
    COUNT(*)::bigint AS cnt
  FROM public.sapo_orders o
  WHERE o.channel_id IS NOT NULL
    AND o.assignee_member_id IS NOT NULL
    AND o.cancelled_on IS NULL
  GROUP BY o.channel_id, o.assignee_member_id
),
top_creators AS (
  SELECT DISTINCT ON (channel_id)
    channel_id, creator_member_id, cnt
  FROM creator_counts
  ORDER BY channel_id, cnt DESC
),
top_media_creators AS (
  SELECT DISTINCT ON (channel_id)
    channel_id, creator_member_id, cnt
  FROM creator_counts
  WHERE creator_member_id = ANY(p_media_ids)
  ORDER BY channel_id, cnt DESC
),
top_assignees AS (
  SELECT DISTINCT ON (channel_id)
    channel_id, assignee_member_id, cnt
  FROM assignee_counts
  ORDER BY channel_id, cnt DESC
)
SELECT
  c.id::text AS channel_id,
  c.alias::text AS channel_alias,
  c.branch_name::text AS channel_branch_name,
  c.platform::text AS platform,
  c.orders_count::integer AS total_orders,

  tc.creator_member_id::bigint AS top_creator_id,
  COALESCE(mc.full_name, '#' || tc.creator_member_id::text)::text AS top_creator_name,
  mc.prefix_code::text AS top_creator_prefix,
  tc.cnt::bigint AS top_creator_orders,
  COALESCE(mc.is_media_team, false)::boolean AS top_creator_is_media,

  tmc.creator_member_id::bigint AS top_media_creator_id,
  mmc.full_name::text AS top_media_creator_name,
  mmc.prefix_code::text AS top_media_creator_prefix,
  tmc.cnt::bigint AS top_media_creator_orders,

  ta.assignee_member_id::bigint AS top_assignee_id,
  COALESCE(ma.full_name, '#' || ta.assignee_member_id::text)::text AS top_assignee_name,
  ma.prefix_code::text AS top_assignee_prefix,
  ta.cnt::bigint AS top_assignee_orders,
  COALESCE(ma.is_media_team, false)::boolean AS top_assignee_is_media
FROM public.sapo_channels c
LEFT JOIN top_creators tc ON tc.channel_id = c.id
LEFT JOIN public.sapo_members mc ON mc.sapo_user_id = tc.creator_member_id
LEFT JOIN top_media_creators tmc ON tmc.channel_id = c.id
LEFT JOIN public.sapo_members mmc ON mmc.sapo_user_id = tmc.creator_member_id
LEFT JOIN top_assignees ta ON ta.channel_id = c.id
LEFT JOIN public.sapo_members ma ON ma.sapo_user_id = ta.assignee_member_id
ORDER BY c.orders_count DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_channel_owner_context(bigint[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_channel_owner_context IS
  'Trả về ngữ cảnh đầy đủ cho mỗi kênh: top creator/assignee bất kỳ team + top Media creator nếu có. UI dùng để gợi ý + bulk assign.';
