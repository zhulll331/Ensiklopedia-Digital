-- 0006_rate_limit_and_retention.sql
-- Fungsi rate limiter atomik untuk skala banyak instance & fungsi purge retensi terjadwal.

create or replace function private.consume_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_new_expires timestamptz := v_now + make_interval(secs => p_window_seconds);
  v_count integer;
  v_expires timestamptz;
begin
  insert into private.rate_limit_counters (bucket_key, hit_count, window_expires_at)
  values (p_bucket_key, 1, v_new_expires)
  on conflict (bucket_key) do update
    set hit_count = case
      when private.rate_limit_counters.window_expires_at <= v_now then 1
      else private.rate_limit_counters.hit_count + 1
    end,
    window_expires_at = case
      when private.rate_limit_counters.window_expires_at <= v_now then v_new_expires
      else private.rate_limit_counters.window_expires_at
    end
  returning hit_count, window_expires_at into v_count, v_expires;

  if v_count > p_limit then
    return query select
      false,
      0,
      greatest(1, ceil(extract(epoch from (v_expires - v_now)))::integer);
  else
    return query select
      true,
      greatest(0, p_limit - v_count),
      0;
  end if;
end;
$$;

create or replace function private.run_retention_purge()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_deleted_sessions integer := 0;
  v_deleted_idem integer := 0;
  v_deleted_exports integer := 0;
  v_deleted_limits integer := 0;
  v_deleted_attempts integer := 0;
begin
  delete from private.guest_sessions where expires_at <= v_now or revoked_at is not null;
  get diagnostics v_deleted_sessions = row_count;

  delete from private.idempotency_records where expires_at <= v_now;
  get diagnostics v_deleted_idem = row_count;

  delete from private.export_jobs where expires_at <= v_now;
  get diagnostics v_deleted_exports = row_count;

  delete from private.rate_limit_counters where window_expires_at <= v_now;
  get diagnostics v_deleted_limits = row_count;

  delete from app.attempts where purge_at <= v_now;
  get diagnostics v_deleted_attempts = row_count;

  insert into private.job_runs (job_type, status, started_at, finished_at)
  values ('retention_purge', 'succeeded', v_now, timezone('utc', now()));

  return jsonb_build_object(
    'purged_sessions', v_deleted_sessions,
    'purged_idempotency', v_deleted_idem,
    'purged_exports', v_deleted_exports,
    'purged_rate_limits', v_deleted_limits,
    'purged_attempts', v_deleted_attempts
  );
end;
$$;

revoke all on function private.consume_rate_limit(text, integer, integer) from public;
revoke all on function private.run_retention_purge() from public;
