-- ============================================================
-- Migration 011: Add RPC để gợi ý người phụ trách kênh (auto-assign).
-- Dùng cho /revenue/sapo-team — tự động gán nhân viên Media cho từng channel
-- dựa trên người tạo đơn nhiều nhất trong các đơn không bị huỷ.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_suggest_channel_owners(
  p_member_ids bigint[],
  p_min_orders integer DEFAULT 1
)
RETURNS TABLE (
  channel_id text,
  channel_alias text,
  channel_branch_name text,
  platform text,
  suggested_member_id bigint,
  suggested_member_name text,
  suggested_member_prefix text,
  orders_count bigint,
  total_orders integer,
  share_pct numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH channel_member_counts AS (
  SELECT
    o.channel_id,
    o.creator_member_id,
    COUNT(*)::bigint AS cnt
  FROM public.sapo_orders o
  WHERE o.channel_id IS NOT NULL
    AND o.creator_member_id IS NOT NULL
    AND o.creator_member_id = ANY(p_member_ids)
    AND o.cancelled_on IS NULL
  GROUP BY o.channel_id, o.creator_member_id
),
ranked AS (
  SELECT
    cmc.*,
    ROW_NUMBER() OVER (PARTITION BY cmc.channel_id ORDER BY cmc.cnt DESC) AS rn,
    SUM(cmc.cnt) OVER (PARTITION BY cmc.channel_id) AS total_in_channel
  FROM channel_member_counts cmc
)
SELECT
  r.channel_id::text,
  c.alias::text,
  c.branch_name::text,
  c.platform::text,
  r.creator_member_id::bigint,
  COALESCE(m.full_name, '#' || r.creator_member_id::text)::text,
  m.prefix_code::text,
  r.cnt::bigint,
  c.orders_count::integer,
  ROUND((r.cnt::numeric / NULLIF(r.total_in_channel, 0)) * 100, 1)::numeric AS share_pct
FROM ranked r
JOIN public.sapo_channels c ON c.id = r.channel_id
LEFT JOIN public.sapo_members m ON m.sapo_user_id = r.creator_member_id
WHERE r.rn = 1
  AND r.cnt >= p_min_orders
ORDER BY c.orders_count DESC NULLS LAST, r.cnt DESC;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_suggest_channel_owners(bigint[], integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_suggest_channel_owners IS
  'Trả về gợi ý người phụ trách cho từng channel — chọn người tạo nhiều đơn nhất (không tính đơn huỷ) trong danh sách media member.';
