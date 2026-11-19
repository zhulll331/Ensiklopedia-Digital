-- 0008_supabase_grants_and_rpcs.sql
-- Grants schema/tabel minimum, pelengkapan RLS app.*, serta fungsi RPC SECURITY DEFINER di schema api.

-- 1. Grants schema (private TIDAK pernah diberi usage ke anon/authenticated)
grant usage on schema app to anon, authenticated, service_role;
grant usage on schema api to service_role, guest_api;

grant select on
  app.content_items,
  app.content_revisions,
  app.site_public_locations,
  app.media_assets,
  app.content_media,
  app.source_references,
  app.revision_sources,
  app.content_links,
  app.site_settings,
  app.quizzes,
  app.quiz_revisions,
  app.quiz_questions,
  app.quiz_choices
to anon, authenticated;

grant select on
  app.profiles,
  app.schools,
  app.teacher_schools,
  app.attempts,
  app.attempt_questions,
  app.attempt_answers
to authenticated;

grant select, insert, update on
  app.classes,
  app.assignments,
  app.attempt_annotations,
  app.result_selections
to authenticated;

grant all on all tables in schema app to service_role;
grant all on all tables in schema private to service_role;
grant all on all sequences in schema app to service_role;
grant all on all sequences in schema private to service_role;

-- Helper RLS di schema app tanpa memerlukan USAGE pada schema private
create or replace function app.current_user_is_active_teacher()
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
        and p.role = 'teacher'
        and p.status = 'active'
    );
$$;

revoke all on function app.current_user_is_active_teacher() from public;
grant execute on function app.current_user_is_active_teacher() to anon, authenticated, service_role;

-- 2. Lengkapi dan perbarui kebijakan RLS pada tabel app.*
drop policy if exists classes_teacher_own on app.classes;
create policy classes_teacher_own on app.classes
  for all
  using (teacher_id = auth.uid() and app.current_user_is_active_teacher())
  with check (teacher_id = auth.uid() and app.current_user_is_active_teacher());

drop policy if exists assignments_teacher_own on app.assignments;
create policy assignments_teacher_own on app.assignments
  for all
  using (
    app.current_user_is_active_teacher()
    and exists (
      select 1
      from app.classes c
      where c.id = assignments.class_id
        and c.teacher_id = auth.uid()
    )
  )
  with check (
    app.current_user_is_active_teacher()
    and exists (
      select 1
      from app.classes c
      where c.id = assignments.class_id
        and c.teacher_id = auth.uid()
    )
  );

drop policy if exists attempts_teacher_read_own on app.attempts;
create policy attempts_teacher_read_own on app.attempts
  for select
  using (
    app.current_user_is_active_teacher()
    and exists (
      select 1
      from app.assignments a
      join app.classes c on c.id = a.class_id
      where a.id = attempts.assignment_id
        and c.teacher_id = auth.uid()
    )
  );

drop policy if exists attempt_annotations_teacher_own on app.attempt_annotations;
create policy attempt_annotations_teacher_own on app.attempt_annotations
  for select
  using (
    app.current_user_is_active_teacher()
    and exists (
      select 1
      from app.attempts att
      join app.assignments a on a.id = att.assignment_id
      join app.classes c on c.id = a.class_id
      where att.id = attempt_annotations.attempt_id
        and c.teacher_id = auth.uid()
    )
  );

drop policy if exists site_settings_public_read on app.site_settings;
create policy site_settings_public_read on app.site_settings
  for select
  using (true);

drop policy if exists source_references_public_read on app.source_references;
create policy source_references_public_read on app.source_references
  for select
  using (
    exists (
      select 1
      from app.revision_sources rs
      join app.content_items ci on ci.published_revision_id = rs.revision_id
      where rs.source_id = source_references.id
        and ci.archived_at is null
    )
  );

drop policy if exists revision_sources_public_read on app.revision_sources;
create policy revision_sources_public_read on app.revision_sources
  for select
  using (
    exists (
      select 1
      from app.content_items ci
      where ci.published_revision_id = revision_sources.revision_id
        and ci.archived_at is null
    )
  );

drop policy if exists content_links_public_read on app.content_links;
create policy content_links_public_read on app.content_links
  for select
  using (
    exists (
      select 1
      from app.content_items ci
      where ci.published_revision_id = content_links.revision_id
        and ci.archived_at is null
    )
  );

