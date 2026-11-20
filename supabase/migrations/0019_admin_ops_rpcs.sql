-- 0019_admin_ops_rpcs.sql
-- Migrasi Fase 8: Pengaturan Situs Allowlist, Viewer Log Audit, Pemeliharaan Retensi,
-- serta alur Permintaan Privasi Anak (SEC-15, SEC-24, SEC-25).

-- 1. Indeks performa pembacaan log audit terfilter
create index if not exists idx_audit_logs_created_at
  on private.audit_logs (created_at desc);

create index if not exists idx_audit_logs_action_outcome
  on private.audit_logs (action, outcome, created_at desc);

-- 2. Tabel Permintaan Privasi (SEC-15: referensi administratif & status tanpa menyalin nama anak ke log audit)
create table if not exists private.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references app.schools (id) on delete set null,
  request_type text not null check (request_type in ('access', 'correction', 'deletion')),
  status text not null default 'received' check (status in ('received', 'verified', 'completed', 'rejected')),
  requester_channel text not null check (char_length(btrim(requester_channel)) between 2 and 120),
  reference_code text not null check (char_length(btrim(reference_code)) between 2 and 80),
  summary_note text not null default '' check (char_length(summary_note) <= 400),
  resolution_note text not null default '' check (char_length(resolution_note) <= 400),
  created_by uuid not null references app.profiles (user_id) on delete restrict,
  handled_by uuid references app.profiles (user_id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz
);

create index if not exists idx_privacy_requests_status_created
  on private.privacy_requests (status, created_at desc);

revoke all on table private.privacy_requests from public, anon, authenticated, guest_api;
grant all on table private.privacy_requests to service_role;

-- 3. Daftar pengaturan situs publik (6 key allowlist di app.site_settings)
create or replace function api.list_admin_site_settings(
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_rows jsonb := '[]'::jsonb;
begin
  if not private.is_active_admin(p_actor_id) then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      jsonb_build_object(
        'key', s.key,
        'value', case
          when pg_catalog.jsonb_typeof(s.value_json) = 'string' then s.value_json #>> '{}'
          else coalesce(s.value_json ->> 'value', s.value_json::text)
        end,
        'updated_at', s.updated_at,
        'updated_by_name', prof.display_name
      )
      order by s.key asc
    ),
    '[]'::jsonb
  )
  into v_rows
  from app.site_settings s
  left join app.profiles prof on prof.user_id = s.updated_by;

  return jsonb_build_object(
    'settings', v_rows,
    'server_now_utc', v_now
  );
end;
$$;

revoke all on function api.list_admin_site_settings(uuid) from public, anon, authenticated;
grant execute on function api.list_admin_site_settings(uuid) to service_role;

