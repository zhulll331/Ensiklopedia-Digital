-- 0011_admin_overview_rpc.sql
-- RPC ringkasan status job sistem untuk dashboard admin (private.job_runs tetap terisolasi).

create or replace function api.get_admin_recent_job_runs(
  p_actor_id uuid,
  p_limit integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 5), 1), 20);
  v_rows jsonb;
begin
  if not private.is_active_admin(p_actor_id) then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', jr.id,
        'job_type', jr.job_type,
        'status', jr.status,
        'started_at', jr.started_at,
        'finished_at', jr.finished_at,
        'safe_error_code', jr.safe_error_code
      )
      order by jr.started_at desc
    ),
    '[]'::jsonb
  )
  into v_rows
  from (
    select id, job_type, status, started_at, finished_at, safe_error_code
    from private.job_runs
    order by started_at desc
    limit v_limit
  ) jr;

  return v_rows;
end;
$$;

revoke all on function api.get_admin_recent_job_runs(uuid, integer) from public, anon, authenticated;
grant execute on function api.get_admin_recent_job_runs(uuid, integer) to service_role;