drop policy if exists content_media_public_read on app.content_media;
create policy content_media_public_read on app.content_media
  for select
  using (
    exists (
      select 1
      from app.content_items ci
      join app.media_assets ma on ma.id = content_media.asset_id
      where ci.published_revision_id = content_media.revision_id
        and ci.archived_at is null
        and ma.visibility = 'public'
        and ma.scan_status = 'cleared'
        and ma.metadata_scrubbed_at is not null
    )
  );

drop policy if exists schools_teacher_read on app.schools;
create policy schools_teacher_read on app.schools
  for select
  using (
    app.current_user_is_active_teacher()
    and exists (
      select 1
      from app.teacher_schools ts
      where ts.school_id = schools.id
        and ts.teacher_id = auth.uid()
        and ts.status = 'active'
    )
  );

drop policy if exists teacher_schools_own_read on app.teacher_schools;
create policy teacher_schools_own_read on app.teacher_schools
  for select
  using (teacher_id = auth.uid() and app.current_user_is_active_teacher());

drop policy if exists quizzes_public_or_teacher_read on app.quizzes;
create policy quizzes_public_or_teacher_read on app.quizzes
  for select
  using (
    archived_at is null
    and published_revision_id is not null
    and (
      exists (
        select 1
        from app.quiz_revisions qr
        where qr.id = quizzes.published_revision_id
          and qr.status = 'published'
          and qr.usage_mode = 'practice'
      )
      or (
        app.current_user_is_active_teacher()
        and exists (
          select 1
          from app.quiz_revisions qr
          where qr.id = quizzes.published_revision_id
            and qr.status = 'published'
            and qr.usage_mode = 'assignment'
        )
      )
    )
  );

drop policy if exists quiz_revisions_public_or_teacher_read on app.quiz_revisions;
create policy quiz_revisions_public_or_teacher_read on app.quiz_revisions
  for select
  using (
    status = 'published'
    and exists (
      select 1
      from app.quizzes q
      where q.id = quiz_revisions.quiz_id
        and q.published_revision_id = quiz_revisions.id
        and q.archived_at is null
    )
    and (
      usage_mode = 'practice'
      or (usage_mode = 'assignment' and app.current_user_is_active_teacher())
    )
  );

drop policy if exists quiz_questions_public_or_teacher_read on app.quiz_questions;
create policy quiz_questions_public_or_teacher_read on app.quiz_questions
  for select
  using (
    exists (
      select 1
      from app.quiz_revisions qr
      join app.quizzes q on q.id = qr.quiz_id
      where qr.id = quiz_questions.quiz_revision_id
        and q.published_revision_id = qr.id
        and q.archived_at is null
        and qr.status = 'published'
        and (
          qr.usage_mode = 'practice'
          or (qr.usage_mode = 'assignment' and app.current_user_is_active_teacher())
        )
    )
  );

drop policy if exists quiz_choices_public_or_teacher_read on app.quiz_choices;
create policy quiz_choices_public_or_teacher_read on app.quiz_choices
  for select
  using (
    exists (
      select 1
      from app.quiz_questions qq
      join app.quiz_revisions qr on qr.id = qq.quiz_revision_id
      join app.quizzes q on q.id = qr.quiz_id
      where qq.id = quiz_choices.question_id
        and q.published_revision_id = qr.id
        and q.archived_at is null
        and qr.status = 'published'
        and (
          qr.usage_mode = 'practice'
          or (qr.usage_mode = 'assignment' and app.current_user_is_active_teacher())
        )
    )
  );

drop policy if exists attempt_questions_teacher_read_own on app.attempt_questions;
create policy attempt_questions_teacher_read_own on app.attempt_questions
  for select
  using (
    app.current_user_is_active_teacher()
    and exists (
      select 1
      from app.attempts att
      join app.assignments a on a.id = att.assignment_id
      join app.classes c on c.id = a.class_id
      where att.id = attempt_questions.attempt_id
        and c.teacher_id = auth.uid()
    )
  );

drop policy if exists attempt_answers_teacher_read_own on app.attempt_answers;
create policy attempt_answers_teacher_read_own on app.attempt_answers
  for select
  using (
    app.current_user_is_active_teacher()
    and exists (
      select 1
      from app.attempts att
      join app.assignments a on a.id = att.assignment_id
      join app.classes c on c.id = a.class_id
      where att.id = attempt_answers.attempt_id
        and c.teacher_id = auth.uid()
    )
  );

