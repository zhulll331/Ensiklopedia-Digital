-- 0016_admin_quiz_rpcs.sql
-- Migrasi Fase 5: RPC Bank Kuis Admin (CRUD draf transaksional, kunci jawaban privat SEC-08,
-- validasi kurator, transisi status, dan publikasi atomik paritas gate).

-- 1. Baca kunci jawaban & pembahasan hanya untuk admin aktif (SEC-08)
create or replace function api.get_admin_quiz_answer_keys(
  p_actor_id uuid,
  p_revision_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not private.is_active_admin(p_actor_id) then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  if not exists (
    select 1 from app.quiz_revisions qr where qr.id = p_revision_id
  ) then
    raise exception 'RESOURCE_NOT_FOUND';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'question_id', qq.id,
        'correct_choice_id', qak.correct_choice_id,
        'explanation', coalesce(qak.explanation_json->>'text', qak.explanation_json#>>'{}', '')
      )
      order by qq.position asc
    ),
    '[]'::jsonb
  )
  into v_result
  from app.quiz_questions qq
  left join private.quiz_answer_keys qak on qak.question_id = qq.id
  where qq.quiz_revision_id = p_revision_id;

  return v_result;
end;
$$;

revoke all on function api.get_admin_quiz_answer_keys(uuid, uuid) from public, anon, authenticated;
grant execute on function api.get_admin_quiz_answer_keys(uuid, uuid) to service_role;

