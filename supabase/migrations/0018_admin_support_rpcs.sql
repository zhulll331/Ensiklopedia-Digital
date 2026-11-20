-- 0018_admin_support_rpcs.sql
-- Migrasi Fase 7: RPC Mode Dukungan Data Siswa (SEC-03, SEC-05, SEC-15, SEC-24, SEC-25).
-- Tidak membuka SELECT umum app.attempts untuk admin; akses selalu melalui grant private.support_access terbatas & teraudit.

create index if not exists idx_support_access_admin_created
  on private.support_access (admin_id, created_at desc);

create index if not exists idx_support_access_assignment_active
  on private.support_access (assignment_id, expires_at desc)
  where revoked_at is null;

-- 1. Daftar tugas non-PII + riwayat sesi dukungan milik admin (tanpa nama/skor siswa)
create or replace function api.list_admin_support_overview(
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_assignments jsonb := '[]'::jsonb;
  v_sessions jsonb := '[]'::jsonb;
begin
  if not private.is_active_admin(p_actor_id) then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'title', t.title,
        'state', t.state,
        'grade', t.grade,
        'opens_at', t.opens_at,
        'closes_at', t.closes_at,
        'class_label', t.class_label,
        'academic_year', t.academic_year,
        'school_name', t.school_name,
        'teacher_display_name', t.teacher_display_name,
        'quiz_title', t.quiz_title,
        'attempt_count', t.attempt_count,
        'submitted_count', t.submitted_count
      )
      order by t.created_at desc
    ),
    '[]'::jsonb
  )
  into v_assignments
  from (
    select
      a.id,
      a.title,
      a.state,
      a.grade,
      a.opens_at,
      a.closes_at,
      a.created_at,
      c.label as class_label,
      c.academic_year,
      s.name as school_name,
      p.display_name as teacher_display_name,
      qr.title as quiz_title,
      (
        select count(*)::integer
        from app.attempts att
        where att.assignment_id = a.id
      ) as attempt_count,
      (
        select count(*)::integer
        from app.attempts att
        where att.assignment_id = a.id
          and att.state = 'submitted'
      ) as submitted_count
    from app.assignments a
    join app.classes c on c.id = a.class_id
    join app.schools s on s.id = c.school_id
    join app.profiles p on p.user_id = a.teacher_id
    join app.quiz_revisions qr on qr.id = a.quiz_revision_id
    order by a.created_at desc
    limit 100
  ) t;

  select coalesce(
    pg_catalog.jsonb_agg(
      jsonb_build_object(
        'id', row_item.id,
        'assignment_id', row_item.assignment_id,
        'assignment_title', row_item.assignment_title,
        'class_label', row_item.class_label,
        'school_name', row_item.school_name,
        'teacher_display_name', row_item.teacher_display_name,
        'reason', row_item.reason,
        'expires_at', row_item.expires_at,
        'revoked_at', row_item.revoked_at,
        'created_at', row_item.created_at,
        'is_active', row_item.is_active
      )
      order by row_item.created_at desc
    ),
    '[]'::jsonb
  )
  into v_sessions
  from (
    select
      sa.id,
      sa.assignment_id,
      a.title as assignment_title,
      c.label as class_label,
      s.name as school_name,
      tp.display_name as teacher_display_name,
      sa.reason,
      sa.expires_at,
      sa.revoked_at,
      sa.created_at,
      (sa.revoked_at is null and sa.expires_at > v_now) as is_active
    from private.support_access sa
    join app.assignments a on a.id = sa.assignment_id
    join app.classes c on c.id = a.class_id
    join app.schools s on s.id = c.school_id
    join app.profiles tp on tp.user_id = a.teacher_id
    where sa.admin_id = p_actor_id
    order by sa.created_at desc
    limit 25
  ) row_item;

  return jsonb_build_object(
    'assignments', v_assignments,
    'sessions', v_sessions,
    'server_now_utc', v_now
  );
end;
$$;

revoke all on function api.list_admin_support_overview(uuid) from public, anon, authenticated;
grant execute on function api.list_admin_support_overview(uuid) to service_role;