drop policy if exists attempt_annotations_teacher_insert_own on app.attempt_annotations;
create policy attempt_annotations_teacher_insert_own on app.attempt_annotations
  for insert
  with check (
    actor_id = auth.uid()
    and app.current_user_is_active_teacher()
    and exists (
      select 1
      from app.attempts att
      join app.assignments a on a.id = att.assignment_id
      join app.classes c on c.id = a.class_id
      where att.id = attempt_annotations.attempt_id
        and c.teacher_id = auth.uid()
    )
  );

drop policy if exists result_selections_teacher_own on app.result_selections;
create policy result_selections_teacher_own on app.result_selections
  for all
  using (
    app.current_user_is_active_teacher()
    and exists (
      select 1
      from app.assignments a
      join app.classes c on c.id = a.class_id
      where a.id = result_selections.assignment_id
        and c.teacher_id = auth.uid()
    )
  )
  with check (
    selected_by = auth.uid()
    and app.current_user_is_active_teacher()
    and exists (
      select 1
      from app.assignments a
      join app.classes c on c.id = a.class_id
      where a.id = result_selections.assignment_id
        and c.teacher_id = auth.uid()
    )
  );

-- 3. Fungsi RPC di schema api (SECURITY DEFINER, set search_path = '')

create or replace function api.start_guest_attempt(
  p_token_hash text default null,
  p_code_digest text default null,
  p_student_name text default null,
  p_session_token_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_name text := btrim(coalesce(p_student_name, ''));
  v_asg record;
  v_qr record;
  v_q_count integer;
  v_attempt_id uuid;
  v_expires_at timestamptz;
  v_purge_at timestamptz;
  v_questions jsonb;
begin
  if (p_token_hash is null and p_code_digest is null)
     or (p_token_hash is not null and p_code_digest is not null)
     or p_session_token_hash is null
     or char_length(v_name) < 1
     or char_length(v_name) > 80 then
    raise exception 'VALIDATION_FAILED';
  end if;

  select
    a.id,
    a.title,
    a.state,
    a.opens_at,
    a.closes_at,
    a.session_minutes,
    a.consent_readiness_at,
    a.quiz_revision_id,
    p.status as teacher_status
  into v_asg
  from private.assignment_access aa
  join app.assignments a on a.id = aa.assignment_id
  join app.classes c on c.id = a.class_id
  join app.profiles p on p.user_id = c.teacher_id
  where (p_token_hash is not null and aa.join_token_hash = p_token_hash)
     or (p_code_digest is not null and aa.join_code_digest = p_code_digest);

  if not found then
    raise exception 'RESOURCE_NOT_FOUND';
  end if;

  if v_asg.state <> 'open'
     or v_asg.teacher_status <> 'active'
     or v_now < v_asg.opens_at
     or v_now >= v_asg.closes_at then
    raise exception 'TASK_UNAVAILABLE';
  end if;

  if v_asg.consent_readiness_at is null then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  select qr.id, qr.instructions
  into v_qr
  from app.quiz_revisions qr
  where qr.id = v_asg.quiz_revision_id
    and qr.status = 'published';

  if not found then
    raise exception 'TASK_UNAVAILABLE';
  end if;

  select count(*) into v_q_count
  from app.quiz_questions qq
  where qq.quiz_revision_id = v_qr.id;

  if v_q_count < 1 then
    raise exception 'TASK_UNAVAILABLE';
  end if;

  v_expires_at := least(v_now + make_interval(mins => v_asg.session_minutes), v_asg.closes_at);
  v_purge_at := v_asg.closes_at + interval '90 days';

  insert into app.attempts (
    assignment_id,
    quiz_revision_id,
    student_name,
    state,
    answer_revision,
    started_at,
    expires_at,
    question_count,
    purge_at
  ) values (
    v_asg.id,
    v_qr.id,
    v_name,
    'in_progress',
    0,
    v_now,
    v_expires_at,
    v_q_count,
    v_purge_at
  )
  returning id into v_attempt_id;

  insert into app.attempt_questions (attempt_id, question_id, position, choice_order_json)
  select
    v_attempt_id,
    qq.id,
    qq.position,
    coalesce(
      (
        select jsonb_agg(qc.id order by qc.position)
        from app.quiz_choices qc
        where qc.question_id = qq.id
      ),
      '[]'::jsonb
    )
  from app.quiz_questions qq
  where qq.quiz_revision_id = v_qr.id
  order by qq.position;

  insert into private.guest_sessions (attempt_id, token_hash, issued_at, expires_at)
  values (v_attempt_id, p_session_token_hash, v_now, v_expires_at);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', qq.id,
        'position', aq.position,
        'prompt', coalesce(qq.prompt_json->>'text', qq.prompt_json#>>'{}'),
        'choices', (
          select coalesce(
            jsonb_agg(
              jsonb_build_object(
                'id', qc.id,
                'position', qc.position,
                'label', coalesce(qc.label_json->>'text', qc.label_json#>>'{}')
              )
              order by qc.position
            ),
            '[]'::jsonb
          )
          from app.quiz_choices qc
          where qc.question_id = qq.id
        )
      )
      order by aq.position
    ),
    '[]'::jsonb
  )
  into v_questions
  from app.attempt_questions aq
  join app.quiz_questions qq on qq.id = aq.question_id
  where aq.attempt_id = v_attempt_id;

  return jsonb_build_object(
    'attempt_id', v_attempt_id,
    'assignment_title', v_asg.title,
    'state', 'in_progress',
    'expires_at', v_expires_at,
    'answer_revision', 0,
    'instructions', v_qr.instructions,
    'questions', v_questions
  );