-- 2. Buat entitas kuis baru beserta revisi draf v1
create or replace function api.create_quiz_with_draft(
  p_actor_id uuid,
  p_slug text,
  p_title text,
  p_grade smallint,
  p_usage_mode text,
  p_instructions text default '',
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_title text := btrim(coalesce(p_title, ''));
  v_instructions text := btrim(coalesce(p_instructions, ''));
  v_quiz_id uuid;
  v_revision_id uuid;
begin
  if not private.is_active_admin(p_actor_id) then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  if v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or char_length(v_slug) < 2 or char_length(v_slug) > 120 then
    raise exception 'VALIDATION_FAILED:INVALID_SLUG';
  end if;

  if char_length(v_title) < 2 or char_length(v_title) > 160 then
    raise exception 'VALIDATION_FAILED:INVALID_TITLE';
  end if;

  if p_grade not in (3, 4) then
    raise exception 'VALIDATION_FAILED:INVALID_GRADE';
  end if;

  if p_usage_mode not in ('practice', 'assignment') then
    raise exception 'VALIDATION_FAILED:INVALID_USAGE_MODE';
  end if;

  if char_length(v_instructions) > 1000 then
    raise exception 'VALIDATION_FAILED:INVALID_INSTRUCTIONS';
  end if;

  if exists (select 1 from app.quizzes q where q.slug = v_slug) then
    raise exception 'VALIDATION_FAILED:SLUG_EXISTS';
  end if;

  insert into app.quizzes (slug)
  values (v_slug)
  returning id into v_quiz_id;

  insert into app.quiz_revisions (
    quiz_id,
    version_no,
    title,
    grade,
    usage_mode,
    instructions,
    status
  )
  values (
    v_quiz_id,
    1,
    v_title,
    p_grade,
    p_usage_mode,
    v_instructions,
    'draft'
  )
  returning id into v_revision_id;

  perform private.write_audit(
    'admin',
    p_actor_id::text,
    'create_quiz',
    'quiz_revision',
    v_revision_id::text,
    p_request_id,
    'success',
    jsonb_build_object(
      'quiz_id', v_quiz_id,
      'slug', v_slug,
      'grade', p_grade,
      'usage_mode', p_usage_mode,
      'version_no', 1
    )
  );

  return jsonb_build_object(
    'quiz_id', v_quiz_id,
    'revision_id', v_revision_id,
    'version_no', 1,
    'slug', v_slug
  );
end;
$$;

revoke all on function api.create_quiz_with_draft(uuid, text, text, smallint, text, text, text) from public, anon, authenticated;
grant execute on function api.create_quiz_with_draft(uuid, text, text, smallint, text, text, text) to service_role;

-- 3. Salin revisi kuis menjadi revisi draf baru v+1 (ADR-05)
create or replace function api.create_new_quiz_revision(
  p_actor_id uuid,
  p_quiz_id uuid,
  p_source_revision_id uuid default null,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_src_rev app.quiz_revisions%rowtype;
  v_next_version integer;
  v_new_revision_id uuid;
  v_q app.quiz_questions%rowtype;
  v_c app.quiz_choices%rowtype;
  v_new_q_id uuid;
  v_new_c_id uuid;
  v_old_correct_choice_id uuid;
  v_old_explanation jsonb;
  v_new_correct_choice_id uuid;
begin
  if not private.is_active_admin(p_actor_id) then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  if not exists (
    select 1 from app.quizzes q where q.id = p_quiz_id for update
  ) then
    raise exception 'RESOURCE_NOT_FOUND';
  end if;

  if p_source_revision_id is not null then
    select *
    into v_src_rev
    from app.quiz_revisions qr
    where qr.id = p_source_revision_id
      and qr.quiz_id = p_quiz_id;
  else
    select *
    into v_src_rev
    from app.quiz_revisions qr
    where qr.quiz_id = p_quiz_id
    order by qr.version_no desc
    limit 1;
  end if;

  if v_src_rev.id is null then
    raise exception 'RESOURCE_NOT_FOUND';
  end if;

  select coalesce(max(qr.version_no), 0) + 1
  into v_next_version
  from app.quiz_revisions qr
  where qr.quiz_id = p_quiz_id;

  insert into app.quiz_revisions (
    quiz_id,
    version_no,
    title,
    grade,
    usage_mode,
    instructions,
    status
  )
  values (
    p_quiz_id,
    v_next_version,
    v_src_rev.title,
    v_src_rev.grade,
    v_src_rev.usage_mode,
    v_src_rev.instructions,
    'draft'
  )
  returning id into v_new_revision_id;

  for v_q in
    select *
    from app.quiz_questions qq
    where qq.quiz_revision_id = v_src_rev.id
    order by qq.position asc
  loop
    insert into app.quiz_questions (
      quiz_revision_id,
      position,
      prompt_json,
      media_asset_id
    )
    values (
      v_new_revision_id,
      v_q.position,
      v_q.prompt_json,
      v_q.media_asset_id
    )
    returning id into v_new_q_id;

    v_old_correct_choice_id := null;
    v_old_explanation := '{}'::jsonb;
    select qak.correct_choice_id, qak.explanation_json
    into v_old_correct_choice_id, v_old_explanation
    from private.quiz_answer_keys qak
    where qak.question_id = v_q.id;

    v_new_correct_choice_id := null;
    for v_c in
      select *
      from app.quiz_choices qc
      where qc.question_id = v_q.id
      order by qc.position asc
    loop
      insert into app.quiz_choices (question_id, position, label_json)
      values (v_new_q_id, v_c.position, v_c.label_json)
      returning id into v_new_c_id;

      if v_old_correct_choice_id is not null and v_c.id = v_old_correct_choice_id then
        v_new_correct_choice_id := v_new_c_id;
      end if;
    end loop;

    if v_new_correct_choice_id is not null then
      insert into private.quiz_answer_keys (
        question_id,
        correct_choice_id,
        explanation_json
      )
      values (
        v_new_q_id,
        v_new_correct_choice_id,
        coalesce(v_old_explanation, '{}'::jsonb)
      );
    end if;

    insert into app.question_sources (question_id, source_id, locator)
    select v_new_q_id, qs.source_id, qs.locator
    from app.question_sources qs
    where qs.question_id = v_q.id;
  end loop;

  perform private.write_audit(
    'admin',
    p_actor_id::text,
    'create_quiz_revision',
    'quiz_revision',
    v_new_revision_id::text,
    p_request_id,
    'success',
    jsonb_build_object(
      'quiz_id', p_quiz_id,
      'source_revision_id', v_src_rev.id,
      'version_no', v_next_version
    )
  );

  return jsonb_build_object(
    'quiz_id', p_quiz_id,
    'revision_id', v_new_revision_id,
    'version_no', v_next_version
  );
end;
$$;

revoke all on function api.create_new_quiz_revision(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function api.create_new_quiz_revision(uuid, uuid, uuid, text) to service_role;

-- 4. Simpan draf metadata, soal, pilihan, sumber, dan kunci jawaban privat secara atomik
create or replace function api.upsert_quiz_revision_draft(
  p_actor_id uuid,
  p_revision_id uuid,
  p_title text,
  p_grade smallint,
  p_usage_mode text,
  p_instructions text,
  p_questions jsonb,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rev app.quiz_revisions%rowtype;
  v_title text := btrim(coalesce(p_title, ''));
  v_instructions text := btrim(coalesce(p_instructions, ''));
  v_q_count integer;
  v_q_idx integer;
  v_q_item jsonb;
  v_prompt text;
  v_explanation text;
  v_media_raw text;
  v_media_id uuid;
  v_choices jsonb;
  v_choice_count integer;
  v_correct_pos integer;
  v_c_idx integer;
  v_c_item jsonb;
  v_c_label text;
  v_new_q_id uuid;
  v_new_c_id uuid;
  v_correct_choice_id uuid;
  v_sources jsonb;
  v_s_item jsonb;
  v_source_raw text;
  v_source_id uuid;
  v_locator text;
begin
  if not private.is_active_admin(p_actor_id) then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  select *
  into v_rev
  from app.quiz_revisions qr
  where qr.id = p_revision_id
  for update;

  if not found then
    raise exception 'RESOURCE_NOT_FOUND';
  end if;

  if v_rev.status <> 'draft' then
    raise exception 'STATE_CONFLICT:IMMUTABLE';
  end if;

  if exists (
    select 1 from app.assignments a where a.quiz_revision_id = p_revision_id
  ) then
    raise exception 'STATE_CONFLICT:LOCKED_BY_ASSIGNMENT';
  end if;

  if char_length(v_title) < 2 or char_length(v_title) > 160 then
    raise exception 'VALIDATION_FAILED:INVALID_TITLE';
  end if;

  if p_grade not in (3, 4) then
    raise exception 'VALIDATION_FAILED:INVALID_GRADE';
  end if;

  if p_usage_mode not in ('practice', 'assignment') then
    raise exception 'VALIDATION_FAILED:INVALID_USAGE_MODE';
  end if;

  if char_length(v_instructions) > 1000 then
    raise exception 'VALIDATION_FAILED:INVALID_INSTRUCTIONS';
  end if;

  if p_questions is null or pg_catalog.jsonb_typeof(p_questions) <> 'array' then
    raise exception 'VALIDATION_FAILED:INVALID_QUESTIONS';
  end if;

  v_q_count := pg_catalog.jsonb_array_length(p_questions);
  if v_q_count > 50 then
    raise exception 'VALIDATION_FAILED:TOO_MANY_QUESTIONS';
  end if;

  -- Hapus isi lama secara berurutan agar tidak terhalang FK ON DELETE RESTRICT di private.quiz_answer_keys
  delete from private.quiz_answer_keys
  where question_id in (
    select qq.id from app.quiz_questions qq where qq.quiz_revision_id = p_revision_id
  );

  delete from app.question_sources
  where question_id in (
    select qq.id from app.quiz_questions qq where qq.quiz_revision_id = p_revision_id
  );

  delete from app.quiz_choices
  where question_id in (
    select qq.id from app.quiz_questions qq where qq.quiz_revision_id = p_revision_id
  );

  delete from app.quiz_questions
  where quiz_revision_id = p_revision_id;

  update app.quiz_revisions
  set title = v_title,
      grade = p_grade,
      usage_mode = p_usage_mode,
      instructions = v_instructions
  where id = p_revision_id;

  if v_q_count > 0 then
    for v_q_idx in 0 .. (v_q_count - 1) loop
      v_q_item := p_questions->v_q_idx;
      v_prompt := btrim(coalesce(v_q_item->>'prompt', ''));
      if char_length(v_prompt) < 3 or char_length(v_prompt) > 1000 then
        raise exception 'VALIDATION_FAILED:INVALID_QUESTION_PROMPT';
      end if;

      v_explanation := btrim(coalesce(v_q_item->>'explanation', ''));
      if char_length(v_explanation) > 1000 then
        raise exception 'VALIDATION_FAILED:INVALID_EXPLANATION';
      end if;

      v_media_raw := nullif(btrim(coalesce(v_q_item->>'media_asset_id', '')), '');
      if v_media_raw is not null then
        if v_media_raw !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          raise exception 'VALIDATION_FAILED:INVALID_MEDIA';
        end if;
        v_media_id := v_media_raw::uuid;
        if not exists (select 1 from app.media_assets ma where ma.id = v_media_id) then
          raise exception 'VALIDATION_FAILED:INVALID_MEDIA';
        end if;
      else
        v_media_id := null;
      end if;

      v_choices := v_q_item->'choices';
      if v_choices is null or pg_catalog.jsonb_typeof(v_choices) <> 'array' then
        raise exception 'VALIDATION_FAILED:INVALID_CHOICES_COUNT';
      end if;

      v_choice_count := pg_catalog.jsonb_array_length(v_choices);
      if v_choice_count < 2 or v_choice_count > 4 then
        raise exception 'VALIDATION_FAILED:INVALID_CHOICES_COUNT';
      end if;

      if coalesce(v_q_item->>'correct_choice_position', '') !~ '^[1-4]$' then
        raise exception 'VALIDATION_FAILED:ANSWER_KEY_REQUIRED';
      end if;
      v_correct_pos := (v_q_item->>'correct_choice_position')::integer;
      if v_correct_pos < 1 or v_correct_pos > v_choice_count then
        raise exception 'VALIDATION_FAILED:ANSWER_KEY_REQUIRED';
      end if;

      insert into app.quiz_questions (
        quiz_revision_id,
        position,
        prompt_json,
        media_asset_id
      )
      values (
        p_revision_id,
        v_q_idx + 1,
        jsonb_build_object('text', v_prompt),
        v_media_id
      )
      returning id into v_new_q_id;

      v_correct_choice_id := null;
      for v_c_idx in 0 .. (v_choice_count - 1) loop
        v_c_item := v_choices->v_c_idx;
        v_c_label := btrim(coalesce(v_c_item->>'label', ''));
        if char_length(v_c_label) < 1 or char_length(v_c_label) > 300 then
          raise exception 'VALIDATION_FAILED:INVALID_CHOICE_LABEL';
        end if;

        insert into app.quiz_choices (question_id, position, label_json)
        values (
          v_new_q_id,
          (v_c_idx + 1)::smallint,
          jsonb_build_object('text', v_c_label)
        )
        returning id into v_new_c_id;

        if (v_c_idx + 1) = v_correct_pos then
          v_correct_choice_id := v_new_c_id;
        end if;
      end loop;

      if v_correct_choice_id is null then
        raise exception 'VALIDATION_FAILED:ANSWER_KEY_REQUIRED';
      end if;

      insert into private.quiz_answer_keys (
        question_id,
        correct_choice_id,
        explanation_json
      )
      values (
        v_new_q_id,
        v_correct_choice_id,
        jsonb_build_object('text', v_explanation)
      );

      v_sources := v_q_item->'sources';
      if v_sources is not null and pg_catalog.jsonb_typeof(v_sources) = 'array' then
        for v_s_item in select * from pg_catalog.jsonb_array_elements(v_sources) loop
          v_source_raw := nullif(btrim(coalesce(v_s_item->>'source_id', '')), '');
          if v_source_raw is not null then
            if v_source_raw !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
              raise exception 'VALIDATION_FAILED:INVALID_SOURCE_ID';
            end if;
            v_source_id := v_source_raw::uuid;
            if not exists (select 1 from app.source_references sr where sr.id = v_source_id) then
              raise exception 'VALIDATION_FAILED:INVALID_SOURCE_ID';
            end if;
            v_locator := btrim(coalesce(v_s_item->>'locator', ''));
            insert into app.question_sources (question_id, source_id, locator)
            values (v_new_q_id, v_source_id, left(v_locator, 120))
            on conflict do nothing;
          end if;
        end loop;
      end if;
    end loop;
  end if;

  perform private.write_audit(
    'admin',
    p_actor_id::text,
    'upsert_quiz_revision_draft',
    'quiz_revision',
    p_revision_id::text,
    p_request_id,
    'success',
    jsonb_build_object(
      'quiz_id', v_rev.quiz_id,
      'grade', p_grade,
      'usage_mode', p_usage_mode,
      'question_count', v_q_count
    )
  );

  return jsonb_build_object(
    'revision_id', p_revision_id,
    'question_count', v_q_count
  );
end;
$$;

revoke all on function api.upsert_quiz_revision_draft(uuid, uuid, text, smallint, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function api.upsert_quiz_revision_draft(uuid, uuid, text, smallint, text, text, jsonb, text) to service_role;

-- 5. Catat validasi bahasa / materi / media pada revisi kuis
create or replace function api.add_quiz_revision_review(
  p_actor_id uuid,
  p_revision_id uuid,
  p_review_type text,
  p_reviewer_label text,
  p_decision text,
  p_evidence_asset_id uuid default null,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quiz_id uuid;
  v_status text;
  v_reviewer text := btrim(coalesce(p_reviewer_label, ''));
  v_review app.quiz_review_records%rowtype;
begin
  if not private.is_active_admin(p_actor_id) then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  select qr.quiz_id, qr.status
  into v_quiz_id, v_status
  from app.quiz_revisions qr
  where qr.id = p_revision_id
  for update;

  if not found then
    raise exception 'RESOURCE_NOT_FOUND';
  end if;

  if v_status in ('published', 'archived') then
    raise exception 'STATE_CONFLICT:IMMUTABLE';
  end if;

  if p_review_type not in ('language', 'material', 'media') then
    raise exception 'VALIDATION_FAILED:INVALID_REVIEW_TYPE';
  end if;

  if p_decision not in ('approved', 'changes_requested', 'rejected') then
    raise exception 'VALIDATION_FAILED:INVALID_DECISION';
  end if;

  if char_length(v_reviewer) < 2 or char_length(v_reviewer) > 120 then
    raise exception 'VALIDATION_FAILED:INVALID_REVIEWER';
  end if;

  if p_evidence_asset_id is not null and not exists (
    select 1 from app.media_assets ma where ma.id = p_evidence_asset_id
  ) then
    raise exception 'VALIDATION_FAILED:INVALID_MEDIA';
  end if;

  insert into app.quiz_review_records (
    quiz_revision_id,
    review_type,
    decision,
    reviewer_label,
    evidence_asset_id
  )
  values (
    p_revision_id,
    p_review_type,
    p_decision,
    v_reviewer,
    p_evidence_asset_id
  )
  returning * into v_review;

  perform private.write_audit(
    'admin',
    p_actor_id::text,
    'add_quiz_revision_review',
    'quiz_revision',
    p_revision_id::text,
    p_request_id,
    'success',
    jsonb_build_object(
      'quiz_id', v_quiz_id,
      'review_id', v_review.id,
      'review_type', v_review.review_type,
      'decision', v_review.decision
    )
  );

  return jsonb_build_object(
    'id', v_review.id,
    'quiz_revision_id', v_review.quiz_revision_id,
    'review_type', v_review.review_type,
    'decision', v_review.decision,
    'reviewer_label', v_review.reviewer_label,
    'evidence_asset_id', v_review.evidence_asset_id,
    'reviewed_at', v_review.reviewed_at
  );
end;
$$;

revoke all on function api.add_quiz_revision_review(uuid, uuid, text, text, text, uuid, text) from public, anon, authenticated;
grant execute on function api.add_quiz_revision_review(uuid, uuid, text, text, text, uuid, text) to service_role;

-- 6. Transisi status revisi kuis terkendali (non-publish)
create or replace function api.transition_quiz_revision(
  p_actor_id uuid,
  p_revision_id uuid,
  p_expected_status text,
  p_next_status text,
  p_reason text default null,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quiz_id uuid;
  v_status text;
  v_published_rev_id uuid;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_needs_reason boolean := false;
  v_unpublished_live boolean := false;
begin
  if not private.is_active_admin(p_actor_id) then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  select qr.quiz_id, qr.status, q.published_revision_id
  into v_quiz_id, v_status, v_published_rev_id
  from app.quiz_revisions qr
  join app.quizzes q on q.id = qr.quiz_id
  where qr.id = p_revision_id
  for update;

  if not found then
    raise exception 'RESOURCE_NOT_FOUND';
  end if;

  if v_status <> p_expected_status then
    raise exception 'STATE_CONFLICT:STATUS_MISMATCH';
  end if;

  if p_next_status = 'published' then
    raise exception 'STATE_CONFLICT:USE_PUBLISH_ENDPOINT';
  end if;

  if not (
    (v_status = 'draft' and p_next_status in ('in_review', 'archived'))
    or (v_status = 'in_review' and p_next_status in ('draft', 'approved'))
    or (v_status = 'approved' and p_next_status in ('draft', 'archived'))
    or (v_status = 'published' and p_next_status = 'archived')
  ) then
    raise exception 'STATE_CONFLICT:INVALID_TRANSITION';
  end if;

  v_needs_reason := (
    p_next_status = 'archived'
    or (p_next_status = 'draft' and v_status in ('in_review', 'approved'))
  );

  if v_needs_reason and char_length(v_reason) < 5 then
    raise exception 'VALIDATION_FAILED:REASON_REQUIRED';
  end if;

  update app.quiz_revisions
  set status = p_next_status,
      validated_by = case
        when p_next_status = 'approved' then p_actor_id
        else validated_by
      end
  where id = p_revision_id;

  if p_next_status = 'archived' and v_published_rev_id = p_revision_id then
    update app.quizzes
    set published_revision_id = null,
        archived_at = timezone('utc', now())
    where id = v_quiz_id;
    v_unpublished_live := true;
  end if;

  perform private.write_audit(
    'admin',
    p_actor_id::text,
    'transition_quiz_revision',
    'quiz_revision',
    p_revision_id::text,
    p_request_id,
    'success',
    jsonb_build_object(
      'quiz_id', v_quiz_id,
      'from_status', v_status,
      'to_status', p_next_status,
      'reason', left(v_reason, 300),
      'unpublished_live', v_unpublished_live
    )
  );

  return jsonb_build_object(
    'revision_id', p_revision_id,
    'quiz_id', v_quiz_id,
    'from_status', v_status,
    'to_status', p_next_status,
    'unpublished_live', v_unpublished_live
  );
end;
$$;

revoke all on function api.transition_quiz_revision(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function api.transition_quiz_revision(uuid, uuid, text, text, text, text) to service_role;

-- 7. Publikasi atomik revisi kuis (gate paritas dengan TypeScript + pindah pointer)
create or replace function api.publish_quiz_revision(
  p_actor_id uuid,
  p_revision_id uuid,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rev app.quiz_revisions%rowtype;
  v_quiz_slug text;
  v_question_count integer;
  v_has_lang_ok boolean;
  v_has_material_ok boolean;
  v_has_media boolean;
  v_has_media_ok boolean;
  v_has_uncleared_media boolean;
begin
  if not private.is_active_admin(p_actor_id) then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  select qr.*
  into v_rev
  from app.quiz_revisions qr
  where qr.id = p_revision_id
  for update;

  if not found then
    raise exception 'RESOURCE_NOT_FOUND';
  end if;

  select q.slug
  into v_quiz_slug
  from app.quizzes q
  where q.id = v_rev.quiz_id
  for update;

  if v_rev.status <> 'approved' then
    raise exception 'STATE_CONFLICT:REQUIRES_APPROVED';
  end if;

  select count(*)
  into v_question_count
  from app.quiz_questions qq
  where qq.quiz_revision_id = p_revision_id;

  if v_question_count < 1 then
    raise exception 'VALIDATION_FAILED:QUESTIONS_REQUIRED';
  end if;

  if v_question_count > 50 then
    raise exception 'VALIDATION_FAILED:TOO_MANY_QUESTIONS';
  end if;

  if exists (
    select 1
    from app.quiz_questions qq
    where qq.quiz_revision_id = p_revision_id
      and (
        select count(*)
        from app.quiz_choices qc
        where qc.question_id = qq.id
      ) not between 2 and 4
  ) then
    raise exception 'VALIDATION_FAILED:INVALID_CHOICES_COUNT';
  end if;

  if exists (
    select 1
    from app.quiz_questions qq
    where qq.quiz_revision_id = p_revision_id
      and not exists (
        select 1
        from private.quiz_answer_keys qak
        join app.quiz_choices qc
          on qc.id = qak.correct_choice_id
         and qc.question_id = qq.id
        where qak.question_id = qq.id
      )
  ) then
    raise exception 'VALIDATION_FAILED:ANSWER_KEY_REQUIRED';
  end if;

  select exists (
    select 1
    from app.quiz_review_records qrr
    where qrr.quiz_revision_id = p_revision_id
      and qrr.review_type = 'language'
      and qrr.decision = 'approved'
  ) into v_has_lang_ok;

  select exists (
    select 1
    from app.quiz_review_records qrr
    where qrr.quiz_revision_id = p_revision_id
      and qrr.review_type = 'material'
      and qrr.decision = 'approved'
  ) into v_has_material_ok;

  if not (v_has_lang_ok and v_has_material_ok) then
    raise exception 'VALIDATION_FAILED:REVIEWS_REQUIRED';
  end if;

  select exists (
    select 1
    from app.quiz_questions qq
    where qq.quiz_revision_id = p_revision_id
      and qq.media_asset_id is not null
  ) into v_has_media;

  if v_has_media then
    select exists (
      select 1
      from app.quiz_questions qq
      join app.media_assets ma on ma.id = qq.media_asset_id
      where qq.quiz_revision_id = p_revision_id
        and qq.media_asset_id is not null
        and (ma.scan_status <> 'cleared' or ma.metadata_scrubbed_at is null)
    ) into v_has_uncleared_media;

    if v_has_uncleared_media then
      raise exception 'VALIDATION_FAILED:MEDIA_NOT_CLEARED';
    end if;

    select exists (
      select 1
      from app.quiz_review_records qrr
      where qrr.quiz_revision_id = p_revision_id
        and qrr.review_type = 'media'
        and qrr.decision = 'approved'
    ) into v_has_media_ok;

    if not v_has_media_ok then
      raise exception 'VALIDATION_FAILED:MEDIA_REVIEW_REQUIRED';
    end if;
  end if;

  update app.quiz_revisions
  set status = 'published',
      published_at = timezone('utc', now()),
      validated_by = coalesce(validated_by, p_actor_id)
  where id = p_revision_id;

  update app.quizzes
  set published_revision_id = p_revision_id,
      archived_at = null
  where id = v_rev.quiz_id;

  perform private.write_audit(
    'admin',
    p_actor_id::text,
    'publish_quiz_revision',
    'quiz_revision',
    p_revision_id::text,
    p_request_id,
    'success',
    jsonb_build_object(
      'quiz_id', v_rev.quiz_id,
      'slug', v_quiz_slug,
      'version_no', v_rev.version_no,
      'grade', v_rev.grade,
      'usage_mode', v_rev.usage_mode,
      'question_count', v_question_count
    )
  );

  return jsonb_build_object(
    'revision_id', p_revision_id,
    'quiz_id', v_rev.quiz_id,
    'slug', v_quiz_slug,
    'version_no', v_rev.version_no
  );
end;
$$;

revoke all on function api.publish_quiz_revision(uuid, uuid, text) from public, anon, authenticated;
grant execute on function api.publish_quiz_revision(uuid, uuid, text) to service_role;