-- 2. Buka sesi dukungan berjangka (<= 30 menit, scope 1 tugas, maks 1 sesi aktif per admin)
create or replace function api.create_support_access(
  p_actor_id uuid,
  p_assignment_id uuid,
  p_reason text,
  p_duration_minutes integer default 15,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_reason text := btrim(coalesce(p_reason, ''));
  v_asg record;
  v_grant private.support_access%rowtype;
begin
  if not private.is_active_admin(p_actor_id) then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  if char_length(v_reason) < 5 or char_length(v_reason) > 300 then
    raise exception 'VALIDATION_FAILED:REASON_REQUIRED';
  end if;

  if p_duration_minutes is null or p_duration_minutes < 5 or p_duration_minutes > 30 then
    raise exception 'VALIDATION_FAILED:INVALID_DURATION';
  end if;

  select
    a.id,
    a.title,
    c.label as class_label,
    s.name as school_name,
    p.display_name as teacher_display_name
  into v_asg
  from app.assignments a
  join app.classes c on c.id = a.class_id
  join app.schools s on s.id = c.school_id
  join app.profiles p on p.user_id = a.teacher_id
  where a.id = p_assignment_id;

  if not found then
    raise exception 'RESOURCE_NOT_FOUND';
  end if;

  -- Kunci baris profil admin agar pembukaan sesi dukungan ganda tidak lolos paralel
  perform 1
  from app.profiles prof
  where prof.user_id = p_actor_id
  for update;

  if exists (
    select 1
    from private.support_access sa
    where sa.admin_id = p_actor_id
      and sa.revoked_at is null
      and sa.expires_at > v_now
  ) then
    raise exception 'STATE_CONFLICT:ACTIVE_SUPPORT_SESSION_EXISTS';
  end if;

  insert into private.support_access (
    admin_id,
    assignment_id,
    reason,
    expires_at,
    created_at
  ) values (
    p_actor_id,
    p_assignment_id,
    v_reason,
    v_now + pg_catalog.make_interval(mins => p_duration_minutes),
    v_now
  )
  returning * into v_grant;

  perform private.write_audit(
    'admin',
    p_actor_id::text,
    'support_access_granted',
    'support_access',
    v_grant.id::text,
    p_request_id,
    'success',
    jsonb_build_object(
      'assignment_id', v_grant.assignment_id,
      'duration_minutes', p_duration_minutes,
      'expires_at', v_grant.expires_at,
      'reason_length', char_length(v_reason)
    )
  );

  return jsonb_build_object(
    'id', v_grant.id,
    'assignment_id', v_grant.assignment_id,
    'assignment_title', v_asg.title,
    'class_label', v_asg.class_label,
    'school_name', v_asg.school_name,
    'teacher_display_name', v_asg.teacher_display_name,
    'reason', v_grant.reason,
    'expires_at', v_grant.expires_at,
    'revoked_at', v_grant.revoked_at,
    'created_at', v_grant.created_at,
    'is_active', true,
    'server_now_utc', v_now
  );
end;
$$;

revoke all on function api.create_support_access(uuid, uuid, text, integer, text) from public, anon, authenticated;
grant execute on function api.create_support_access(uuid, uuid, text, integer, text) to service_role;

-- 3. Baca hasil terbatas satu tugas melalui grant dukungan aktif + audit tiap pembacaan
create or replace function api.read_support_access_results(
  p_actor_id uuid,
  p_support_access_id uuid,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_grant private.support_access%rowtype;
  v_asg record;
  v_attempts jsonb := '[]'::jsonb;
  v_attempt_count integer := 0;
begin
  if not private.is_active_admin(p_actor_id) then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  select *
  into v_grant
  from private.support_access sa
  where sa.id = p_support_access_id;

  if not found then
    raise exception 'RESOURCE_NOT_FOUND';
  end if;

  if v_grant.admin_id <> p_actor_id then
    raise exception 'ACTION_NOT_ALLOWED:SUPPORT_OWNER_MISMATCH';
  end if;

  if v_grant.revoked_at is not null then
    raise exception 'STATE_CONFLICT:SUPPORT_REVOKED';
  end if;

  if v_grant.expires_at <= v_now then
    raise exception 'SESSION_EXPIRED:SUPPORT_EXPIRED';
  end if;

  select
    a.id,
    a.title,
    a.state,
    a.grade,
    a.opens_at,
    a.closes_at,
    c.label as class_label,
    c.academic_year,
    s.name as school_name,
    p.display_name as teacher_display_name
  into v_asg
  from app.assignments a
  join app.classes c on c.id = a.class_id
  join app.schools s on s.id = c.school_id
  join app.profiles p on p.user_id = a.teacher_id
  where a.id = v_grant.assignment_id;

  if not found then
    raise exception 'RESOURCE_NOT_FOUND';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      jsonb_build_object(
        'attempt_id', row_item.id,
        'student_name', row_item.student_name,
        'corrected_name', row_item.corrected_name,
        'state', row_item.state,
        'score', row_item.score,
        'correct_count', row_item.correct_count,
        'question_count', row_item.question_count,
        'started_at', row_item.started_at,
        'submitted_at', row_item.submitted_at,
        'receipt_code', row_item.receipt_code,
        'purge_at', row_item.purge_at,
        'verification_status', row_item.verification_status,
        'annotations_count', row_item.annotations_count
      )
      order by row_item.submitted_at desc nulls last, row_item.started_at desc
    ),
    '[]'::jsonb
  )
  into v_attempts
  from (
    select
      att.id,
      att.student_name,
      att.corrected_name,
      att.state,
      att.score,
      att.correct_count,
      att.question_count,
      att.started_at,
      att.submitted_at,
      att.receipt_code,
      att.purge_at,
      coalesce(
        (
          select aa.kind
          from app.attempt_annotations aa
          where aa.attempt_id = att.id
            and aa.kind in ('verified', 'invalidated')
          order by aa.created_at desc
          limit 1
        ),
        'unverified'
      ) as verification_status,
      (
        select count(*)::integer
        from app.attempt_annotations aa
        where aa.attempt_id = att.id
      ) as annotations_count
    from app.attempts att
    where att.assignment_id = v_grant.assignment_id
    order by att.submitted_at desc nulls last, att.started_at desc
    limit 200
  ) row_item;

  v_attempt_count := coalesce(jsonb_array_length(v_attempts), 0);

  perform private.write_audit(
    'admin',
    p_actor_id::text,
    'support_access_read_results',
    'support_access',
    v_grant.id::text,
    p_request_id,
    'success',
    jsonb_build_object(
      'assignment_id', v_grant.assignment_id,
      'attempt_count', v_attempt_count
    )
  );

  return jsonb_build_object(
    'session', jsonb_build_object(
      'id', v_grant.id,
      'assignment_id', v_grant.assignment_id,
      'assignment_title', v_asg.title,
      'class_label', v_asg.class_label,
      'school_name', v_asg.school_name,
      'teacher_display_name', v_asg.teacher_display_name,
      'reason', v_grant.reason,
      'expires_at', v_grant.expires_at,
      'revoked_at', v_grant.revoked_at,
      'created_at', v_grant.created_at,
      'is_active', true
    ),
    'assignment', jsonb_build_object(
      'id', v_asg.id,
      'title', v_asg.title,
      'state', v_asg.state,
      'grade', v_asg.grade,
      'opens_at', v_asg.opens_at,
      'closes_at', v_asg.closes_at,
      'class_label', v_asg.class_label,
      'academic_year', v_asg.academic_year,
      'school_name', v_asg.school_name,
      'teacher_display_name', v_asg.teacher_display_name
    ),
    'attempts', v_attempts,
    'server_now_utc', v_now
  );