end;
$$;

create or replace function api.get_guest_attempt(p_session_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_sess record;
  v_att record;
  v_asg record;
  v_qr record;
  v_questions jsonb;
  v_answers jsonb;
begin
  select gs.id, gs.attempt_id, gs.expires_at, gs.revoked_at
  into v_sess
  from private.guest_sessions gs
  where gs.token_hash = p_session_token_hash;

  if not found or v_sess.revoked_at is not null or v_now > v_sess.expires_at then
    raise exception 'SESSION_EXPIRED';
  end if;

  select * into v_att from app.attempts att where att.id = v_sess.attempt_id;
  if not found then
    raise exception 'SESSION_EXPIRED';
  end if;

  select * into v_asg from app.assignments a where a.id = v_att.assignment_id;
  if not found or v_asg.state = 'revoked' then
    if found and v_asg.state = 'revoked' and v_att.state = 'in_progress' then
      update app.attempts set state = 'cancelled' where id = v_att.id;
    end if;
    raise exception 'TASK_UNAVAILABLE';
  end if;

  if v_att.state = 'in_progress' and v_now > v_att.expires_at then
    update app.attempts set state = 'expired' where id = v_att.id;
    v_att.state := 'expired';
  end if;

  select * into v_qr from app.quiz_revisions qr where qr.id = v_att.quiz_revision_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', qq.id,
        'position', aq.position,
        'prompt', coalesce(qq.prompt_json->>'text', qq.prompt_json#>>'{}'),
        'choices', (
          select coalesce(
            jsonb_agg(
              jsonb_build_object(
                'id', qc.id,
                'position', qc.position,
                'label', coalesce(qc.label_json->>'text', qc.label_json#>>'{}')
              )
              order by qc.position
            ),
            '[]'::jsonb
          )
          from app.quiz_choices qc
          where qc.question_id = qq.id
        )
      )
      order by aq.position
    ),
    '[]'::jsonb
  )
  into v_questions
  from app.attempt_questions aq
  join app.quiz_questions qq on qq.id = aq.question_id
  where aq.attempt_id = v_att.id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'question_id', aa.question_id,
        'selected_choice_id', aa.selected_choice_id
      )
    ),
    '[]'::jsonb
  )
  into v_answers
  from app.attempt_answers aa
  where aa.attempt_id = v_att.id;

  return jsonb_build_object(
    'attempt_id', v_att.id,
    'assignment_title', v_asg.title,
    'state', v_att.state,
    'answer_revision', v_att.answer_revision,
    'expires_at', v_att.expires_at,
    'instructions', coalesce(v_qr.instructions, ''),
    'questions', v_questions,
    'answers', v_answers
  );
end;
$$;