-- 4. Simpan pengaturan situs allowlist (maksimal 6 key resmi) + catat audit
create or replace function api.upsert_admin_site_settings(
  p_actor_id uuid,
  p_settings jsonb,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_key text;
  v_value jsonb;
  v_str text;
  v_updated_keys text[] := array[]::text[];
begin
  if not private.is_active_admin(p_actor_id) then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  if p_settings is null or pg_catalog.jsonb_typeof(p_settings) <> 'object' then
    raise exception 'VALIDATION_FAILED:INVALID_SETTINGS_PAYLOAD';
  end if;

  for v_key, v_value in
    select key, value from pg_catalog.jsonb_each(p_settings)
  loop
    if v_key not in (
      'hero_title',
      'hero_subtitle',
      'hero_slogan',
      'contact_email',
      'contact_org_name',
      'privacy_notice_summary'
    ) then
      raise exception 'VALIDATION_FAILED:INVALID_SETTING_KEY';
    end if;

    if pg_catalog.jsonb_typeof(v_value) <> 'string' then
      raise exception 'VALIDATION_FAILED:INVALID_SETTING_VALUE';
    end if;

    v_str := btrim(v_value #>> '{}');

    insert into app.site_settings (key, value_json, updated_by, updated_at)
    values (v_key, pg_catalog.to_jsonb(v_str), p_actor_id, v_now)
    on conflict (key) do update
      set value_json = excluded.value_json,
          updated_by = excluded.updated_by,
          updated_at = excluded.updated_at;

    v_updated_keys := array_append(v_updated_keys, v_key);
  end loop;

  if coalesce(array_length(v_updated_keys, 1), 0) > 0 then
    perform private.write_audit(
      'admin',
      p_actor_id::text,
      'update_site_settings',
      'site_settings',
      'allowlist',
      p_request_id,
      'success',
      jsonb_build_object('updated_keys', to_jsonb(v_updated_keys))
    );
  end if;

  return api.list_admin_site_settings(p_actor_id);
end;
$$;

revoke all on function api.upsert_admin_site_settings(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function api.upsert_admin_site_settings(uuid, jsonb, text) to service_role;

-- 5. Pembacaan Log Audit terfilter (hanya metadata aman, tanpa PII siswa)
create or replace function api.list_admin_audit_logs(
  p_actor_id uuid,
  p_action text default null,
  p_outcome text default null,
  p_actor_type text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_action text := nullif(btrim(coalesce(p_action, '')), '');
  v_outcome text := nullif(btrim(coalesce(p_outcome, '')), '');
  v_actor_type text := nullif(btrim(coalesce(p_actor_type, '')), '');
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_logs jsonb := '[]'::jsonb;
  v_distinct_actions jsonb := '[]'::jsonb;
begin
  if not private.is_active_admin(p_actor_id) then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  if v_outcome is not null and v_outcome not in ('success', 'denied', 'error') then
    raise exception 'VALIDATION_FAILED:INVALID_OUTCOME';
  end if;

  if v_actor_type is not null and v_actor_type not in ('admin', 'teacher', 'guest', 'system') then
    raise exception 'VALIDATION_FAILED:INVALID_ACTOR_TYPE';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'actor_type', r.actor_type,
        'actor_id', r.actor_id,
        'actor_display_name', r.actor_display_name,
        'action', r.action,
        'target_type', r.target_type,
        'target_id', r.target_id,
        'request_id', r.request_id,
        'outcome', r.outcome,
        'created_at', r.created_at,
        'safe_metadata', r.safe_metadata
      )
      order by r.created_at desc
    ),
    '[]'::jsonb
  )
  into v_logs
  from (
    select
      a.id,
      a.actor_type,
      a.actor_id,
      prof.display_name as actor_display_name,
      a.action,
      a.target_type,
      a.target_id,
      a.request_id,
      a.outcome,
      a.created_at,
      a.safe_metadata
    from private.audit_logs a
    left join app.profiles prof on prof.user_id::text = a.actor_id
    where (v_action is null or a.action = v_action)
      and (v_outcome is null or a.outcome = v_outcome)
      and (v_actor_type is null or a.actor_type = v_actor_type)
      and (p_from is null or a.created_at >= p_from)
      and (p_to is null or a.created_at <= p_to)
    order by a.created_at desc
    limit v_limit
  ) r;

  select coalesce(
    pg_catalog.jsonb_agg(act.action order by act.action asc),
    '[]'::jsonb
  )
  into v_distinct_actions
  from (
    select distinct a.action
    from private.audit_logs a
    order by a.action asc
    limit 100
  ) act;

  return jsonb_build_object(
    'logs', v_logs,
    'distinct_actions', v_distinct_actions,
    'server_now_utc', v_now
  );
end;
$$;

revoke all on function api.list_admin_audit_logs(uuid, text, text, text, timestamptz, timestamptz, integer) from public, anon, authenticated;
grant execute on function api.list_admin_audit_logs(uuid, text, text, text, timestamptz, timestamptz, integer) to service_role;

-- 6. Status pemeliharaan sistem: job_runs terbaru + hitung antrean data kedaluwarsa
create or replace function api.get_admin_maintenance_status(
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_jobs jsonb := '[]'::jsonb;
  v_expired_guest_sessions integer := 0;
  v_expired_export_jobs integer := 0;
  v_expired_idempotency integer := 0;
  v_expired_rate_limits integer := 0;
  v_due_purge_attempts integer := 0;
  v_active_support_sessions integer := 0;
  v_quarantine_media integer := 0;
begin
  if not private.is_active_admin(p_actor_id) then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
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
  into v_jobs
  from (
    select id, job_type, status, started_at, finished_at, safe_error_code
    from private.job_runs
    order by started_at desc
    limit 20
  ) jr;

  select count(*)::integer into v_expired_guest_sessions
  from private.guest_sessions
  where expires_at <= v_now or revoked_at is not null;

  select count(*)::integer into v_expired_export_jobs
  from private.export_jobs
  where expires_at <= v_now;

  select count(*)::integer into v_expired_idempotency
  from private.idempotency_records
  where expires_at <= v_now;

  select count(*)::integer into v_expired_rate_limits
  from private.rate_limit_counters
  where window_expires_at <= v_now;

  select count(*)::integer into v_due_purge_attempts
  from app.attempts
  where purge_at <= v_now;

  select count(*)::integer into v_active_support_sessions
  from private.support_access
  where revoked_at is null and expires_at > v_now;

  select count(*)::integer into v_quarantine_media
  from app.media_assets
  where scan_status = 'quarantine';

  return jsonb_build_object(
    'job_runs', v_jobs,
    'queues', jsonb_build_object(
      'expired_guest_sessions', v_expired_guest_sessions,
      'expired_export_jobs', v_expired_export_jobs,
      'expired_idempotency', v_expired_idempotency,
      'expired_rate_limits', v_expired_rate_limits,
      'due_purge_attempts', v_due_purge_attempts,
      'active_support_sessions', v_active_support_sessions,
      'quarantine_media', v_quarantine_media
    ),
    'server_now_utc', v_now
  );
end;
$$;

revoke all on function api.get_admin_maintenance_status(uuid) from public, anon, authenticated;
grant execute on function api.get_admin_maintenance_status(uuid) to service_role;

-- 7. Jalankan pembersihan retensi terjadwal oleh admin aktif + tulis audit
create or replace function api.run_admin_retention_purge(
  p_actor_id uuid,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_summary jsonb;
begin
  if not private.is_active_admin(p_actor_id) then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  v_summary := private.run_retention_purge();

  perform private.write_audit(
    'admin',
    p_actor_id::text,
    'run_retention_purge',
    'maintenance',
    'retention_purge',
    p_request_id,
    'success',
    v_summary
  );

  return jsonb_build_object(
    'summary', v_summary,
    'server_now_utc', v_now
  );
end;
$$;

revoke all on function api.run_admin_retention_purge(uuid, text) from public, anon, authenticated;
grant execute on function api.run_admin_retention_purge(uuid, text) to service_role;

-- 8. Daftar Permintaan Privasi + daftar sekolah untuk dropdown pencatatan
create or replace function api.list_admin_privacy_requests(
  p_actor_id uuid,
  p_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_status text := nullif(btrim(coalesce(p_status, '')), '');
  v_requests jsonb := '[]'::jsonb;
  v_schools jsonb := '[]'::jsonb;
begin
  if not private.is_active_admin(p_actor_id) then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  if v_status is not null and v_status not in ('received', 'verified', 'completed', 'rejected') then
    raise exception 'VALIDATION_FAILED:INVALID_STATUS';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'school_id', r.school_id,
        'school_name', r.school_name,
        'request_type', r.request_type,
        'status', r.status,
        'requester_channel', r.requester_channel,
        'reference_code', r.reference_code,
        'summary_note', r.summary_note,
        'resolution_note', r.resolution_note,
        'created_by_name', r.created_by_name,
        'handled_by_name', r.handled_by_name,
        'created_at', r.created_at,
        'updated_at', r.updated_at,
        'completed_at', r.completed_at
      )
      order by r.created_at desc
    ),
    '[]'::jsonb
  )
  into v_requests
  from (
    select
      pr.id,
      pr.school_id,
      sc.name as school_name,
      pr.request_type,
      pr.status,
      pr.requester_channel,
      pr.reference_code,
      pr.summary_note,
      pr.resolution_note,
      cp.display_name as created_by_name,
      hp.display_name as handled_by_name,
      pr.created_at,
      pr.updated_at,
      pr.completed_at
    from private.privacy_requests pr
    left join app.schools sc on sc.id = pr.school_id
    left join app.profiles cp on cp.user_id = pr.created_by
    left join app.profiles hp on hp.user_id = pr.handled_by
    where (v_status is null or pr.status = v_status)
    order by pr.created_at desc
    limit 100
  ) r;

  select coalesce(
    pg_catalog.jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'district_label', s.district_label,
        'status', s.status
      )
      order by s.name asc
    ),
    '[]'::jsonb
  )
  into v_schools
  from app.schools s;

  return jsonb_build_object(
    'requests', v_requests,
    'schools', v_schools,
    'server_now_utc', v_now
  );
