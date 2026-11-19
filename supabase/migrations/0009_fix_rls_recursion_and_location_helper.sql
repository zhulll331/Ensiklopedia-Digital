-- 0009_fix_rls_recursion_and_location_helper.sql
-- Memutus rekursi RLS antara app.quizzes dan app.quiz_revisions serta izin baca lokasi publik.

create or replace function app.can_read_quiz_revision(p_revision_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app.quiz_revisions qr
    join app.quizzes q on q.id = qr.quiz_id
    where qr.id = p_revision_id
      and qr.status = 'published'
      and q.published_revision_id = qr.id
      and q.archived_at is null
      and (
        qr.usage_mode = 'practice'
        or (qr.usage_mode = 'assignment' and app.current_user_is_active_teacher())
      )
  );
$$;

create or replace function app.is_cleared_public_location(
  p_revision_id uuid,
  p_clearance_review_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app.content_items ci
    join app.review_records rr on rr.id = p_clearance_review_id
    where ci.published_revision_id = p_revision_id
      and ci.archived_at is null
      and rr.revision_id = p_revision_id
      and rr.review_type = 'location'
      and rr.decision = 'approved'
  );
$$;

revoke all on function app.can_read_quiz_revision(uuid) from public;
revoke all on function app.is_cleared_public_location(uuid, uuid) from public;
grant execute on function app.can_read_quiz_revision(uuid) to anon, authenticated, service_role;
grant execute on function app.is_cleared_public_location(uuid, uuid) to anon, authenticated, service_role;

drop policy if exists site_public_locations_public_read on app.site_public_locations;
create policy site_public_locations_public_read on app.site_public_locations
  for select
  using (app.is_cleared_public_location(revision_id, clearance_review_id));

drop policy if exists quizzes_public_or_teacher_read on app.quizzes;
create policy quizzes_public_or_teacher_read on app.quizzes
  for select
  using (
    archived_at is null
    and published_revision_id is not null
    and app.can_read_quiz_revision(published_revision_id)
  );

drop policy if exists quiz_revisions_public_or_teacher_read on app.quiz_revisions;
create policy quiz_revisions_public_or_teacher_read on app.quiz_revisions
  for select
  using (app.can_read_quiz_revision(id));

drop policy if exists quiz_questions_public_or_teacher_read on app.quiz_questions;
create policy quiz_questions_public_or_teacher_read on app.quiz_questions
  for select
  using (app.can_read_quiz_revision(quiz_revision_id));

drop policy if exists quiz_choices_public_or_teacher_read on app.quiz_choices;
create policy quiz_choices_public_or_teacher_read on app.quiz_choices
  for select
  using (
    exists (
      select 1
      from app.quiz_questions qq
      where qq.id = quiz_choices.question_id
        and app.can_read_quiz_revision(qq.quiz_revision_id)
    )
  );
