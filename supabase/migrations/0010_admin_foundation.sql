-- 0010_admin_foundation.sql
-- Fondasi otorisasi admin (RLS baca via sesi admin + helper audit transaksi).

create or replace function app.current_user_is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from app.profiles p
      where p.user_id = auth.uid()
        and p.role = 'admin'
        and p.status = 'active'
    );
$$;

revoke all on function app.current_user_is_active_admin() from public;
grant execute on function app.current_user_is_active_admin() to anon, authenticated, service_role;

-- Izin SELECT tambahan bagi sesi authenticated (tetap dibatasi oleh RLS admin di bawah)
grant select on
  app.review_records,
  app.quiz_review_records,
  app.question_sources
to authenticated;

-- Kebijakan RLS baca untuk admin aktif (dibatasi TO authenticated; BUKAN tabel kiriman/nilai siswa)
drop policy if exists content_items_admin_read on app.content_items;
create policy content_items_admin_read on app.content_items
  for select
  to authenticated
  using (app.current_user_is_active_admin());

drop policy if exists content_revisions_admin_read on app.content_revisions;
create policy content_revisions_admin_read on app.content_revisions
  for select
  to authenticated
  using (app.current_user_is_active_admin());

drop policy if exists review_records_admin_read on app.review_records;
create policy review_records_admin_read on app.review_records
  for select
  to authenticated
  using (app.current_user_is_active_admin());

drop policy if exists source_references_admin_read on app.source_references;
create policy source_references_admin_read on app.source_references
  for select
  to authenticated
  using (app.current_user_is_active_admin());

drop policy if exists revision_sources_admin_read on app.revision_sources;
create policy revision_sources_admin_read on app.revision_sources
  for select
  to authenticated
  using (app.current_user_is_active_admin());

drop policy if exists content_links_admin_read on app.content_links;
create policy content_links_admin_read on app.content_links
  for select
  to authenticated
  using (app.current_user_is_active_admin());

drop policy if exists site_public_locations_admin_read on app.site_public_locations;
create policy site_public_locations_admin_read on app.site_public_locations
  for select
  to authenticated
  using (app.current_user_is_active_admin());

drop policy if exists media_assets_admin_read on app.media_assets;
create policy media_assets_admin_read on app.media_assets
  for select
  to authenticated
  using (app.current_user_is_active_admin());

drop policy if exists content_media_admin_read on app.content_media;
create policy content_media_admin_read on app.content_media
  for select
  to authenticated
  using (app.current_user_is_active_admin());

drop policy if exists quizzes_admin_read on app.quizzes;
create policy quizzes_admin_read on app.quizzes
  for select
  to authenticated
  using (app.current_user_is_active_admin());

drop policy if exists quiz_revisions_admin_read on app.quiz_revisions;
create policy quiz_revisions_admin_read on app.quiz_revisions
  for select
  to authenticated
  using (app.current_user_is_active_admin());

drop policy if exists quiz_review_records_admin_read on app.quiz_review_records;
create policy quiz_review_records_admin_read on app.quiz_review_records
  for select
  to authenticated
  using (app.current_user_is_active_admin());

drop policy if exists quiz_questions_admin_read on app.quiz_questions;
create policy quiz_questions_admin_read on app.quiz_questions
  for select
  to authenticated
  using (app.current_user_is_active_admin());

drop policy if exists quiz_choices_admin_read on app.quiz_choices;
create policy quiz_choices_admin_read on app.quiz_choices
  for select
  to authenticated
  using (app.current_user_is_active_admin());

drop policy if exists question_sources_admin_read on app.question_sources;
create policy question_sources_admin_read on app.question_sources
  for select
  to authenticated
  using (app.current_user_is_active_admin());

drop policy if exists profiles_admin_read on app.profiles;
create policy profiles_admin_read on app.profiles
  for select
  to authenticated
  using (app.current_user_is_active_admin());

drop policy if exists schools_admin_read on app.schools;
create policy schools_admin_read on app.schools
  for select
  to authenticated
  using (app.current_user_is_active_admin());

drop policy if exists teacher_schools_admin_read on app.teacher_schools;
create policy teacher_schools_admin_read on app.teacher_schools
  for select
  to authenticated
  using (app.current_user_is_active_admin());

-- Helper audit internal untuk dipakai transaksi RPC admin berikutnya
create or replace function private.write_audit(
  p_actor_type text,
  p_actor_id text,
  p_action text,
  p_target_type text,
  p_target_id text,
  p_request_id text,
  p_outcome text default 'success',
  p_safe_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into private.audit_logs (
    actor_type,
    actor_id,
    action,
    target_type,
    target_id,
    request_id,
    outcome,
    safe_metadata
  ) values (
    p_actor_type,
    coalesce(nullif(btrim(p_actor_id), ''), 'anonymous'),
    p_action,
    p_target_type,
    coalesce(nullif(btrim(p_target_id), ''), '-'),
    coalesce(nullif(btrim(p_request_id), ''), gen_random_uuid()::text),
    p_outcome,
    coalesce(p_safe_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function private.write_audit(text, text, text, text, text, text, text, jsonb) from public;
grant execute on function private.write_audit(text, text, text, text, text, text, text, jsonb) to service_role;

create or replace function api.write_admin_audit(
  p_actor_id uuid,
  p_action text,
  p_target_type text,
  p_target_id text,
  p_request_id text,
  p_outcome text default 'success',
  p_safe_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.write_audit(
    'admin',
    coalesce(p_actor_id::text, 'anonymous'),
    p_action,
    p_target_type,
    p_target_id,
    p_request_id,
    p_outcome,
    p_safe_metadata
  );
end;
$$;

revoke all on function api.write_admin_audit(uuid, text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function api.write_admin_audit(uuid, text, text, text, text, text, jsonb) to service_role;