end;
$$;

revoke all on function api.read_support_access_results(uuid, uuid, text) from public, anon, authenticated;
grant execute on function api.read_support_access_results(uuid, uuid, text) to service_role;

-- 4. Cabut sesi dukungan seketika sebelum kedaluwarsa
create or replace function api.revoke_support_access(
  p_actor_id uuid,
  p_support_access_id uuid,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_grant private.support_access%rowtype;
begin
  if not private.is_active_admin(p_actor_id) then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  select *
  into v_grant
  from private.support_access sa
  where sa.id = p_support_access_id
  for update;

  if not found then
    raise exception 'RESOURCE_NOT_FOUND';
  end if;

  if v_grant.admin_id <> p_actor_id then
    raise exception 'ACTION_NOT_ALLOWED:SUPPORT_OWNER_MISMATCH';
  end if;

  update private.support_access
  set revoked_at = coalesce(revoked_at, v_now)
  where id = p_support_access_id
  returning * into v_grant;

  perform private.write_audit(
    'admin',
    p_actor_id::text,
    'support_access_revoked',
    'support_access',
    v_grant.id::text,
    p_request_id,
    'success',
    jsonb_build_object(
      'assignment_id', v_grant.assignment_id,
      'revoked_at', v_grant.revoked_at
    )
  );

  return jsonb_build_object(
    'id', v_grant.id,
    'assignment_id', v_grant.assignment_id,
    'revoked_at', v_grant.revoked_at,
    'expires_at', v_grant.expires_at,
    'is_active', false
  );
end;
$$;

revoke all on function api.revoke_support_access(uuid, uuid, text) from public, anon, authenticated;
grant execute on function api.revoke_support_access(uuid, uuid, text) to service_role;
