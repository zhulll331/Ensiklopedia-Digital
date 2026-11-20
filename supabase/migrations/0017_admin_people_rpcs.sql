-- 0017_admin_people_rpcs.sql
-- Migrasi Fase 6: RPC Manajemen Guru & Sekolah (admin tidak dapat diberikan lewat modul ini; SEC-02/SEC-03/05_API §6).

-- 1. Tambah entitas sekolah baru
create or replace function api.create_school(
  p_actor_id uuid,
  p_name text,
  p_district_label text,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_district text := btrim(coalesce(p_district_label, ''));
  v_school app.schools%rowtype;
begin
  if not private.is_active_admin(p_actor_id) then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'VALIDATION_FAILED:INVALID_SCHOOL_NAME';
  end if;

  if char_length(v_district) < 2 or char_length(v_district) > 80 then
    raise exception 'VALIDATION_FAILED:INVALID_DISTRICT';
  end if;

  if exists (
    select 1
    from app.schools s
    where lower(btrim(s.name)) = lower(v_name)
      and lower(btrim(s.district_label)) = lower(v_district)
  ) then
    raise exception 'VALIDATION_FAILED:SCHOOL_EXISTS';
  end if;

  insert into app.schools (name, district_label, status)
  values (v_name, v_district, 'active')
  returning * into v_school;

  perform private.write_audit(
    'admin',
    p_actor_id::text,
    'create_school',
    'school',
    v_school.id::text,
    p_request_id,
    'success',
    jsonb_build_object(
      'district_label', v_school.district_label,
      'status', v_school.status
    )
  );

  return jsonb_build_object(
    'id', v_school.id,
    'name', v_school.name,
    'district_label', v_school.district_label,
    'status', v_school.status,
    'created_at', v_school.created_at
  );
end;
$$;

revoke all on function api.create_school(uuid, text, text, text) from public, anon, authenticated;
grant execute on function api.create_school(uuid, text, text, text) to service_role;

-- 2. Perbarui data atau status arsip sekolah (tanpa DELETE demi keutuhan FK app.classes)
create or replace function api.update_school(
  p_actor_id uuid,
  p_school_id uuid,
  p_name text,
  p_district_label text,
  p_status text,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_district text := btrim(coalesce(p_district_label, ''));
  v_school app.schools%rowtype;
begin
  if not private.is_active_admin(p_actor_id) then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  select *
  into v_school
  from app.schools s
  where s.id = p_school_id
  for update;

  if not found then
    raise exception 'RESOURCE_NOT_FOUND';
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'VALIDATION_FAILED:INVALID_SCHOOL_NAME';
  end if;

  if char_length(v_district) < 2 or char_length(v_district) > 80 then
    raise exception 'VALIDATION_FAILED:INVALID_DISTRICT';
  end if;

  if p_status not in ('active', 'archived') then
    raise exception 'VALIDATION_FAILED:INVALID_SCHOOL_STATUS';
  end if;

  if exists (
    select 1
    from app.schools s
    where s.id <> p_school_id
      and lower(btrim(s.name)) = lower(v_name)
      and lower(btrim(s.district_label)) = lower(v_district)
  ) then
    raise exception 'VALIDATION_FAILED:SCHOOL_EXISTS';
  end if;

  update app.schools
  set name = v_name,
      district_label = v_district,
      status = p_status
  where id = p_school_id
  returning * into v_school;

  perform private.write_audit(
    'admin',
    p_actor_id::text,
    'update_school',
    'school',
    v_school.id::text,
    p_request_id,
    'success',
    jsonb_build_object(
      'district_label', v_school.district_label,
      'status', v_school.status
    )
  );

  return jsonb_build_object(
    'id', v_school.id,
    'name', v_school.name,
    'district_label', v_school.district_label,
    'status', v_school.status,
    'created_at', v_school.created_at
  );
end;
$$;

revoke all on function api.update_school(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function api.update_school(uuid, uuid, text, text, text, text) to service_role;

-- 3. Daftarkan atau perbarui profil guru (role terkunci 'teacher'; akun admin dilindungi)
create or replace function api.register_teacher_profile(
  p_actor_id uuid,
  p_user_id uuid,
  p_display_name text,
  p_status text default 'invited',
  p_school_ids uuid[] default '{}'::uuid[],
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display_name text := btrim(coalesce(p_display_name, ''));
  v_existing app.profiles%rowtype;
  v_profile app.profiles%rowtype;
  v_school_id uuid;
  v_school_count integer := 0;
begin
  if not private.is_active_admin(p_actor_id) then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  if char_length(v_display_name) < 2 or char_length(v_display_name) > 80 then
    raise exception 'VALIDATION_FAILED:INVALID_DISPLAY_NAME';
  end if;

  if p_status not in ('invited', 'active') then
    raise exception 'VALIDATION_FAILED:INVALID_TEACHER_STATUS';
  end if;

  select *
  into v_existing
  from app.profiles p
  where p.user_id = p_user_id
  for update;

  if found and v_existing.role <> 'teacher' then
    raise exception 'ACTION_NOT_ALLOWED:ADMIN_ACCOUNT_PROTECTED';
  end if;

  insert into app.profiles (user_id, role, display_name, status)
  values (p_user_id, 'teacher', v_display_name, p_status)
  on conflict (user_id) do update
    set display_name = excluded.display_name,
        status = case
          when app.profiles.status = 'active' then 'active'
          else excluded.status
        end,
        updated_at = timezone('utc', now())
  returning * into v_profile;

  if p_school_ids is not null and coalesce(pg_catalog.array_length(p_school_ids, 1), 0) > 0 then
    foreach v_school_id in array p_school_ids loop
      if not exists (
        select 1
        from app.schools s
        where s.id = v_school_id
          and s.status = 'active'
      ) then
        raise exception 'VALIDATION_FAILED:INVALID_SCHOOL';
      end if;

      insert into app.teacher_schools (teacher_id, school_id, status)
      values (p_user_id, v_school_id, 'active')
      on conflict (teacher_id, school_id) do update
        set status = 'active';

      v_school_count := v_school_count + 1;
    end loop;
  end if;

  perform private.write_audit(
    'admin',
    p_actor_id::text,
    'register_teacher_profile',
    'profile',
    v_profile.user_id::text,
    p_request_id,
    'success',
    jsonb_build_object(
      'teacher_id', v_profile.user_id,
      'status', v_profile.status,
      'school_count', v_school_count
    )
  );

  return jsonb_build_object(
    'user_id', v_profile.user_id,
    'role', v_profile.role,
    'display_name', v_profile.display_name,
    'status', v_profile.status,
    'created_at', v_profile.created_at,
    'updated_at', v_profile.updated_at
  );
end;
$$;

revoke all on function api.register_teacher_profile(uuid, uuid, text, text, uuid[], text) from public, anon, authenticated;
grant execute on function api.register_teacher_profile(uuid, uuid, text, text, uuid[], text) to service_role;

-- 4. Perbarui nama tampilan guru (hanya akun ber-role 'teacher')
create or replace function api.update_teacher_profile(
  p_actor_id uuid,
  p_teacher_id uuid,
  p_display_name text,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display_name text := btrim(coalesce(p_display_name, ''));
  v_profile app.profiles%rowtype;
begin
  if not private.is_active_admin(p_actor_id) then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  if char_length(v_display_name) < 2 or char_length(v_display_name) > 80 then
    raise exception 'VALIDATION_FAILED:INVALID_DISPLAY_NAME';
  end if;

  select *
  into v_profile
  from app.profiles p
  where p.user_id = p_teacher_id
  for update;

  if not found then
    raise exception 'RESOURCE_NOT_FOUND';
  end if;

  if v_profile.role <> 'teacher' then
    raise exception 'ACTION_NOT_ALLOWED:ADMIN_ACCOUNT_PROTECTED';
  end if;

  update app.profiles
  set display_name = v_display_name,
      updated_at = timezone('utc', now())
  where user_id = p_teacher_id
  returning * into v_profile;

  perform private.write_audit(
    'admin',
    p_actor_id::text,
    'update_teacher_profile',
    'profile',
    v_profile.user_id::text,
    p_request_id,
    'success',
    jsonb_build_object(
      'teacher_id', v_profile.user_id,
      'status', v_profile.status
    )
  );

  return jsonb_build_object(
    'user_id', v_profile.user_id,
    'role', v_profile.role,
    'display_name', v_profile.display_name,
    'status', v_profile.status,
    'updated_at', v_profile.updated_at
  );
end;
$$;

revoke all on function api.update_teacher_profile(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function api.update_teacher_profile(uuid, uuid, text, text) to service_role;

-- 5. Aktivasi / suspensi akun guru (langsung memengaruhi RLS is_active_teacher)
create or replace function api.set_teacher_status(
  p_actor_id uuid,
  p_teacher_id uuid,
  p_status text,
  p_reason text default null,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile app.profiles%rowtype;
  v_prev_status text;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not private.is_active_admin(p_actor_id) then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  if p_status not in ('active', 'suspended') then
    raise exception 'VALIDATION_FAILED:INVALID_TEACHER_STATUS';
  end if;

  if p_status = 'suspended' and char_length(v_reason) < 5 then
    raise exception 'VALIDATION_FAILED:REASON_REQUIRED';
  end if;

  select *
  into v_profile
  from app.profiles p
  where p.user_id = p_teacher_id
  for update;

  if not found then
    raise exception 'RESOURCE_NOT_FOUND';
  end if;

  if v_profile.role <> 'teacher' then
    raise exception 'ACTION_NOT_ALLOWED:ADMIN_ACCOUNT_PROTECTED';
  end if;

  v_prev_status := v_profile.status;

  update app.profiles
  set status = p_status,
      updated_at = timezone('utc', now())
  where user_id = p_teacher_id
  returning * into v_profile;

  perform private.write_audit(
    'admin',
    p_actor_id::text,
    'set_teacher_status',
    'profile',
    v_profile.user_id::text,
    p_request_id,
    'success',
    jsonb_build_object(
      'teacher_id', v_profile.user_id,
      'from_status', v_prev_status,
      'to_status', v_profile.status,
      'reason', left(v_reason, 300)
    )
  );

  return jsonb_build_object(
    'user_id', v_profile.user_id,
    'from_status', v_prev_status,
    'status', v_profile.status,
    'updated_at', v_profile.updated_at
  );
end;
$$;

revoke all on function api.set_teacher_status(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function api.set_teacher_status(uuid, uuid, text, text, text) to service_role;

-- 6. Kelola tautan guru ke sekolah secara non-destruktif (active / inactive)
create or replace function api.set_teacher_school_link(
  p_actor_id uuid,
  p_teacher_id uuid,
  p_school_id uuid,
  p_status text,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile app.profiles%rowtype;
  v_school app.schools%rowtype;
begin
  if not private.is_active_admin(p_actor_id) then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  if p_status not in ('active', 'inactive') then
    raise exception 'VALIDATION_FAILED:INVALID_LINK_STATUS';
  end if;

  select *
  into v_profile
  from app.profiles p
  where p.user_id = p_teacher_id;

  if not found then
    raise exception 'RESOURCE_NOT_FOUND';
  end if;

  if v_profile.role <> 'teacher' then
    raise exception 'ACTION_NOT_ALLOWED:ADMIN_ACCOUNT_PROTECTED';
  end if;

  select *
  into v_school
  from app.schools s
  where s.id = p_school_id;

  if not found then
    raise exception 'VALIDATION_FAILED:INVALID_SCHOOL';
  end if;

  if p_status = 'active' and v_school.status <> 'active' then
    raise exception 'VALIDATION_FAILED:SCHOOL_ARCHIVED';
  end if;

  insert into app.teacher_schools (teacher_id, school_id, status)
  values (p_teacher_id, p_school_id, p_status)
  on conflict (teacher_id, school_id) do update
    set status = excluded.status;

  perform private.write_audit(
    'admin',
    p_actor_id::text,
    'set_teacher_school_link',
    'teacher_school',
    p_teacher_id::text,
    p_request_id,
    'success',
    jsonb_build_object(
      'teacher_id', p_teacher_id,
      'school_id', p_school_id,
      'status', p_status
    )
  );

  return jsonb_build_object(
    'teacher_id', p_teacher_id,
    'school_id', p_school_id,
    'status', p_status
  );
end;
$$;

revoke all on function api.set_teacher_school_link(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function api.set_teacher_school_link(uuid, uuid, uuid, text, text) to service_role;

-- 7. Aktivasi mandiri guru yang menerima undangan email melalui /auth/callback
create or replace function api.activate_invited_teacher_self(
  p_user_id uuid,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile app.profiles%rowtype;
begin
  update app.profiles
  set status = 'active',
      updated_at = timezone('utc', now())
  where user_id = p_user_id
    and role = 'teacher'
    and status = 'invited'
  returning * into v_profile;

  if not found then
    return jsonb_build_object('activated', false);
  end if;

  perform private.write_audit(
    'teacher',
    p_user_id::text,
    'accept_teacher_invite',
    'profile',
    p_user_id::text,
    p_request_id,
    'success',
    jsonb_build_object('status', v_profile.status)
  );

  return jsonb_build_object(
    'activated', true,
    'user_id', v_profile.user_id,
    'status', v_profile.status
  );
end;
$$;

revoke all on function api.activate_invited_teacher_self(uuid, text) from public, anon, authenticated;
grant execute on function api.activate_invited_teacher_self(uuid, text) to service_role;