create or replace function api.autosave_guest_answers(
  p_session_token_hash text,
  p_expected_revision integer,
  p_answers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_sess record;
  v_att record;
  v_asg record;
  v_seen_count integer;
  v_distinct_count integer;
  v_ans jsonb;
  v_q_id uuid;
  v_c_id uuid;
  v_new_revision integer;
begin
  select gs.id, gs.attempt_id, gs.expires_at, gs.revoked_at
  into v_sess
  from private.guest_sessions gs
  where gs.token_hash = p_session_token_hash;

  if not found or v_sess.revoked_at is not null or v_now > v_sess.expires_at then
    raise exception 'SESSION_EXPIRED';
  end if;

  select * into v_att from app.attempts att where att.id = v_sess.attempt_id for update;
  if not found then
    raise exception 'SESSION_EXPIRED';
  end if;

  select * into v_asg from app.assignments a where a.id = v_att.assignment_id;
  if not found or v_asg.state = 'revoked' then
    raise exception 'TASK_UNAVAILABLE';
  end if;

  if v_att.state <> 'in_progress' then
    raise exception 'STATE_CONFLICT';
  end if;

  if v_now > v_att.expires_at then
    update app.attempts set state = 'expired' where id = v_att.id;
    raise exception 'ATTEMPT_EXPIRED';
  end if;

  if p_expected_revision <> v_att.answer_revision then
    raise exception 'REVISION_CONFLICT';
  end if;

  if jsonb_typeof(p_answers) <> 'array' then
    raise exception 'VALIDATION_FAILED';
  end if;

  select count(*), count(distinct (elem->>'question_id'))
  into v_seen_count, v_distinct_count
  from jsonb_array_elements(p_answers) elem;

  if v_seen_count <> v_distinct_count then
    raise exception 'VALIDATION_FAILED';
  end if;

  for v_ans in select * from jsonb_array_elements(p_answers)
  loop
    v_q_id := (v_ans->>'question_id')::uuid;
    v_c_id := nullif(v_ans->>'selected_choice_id', '')::uuid;

    if not exists (
      select 1 from app.attempt_questions aq
      where aq.attempt_id = v_att.id and aq.question_id = v_q_id
    ) then
      raise exception 'VALIDATION_FAILED';
    end if;

    if v_c_id is not null and not exists (
      select 1 from app.quiz_choices qc
      where qc.question_id = v_q_id and qc.id = v_c_id
    ) then
      raise exception 'VALIDATION_FAILED';
    end if;

    insert into app.attempt_answers (attempt_id, question_id, selected_choice_id, updated_at)
    values (v_att.id, v_q_id, v_c_id, v_now)
    on conflict (attempt_id, question_id) do update
      set selected_choice_id = excluded.selected_choice_id,
          updated_at = v_now;
  end loop;

  v_new_revision := v_att.answer_revision + 1;
  update app.attempts set answer_revision = v_new_revision where id = v_att.id;

  return jsonb_build_object(
    'attempt_id', v_att.id,
    'answer_revision', v_new_revision,
    'saved_at', v_now
  );
end;
$$;

create or replace function api.get_guest_result(p_session_token_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_sess record;
  v_att record;
  v_asg record;
  v_explanations_available boolean;
  v_explanations jsonb := '[]'::jsonb;
begin
  select gs.id, gs.attempt_id, gs.expires_at, gs.revoked_at
  into v_sess
  from private.guest_sessions gs
  where gs.token_hash = p_session_token_hash;

  if not found or v_sess.revoked_at is not null or v_now > v_sess.expires_at then
    raise exception 'SESSION_EXPIRED';
  end if;

  select * into v_att from app.attempts att where att.id = v_sess.attempt_id;
  if not found or v_att.state <> 'submitted' then
    raise exception 'STATE_CONFLICT';
  end if;

  select * into v_asg from app.assignments a where a.id = v_att.assignment_id;
  v_explanations_available := found and v_now >= v_asg.closes_at;

  if v_explanations_available then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'question_id', qq.id,
          'prompt', coalesce(qq.prompt_json->>'text', qq.prompt_json#>>'{}'),
          'is_correct', coalesce(aa.is_correct, false),
          'explanation', coalesce(qak.explanation_json->>'text', qak.explanation_json#>>'{}', '')
        )
        order by aq.position
      ),
      '[]'::jsonb
    )
    into v_explanations
    from app.attempt_questions aq
    join app.quiz_questions qq on qq.id = aq.question_id
    left join app.attempt_answers aa on aa.attempt_id = aq.attempt_id and aa.question_id = aq.question_id
    left join private.quiz_answer_keys qak on qak.question_id = aq.question_id
    where aq.attempt_id = v_att.id;
  end if;

  return jsonb_build_object(
    'attempt_id', v_att.id,
    'assignment_title', coalesce(v_asg.title, ''),
    'state', 'submitted',
    'submitted_at', v_att.submitted_at,
    'correct_count', coalesce(v_att.correct_count, 0),
    'question_count', v_att.question_count,
    'score', coalesce(v_att.score, 0),
    'receipt_code', coalesce(v_att.receipt_code, ''),
    'explanations_available', v_explanations_available,
    'explanations', v_explanations
  );
end;
$$;

create or replace function api.end_guest_session(p_session_token_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.guest_sessions
  set revoked_at = timezone('utc', now())
  where token_hash = p_session_token_hash
    and revoked_at is null;
  return true;
end;
$$;

create or replace function api.check_practice_quiz(
  p_quiz_id_or_slug text,
  p_answers jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_qr record;
  v_seen_count integer;
  v_distinct_count integer;
  v_total integer := 0;
  v_correct integer := 0;
  v_score numeric(5, 2);
  v_items jsonb := '[]'::jsonb;
  v_ans jsonb;
  v_q_id uuid;
  v_c_id uuid;
begin
  select q.id as quiz_id, qr.id as revision_id
  into v_qr
  from app.quizzes q
  join app.quiz_revisions qr on qr.id = q.published_revision_id
  where q.archived_at is null
    and qr.status = 'published'
    and qr.usage_mode = 'practice'
    and (q.slug = p_quiz_id_or_slug or q.id::text = p_quiz_id_or_slug);

  if not found then
    raise exception 'RESOURCE_NOT_FOUND';
  end if;

  if jsonb_typeof(p_answers) <> 'array' then
    raise exception 'VALIDATION_FAILED';
  end if;

  select count(*), count(distinct (elem->>'question_id'))
  into v_seen_count, v_distinct_count
  from jsonb_array_elements(p_answers) elem;

  if v_seen_count <> v_distinct_count then
    raise exception 'VALIDATION_FAILED';
  end if;

  for v_ans in select * from jsonb_array_elements(p_answers)
  loop
    v_q_id := (v_ans->>'question_id')::uuid;
    v_c_id := nullif(v_ans->>'selected_choice_id', '')::uuid;

    if not exists (
      select 1 from app.quiz_questions qq
      where qq.quiz_revision_id = v_qr.revision_id and qq.id = v_q_id
    ) then
      raise exception 'VALIDATION_FAILED';
    end if;

    if v_c_id is not null and not exists (
      select 1 from app.quiz_choices qc
      where qc.question_id = v_q_id and qc.id = v_c_id
    ) then
      raise exception 'VALIDATION_FAILED';
    end if;
  end loop;

  with parsed_answers as (
    select
      (elem->>'question_id')::uuid as question_id,
      nullif(elem->>'selected_choice_id', '')::uuid as selected_choice_id
    from jsonb_array_elements(p_answers) elem
  ),
  graded as (
    select
      qq.id as question_id,
      qq.position,
      pa.selected_choice_id,
      qak.correct_choice_id,
      (pa.selected_choice_id is not null and pa.selected_choice_id = qak.correct_choice_id) as is_correct,
      coalesce(qak.explanation_json->>'text', qak.explanation_json#>>'{}', '') as explanation
    from app.quiz_questions qq
    join private.quiz_answer_keys qak on qak.question_id = qq.id
    left join parsed_answers pa on pa.question_id = qq.id
    where qq.quiz_revision_id = v_qr.revision_id
    order by qq.position
  )
  select
    count(*),
    count(*) filter (where graded.is_correct),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'question_id', graded.question_id,
          'selected_choice_id', graded.selected_choice_id,
          'correct_choice_id', graded.correct_choice_id,
          'is_correct', graded.is_correct,
          'explanation', graded.explanation
        )
        order by graded.position
      ),
      '[]'::jsonb
    )
  into v_total, v_correct, v_items
  from graded;

  if v_total < 1 then
    raise exception 'TASK_UNAVAILABLE';
  end if;

  v_score := round((v_correct::numeric / v_total::numeric) * 100, 2);

  return jsonb_build_object(
    'quiz_id', v_qr.quiz_id,
    'revision_id', v_qr.revision_id,
    'correct_count', v_correct,
    'question_count', v_total,
    'score', v_score,
    'items', v_items
  );
end;
$$;

create or replace function api.open_or_rotate_assignment_access(
  p_teacher_id uuid,
  p_assignment_id uuid,
  p_mode text,
  p_join_token_hash text,
  p_join_code_digest text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_asg app.assignments%rowtype;
begin
  if not private.is_active_teacher(p_teacher_id) then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  select a.*
  into v_asg
  from app.assignments a
  join app.classes c on c.id = a.class_id
  where a.id = p_assignment_id
    and c.teacher_id = p_teacher_id
  for update;

  if not found then
    raise exception 'RESOURCE_NOT_FOUND';
  end if;

  if v_asg.state in ('revoked', 'archived') then
    raise exception 'STATE_CONFLICT';
  end if;

  if v_asg.consent_readiness_at is null then
    raise exception 'VALIDATION_FAILED';
  end if;

  if p_mode = 'rotate' and v_asg.state <> 'open' then
    raise exception 'STATE_CONFLICT';
  end if;

  insert into private.assignment_access (
    assignment_id, join_token_hash, join_code_digest, generation, rotated_at
  ) values (
    v_asg.id, p_join_token_hash, p_join_code_digest, 1, v_now
  )
  on conflict (assignment_id) do update
    set join_token_hash = excluded.join_token_hash,
        join_code_digest = excluded.join_code_digest,
        generation = private.assignment_access.generation + 1,
        rotated_at = v_now;

  update app.assignments
  set state = 'open'
  where id = v_asg.id
  returning * into v_asg;

  return to_jsonb(v_asg);
end;
$$;

create or replace function api.revoke_assignment_sessions(
  p_teacher_id uuid,
  p_assignment_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_asg app.assignments%rowtype;
begin
  if not private.is_active_teacher(p_teacher_id) then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  if char_length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'VALIDATION_FAILED';
  end if;

  select a.*
  into v_asg
  from app.assignments a
  join app.classes c on c.id = a.class_id
  where a.id = p_assignment_id
    and c.teacher_id = p_teacher_id
  for update;

  if not found then
    raise exception 'RESOURCE_NOT_FOUND';
  end if;

  update app.assignments
  set state = 'revoked'
  where id = v_asg.id
  returning * into v_asg;

  update app.attempts
  set state = 'cancelled'
  where assignment_id = v_asg.id
    and state = 'in_progress';

  update private.guest_sessions gs
  set revoked_at = v_now
  from app.attempts att
  where gs.attempt_id = att.id
    and att.assignment_id = v_asg.id
    and gs.revoked_at is null;

  insert into private.audit_logs (
    actor_type, actor_id, action, target_type, target_id, request_id, outcome, safe_metadata
  ) values (
    'teacher', p_teacher_id::text, 'revoke_assignment', 'assignment', v_asg.id::text, gen_random_uuid()::text, 'success',
    jsonb_build_object('reason_length', char_length(btrim(p_reason)))
  );

  return to_jsonb(v_asg);
end;
$$;

create or replace function api.annotate_teacher_attempt(
  p_teacher_id uuid,
  p_attempt_id uuid,
  p_kind text,
  p_reason text,
  p_corrected_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_att app.attempts%rowtype;
  v_ann app.attempt_annotations%rowtype;
  v_trimmed_name text := nullif(btrim(coalesce(p_corrected_name, '')), '');
begin
  if not private.is_active_teacher(p_teacher_id) then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  select att.*
  into v_att
  from app.attempts att
  join app.assignments a on a.id = att.assignment_id
  join app.classes c on c.id = a.class_id
  where att.id = p_attempt_id
    and c.teacher_id = p_teacher_id
  for update;

  if not found then
    raise exception 'RESOURCE_NOT_FOUND';
  end if;

  if p_kind = 'name_correction' then
    if v_trimmed_name is null or char_length(v_trimmed_name) > 80 then
      raise exception 'VALIDATION_FAILED';
    end if;
    update app.attempts
    set corrected_name = v_trimmed_name
    where id = v_att.id;
  end if;

  insert into app.attempt_annotations (attempt_id, actor_id, kind, reason)
  values (v_att.id, p_teacher_id, p_kind, btrim(p_reason))
  returning * into v_ann;

  return to_jsonb(v_ann);
end;
$$;

create or replace function api.create_export_job(
  p_teacher_id uuid,
  p_assignment_id uuid,
  p_object_path text,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_id uuid;
begin
  if not private.is_active_teacher(p_teacher_id) then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  if not exists (
    select 1
    from app.assignments a
    join app.classes c on c.id = a.class_id
    where a.id = p_assignment_id
      and c.teacher_id = p_teacher_id
  ) then
    raise exception 'RESOURCE_NOT_FOUND';
  end if;

  insert into private.export_jobs (
    requested_by, assignment_id, status, object_path, expires_at
  ) values (
    p_teacher_id, p_assignment_id, 'ready', p_object_path, p_expires_at
  )
  returning id into v_job_id;

  insert into private.audit_logs (
    actor_type, actor_id, action, target_type, target_id, request_id, outcome
  ) values (
    'teacher', p_teacher_id::text, 'create_export', 'assignment', p_assignment_id::text, gen_random_uuid()::text, 'success'
  );

  return v_job_id;
end;
$$;

create or replace function api.get_export_job_for_teacher(
  p_teacher_id uuid,
  p_export_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_job private.export_jobs%rowtype;
begin
  if not private.is_active_teacher(p_teacher_id) then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  select *
  into v_job
  from private.export_jobs ej
  where ej.id = p_export_id
    and ej.requested_by = p_teacher_id;

  if not found then
    raise exception 'RESOURCE_NOT_FOUND';
  end if;

  if v_now > v_job.expires_at then
    raise exception 'ATTEMPT_EXPIRED';
  end if;

  insert into private.audit_logs (
    actor_type, actor_id, action, target_type, target_id, request_id, outcome
  ) values (
    'teacher', p_teacher_id::text, 'download_export', 'export_job', v_job.id::text, gen_random_uuid()::text, 'success'
  );

  return to_jsonb(v_job);
end;
$$;

create or replace function api.run_retention_purge()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.run_retention_purge();
end;
$$;

create or replace function api.publish_content_revision(
  p_revision_id uuid,
  p_actor_id uuid,
  p_request_id text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.publish_content_revision(p_revision_id, p_actor_id, p_request_id);
end;
$$;

-- 4. Revoke default & grant EXECUTE secara eksplisit
revoke all on function api.resolve_guest_join(text, text) from public, anon, authenticated;
revoke all on function api.start_guest_attempt(text, text, text, text) from public, anon, authenticated;
revoke all on function api.get_guest_attempt(text) from public, anon, authenticated;
revoke all on function api.autosave_guest_answers(text, integer, jsonb) from public, anon, authenticated;
revoke all on function api.submit_guest_attempt(text, text, text, jsonb) from public, anon, authenticated;
revoke all on function api.get_guest_result(text) from public, anon, authenticated;
revoke all on function api.end_guest_session(text) from public, anon, authenticated;
revoke all on function api.check_practice_quiz(text, jsonb) from public, anon, authenticated;
revoke all on function api.open_or_rotate_assignment_access(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function api.revoke_assignment_sessions(uuid, uuid, text) from public, anon, authenticated;
revoke all on function api.annotate_teacher_attempt(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function api.create_export_job(uuid, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function api.get_export_job_for_teacher(uuid, uuid) from public, anon, authenticated;
revoke all on function api.run_retention_purge() from public, anon, authenticated;
revoke all on function api.publish_content_revision(uuid, uuid, text) from public, anon, authenticated;

grant execute on function api.resolve_guest_join(text, text) to guest_api, service_role;
grant execute on function api.start_guest_attempt(text, text, text, text) to guest_api, service_role;
grant execute on function api.get_guest_attempt(text) to guest_api, service_role;
grant execute on function api.autosave_guest_answers(text, integer, jsonb) to guest_api, service_role;
grant execute on function api.submit_guest_attempt(text, text, text, jsonb) to guest_api, service_role;
grant execute on function api.get_guest_result(text) to guest_api, service_role;
grant execute on function api.end_guest_session(text) to guest_api, service_role;

grant execute on function api.check_practice_quiz(text, jsonb) to service_role;
grant execute on function api.open_or_rotate_assignment_access(uuid, uuid, text, text, text) to service_role;
grant execute on function api.revoke_assignment_sessions(uuid, uuid, text) to service_role;
grant execute on function api.annotate_teacher_attempt(uuid, uuid, text, text, text) to service_role;
grant execute on function api.create_export_job(uuid, uuid, text, timestamptz) to service_role;
grant execute on function api.get_export_job_for_teacher(uuid, uuid) to service_role;
grant execute on function api.run_retention_purge() to service_role;
grant execute on function api.publish_content_revision(uuid, uuid, text) to service_role;