end;
$$;

revoke all on function api.list_admin_privacy_requests(uuid, text) from public, anon, authenticated;
grant execute on function api.list_admin_privacy_requests(uuid, text) to service_role;

-- 9. Catat Permintaan Privasi baru (SEC-15: tanpa menyalin nama siswa ke log audit)
create or replace function api.create_privacy_request(
  p_actor_id uuid,
  p_school_id uuid,
  p_request_type text,
  p_requester_channel text,
  p_reference_code text,
  p_summary_note text default '',
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_type text := btrim(coalesce(p_request_type, ''));
  v_channel text := btrim(coalesce(p_requester_channel, ''));
  v_ref text := btrim(coalesce(p_reference_code, ''));
  v_note text := btrim(coalesce(p_summary_note, ''));
  v_school_name text := null;
  v_creator_name text := null;
  v_inserted private.privacy_requests%rowtype;
begin
  if not private.is_active_admin(p_actor_id) then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  if v_type not in ('access', 'correction', 'deletion') then
    raise exception 'VALIDATION_FAILED:INVALID_REQUEST_TYPE';
  end if;

  if char_length(v_channel) < 2 or char_length(v_channel) > 120 then
    raise exception 'VALIDATION_FAILED:INVALID_REQUESTER_CHANNEL';
  end if;

  if char_length(v_ref) < 2 or char_length(v_ref) > 80 then
    raise exception 'VALIDATION_FAILED:INVALID_REFERENCE_CODE';
  end if;

  if char_length(v_note) > 400 then
    raise exception 'VALIDATION_FAILED:NOTE_TOO_LONG';
  end if;

  if p_school_id is not null then
    select name into v_school_name from app.schools where id = p_school_id;
    if v_school_name is null then
      raise exception 'RESOURCE_NOT_FOUND';
    end if;
  end if;

  insert into private.privacy_requests (
    school_id,
    request_type,
    status,
    requester_channel,
    reference_code,
    summary_note,
    created_by,
    created_at,
    updated_at
  ) values (
    p_school_id,
    v_type,
    'received',
    v_channel,
    v_ref,
    v_note,
    p_actor_id,
    v_now,
    v_now
  )
  returning * into v_inserted;

  select display_name into v_creator_name from app.profiles where user_id = p_actor_id;

  -- Log audit tidak boleh memuat nama lengkap siswa atau catatan mentah
  perform private.write_audit(
    'admin',
    p_actor_id::text,
    'create_privacy_request',
    'privacy_request',
    v_inserted.id::text,
    p_request_id,
    'success',
    jsonb_build_object(
      'request_type', v_inserted.request_type,
      'status', v_inserted.status,
      'school_id', v_inserted.school_id,
      'reference_code', v_inserted.reference_code
    )
  );

  return jsonb_build_object(
    'id', v_inserted.id,
    'school_id', v_inserted.school_id,
    'school_name', v_school_name,
    'request_type', v_inserted.request_type,
    'status', v_inserted.status,
    'requester_channel', v_inserted.requester_channel,
    'reference_code', v_inserted.reference_code,
    'summary_note', v_inserted.summary_note,
    'resolution_note', v_inserted.resolution_note,
    'created_by_name', v_creator_name,
    'handled_by_name', null,
    'created_at', v_inserted.created_at,
    'updated_at', v_inserted.updated_at,
    'completed_at', v_inserted.completed_at
  );
end;
$$;

revoke all on function api.create_privacy_request(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function api.create_privacy_request(uuid, uuid, text, text, text, text, text) to service_role;

-- 10. Perbarui status Permintaan Privasi (received/verified -> verified/completed/rejected)
create or replace function api.update_privacy_request_status(
  p_actor_id uuid,
  p_privacy_request_id uuid,
  p_status text,
  p_resolution_note text default '',
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_status text := btrim(coalesce(p_status, ''));
  v_res_note text := btrim(coalesce(p_resolution_note, ''));
  v_existing private.privacy_requests%rowtype;
  v_updated private.privacy_requests%rowtype;
  v_school_name text := null;
  v_creator_name text := null;
  v_handler_name text := null;
begin
  if not private.is_active_admin(p_actor_id) then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  if v_status not in ('verified', 'completed', 'rejected') then
    raise exception 'VALIDATION_FAILED:INVALID_STATUS';
  end if;

  if char_length(v_res_note) > 400 then
    raise exception 'VALIDATION_FAILED:NOTE_TOO_LONG';
  end if;

  select * into v_existing
  from private.privacy_requests
  where id = p_privacy_request_id
  for update;

  if not found then
    raise exception 'RESOURCE_NOT_FOUND';
  end if;

  if v_existing.status in ('completed', 'rejected') then
    raise exception 'STATE_CONFLICT:PRIVACY_REQUEST_CLOSED';
  end if;

  update private.privacy_requests
  set
    status = v_status,
    resolution_note = case
      when v_res_note <> '' then v_res_note
      else resolution_note
    end,
    handled_by = p_actor_id,
    updated_at = v_now,
    completed_at = case
      when v_status in ('completed', 'rejected') then v_now
      else completed_at
    end
  where id = p_privacy_request_id
  returning * into v_updated;

  if v_updated.school_id is not null then
    select name into v_school_name from app.schools where id = v_updated.school_id;
  end if;
  select display_name into v_creator_name from app.profiles where user_id = v_updated.created_by;
  select display_name into v_handler_name from app.profiles where user_id = v_updated.handled_by;

  perform private.write_audit(
    'admin',
    p_actor_id::text,
    'update_privacy_request',
    'privacy_request',
    v_updated.id::text,
    p_request_id,
    'success',
    jsonb_build_object(
      'request_type', v_updated.request_type,
      'previous_status', v_existing.status,
      'new_status', v_updated.status,
      'school_id', v_updated.school_id,
      'reference_code', v_updated.reference_code
    )
  );

  return jsonb_build_object(
    'id', v_updated.id,
    'school_id', v_updated.school_id,
    'school_name', v_school_name,
    'request_type', v_updated.request_type,
    'status', v_updated.status,
    'requester_channel', v_updated.requester_channel,
    'reference_code', v_updated.reference_code,
    'summary_note', v_updated.summary_note,
    'resolution_note', v_updated.resolution_note,
    'created_by_name', v_creator_name,
    'handled_by_name', v_handler_name,
    'created_at', v_updated.created_at,
    'updated_at', v_updated.updated_at,
    'completed_at', v_updated.completed_at
  );
end;
$$;

revoke all on function api.update_privacy_request_status(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function api.update_privacy_request_status(uuid, uuid, text, text, text) to service_role;
