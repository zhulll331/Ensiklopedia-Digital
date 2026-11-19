-- 0007_guest_rpc_and_api_functions.sql
-- Fungsi RPC terisolasi di schema api untuk koneksi role guest_api (tanpa akses langsung ke tabel).

create or replace function api.resolve_guest_join(
  p_token_hash text default null,
  p_code_digest text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_rec record;
begin
  if (p_token_hash is null and p_code_digest is null)
     or (p_token_hash is not null and p_code_digest is not null) then
    raise exception 'INVALID_REQUEST';
  end if;

  select
    a.id as assignment_id,
    a.title as assignment_title,
    a.state,
    a.opens_at,
    a.closes_at,
    a.consent_readiness_at,
    a.consent_policy_version,
    c.label as class_label,
    c.grade,
    p.display_name as teacher_display_name,
    p.status as teacher_status
  into v_rec
  from private.assignment_access aa
  join app.assignments a on a.id = aa.assignment_id
  join app.classes c on c.id = a.class_id
  join app.profiles p on p.user_id = c.teacher_id
  where (p_token_hash is not null and aa.join_token_hash = p_token_hash)
     or (p_code_digest is not null and aa.join_code_digest = p_code_digest);

  if not found then
    raise exception 'RESOURCE_NOT_FOUND';
  end if;

  if v_rec.state <> 'open'
     or v_rec.teacher_status <> 'active'
     or v_now < v_rec.opens_at
     or v_now >= v_rec.closes_at then
    raise exception 'TASK_UNAVAILABLE';
  end if;

  if v_rec.consent_readiness_at is null then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  return jsonb_build_object(
    'assignment_id', v_rec.assignment_id,
    'assignment_title', v_rec.assignment_title,
    'class_label', v_rec.class_label,
    'grade', v_rec.grade,
    'teacher_display_name', v_rec.teacher_display_name,
    'can_start', true,
    'privacy_notice_version', v_rec.consent_policy_version
  );
end;
$$;

create or replace function api.submit_guest_attempt(
  p_session_token_hash text,
  p_idempotency_key_digest text,
  p_request_hash text,
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
  v_idem record;
  v_scope text;
  v_total integer := 0;
  v_correct integer := 0;
  v_score numeric(5, 2);
  v_receipt_code text;
  v_receipt jsonb;
  v_ans jsonb;
  v_q_id uuid;
  v_c_id uuid;
  v_expected_choice uuid;
  v_seen_count integer;
begin
  select gs.id, gs.attempt_id, gs.expires_at, gs.revoked_at
  into v_sess
  from private.guest_sessions gs
  where gs.token_hash = p_session_token_hash;

  if not found or v_sess.revoked_at is not null or v_now > v_sess.expires_at then
    raise exception 'SESSION_EXPIRED';
  end if;

  select *
  into v_att
  from app.attempts att
  where att.id = v_sess.attempt_id
  for update;

  if not found then
    raise exception 'SESSION_EXPIRED';
  end if;

  select *
  into v_asg
  from app.assignments a
  where a.id = v_att.assignment_id;

  if not found or v_asg.state = 'revoked' then
    raise exception 'TASK_UNAVAILABLE';
  end if;

  v_scope := v_att.id::text || ':submit';

  select *
  into v_idem
  from private.idempotency_records ir
  where ir.scope = v_scope
    and ir.key_digest = p_idempotency_key_digest;

  if found then
    if v_idem.request_hash <> p_request_hash then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return v_idem.response_json || jsonb_build_object('explanations_available', v_now >= v_asg.closes_at);
  end if;

  if v_att.state = 'submitted' then
    return jsonb_build_object(
      'attempt_id', v_att.id,
      'state', 'submitted',
      'submitted_at', v_att.submitted_at,
      'correct_count', v_att.correct_count,
      'question_count', v_att.question_count,
      'score', v_att.score,
      'explanations_available', v_now >= v_asg.closes_at,
      'receipt_code', v_att.receipt_code
    );
  end if;

  if v_att.state <> 'in_progress' or v_now > v_att.expires_at then
    raise exception 'ATTEMPT_EXPIRED';
  end if;

  if jsonb_typeof(p_answers) <> 'array' then
    raise exception 'VALIDATION_FAILED';
  end if;

  -- Tolak duplikasi question_id
  select count(*), count(distinct (elem->>'question_id'))
  into v_seen_count, v_total
  from jsonb_array_elements(p_answers) elem;

  if v_seen_count <> v_total then
    raise exception 'VALIDATION_FAILED';
  end if;

  -- Validasi & nilai setiap jawaban terhadap kunci di schema private
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

    select qak.correct_choice_id
    into v_expected_choice
    from private.quiz_answer_keys qak
    where qak.question_id = v_q_id;

    insert into app.attempt_answers (attempt_id, question_id, selected_choice_id, is_correct, updated_at)
    values (v_att.id, v_q_id, v_c_id, (v_c_id is not null and v_c_id = v_expected_choice), v_now)
    on conflict (attempt_id, question_id) do update
      set selected_choice_id = excluded.selected_choice_id,
          is_correct = excluded.is_correct,
          updated_at = v_now;
  end loop;

  select count(*) into v_total from app.attempt_questions aq where aq.attempt_id = v_att.id;
  select count(*) into v_correct from app.attempt_answers aa where aa.attempt_id = v_att.id and aa.is_correct = true;

  v_score := round((v_correct::numeric / greatest(1, v_total)::numeric) * 100, 2);
  v_receipt_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  update app.attempts
  set state = 'submitted',
      submitted_at = v_now,
      correct_count = v_correct,
      question_count = v_total,
      score = v_score,
      receipt_code = v_receipt_code
  where id = v_att.id;

  update private.guest_sessions
  set expires_at = v_now + interval '30 minutes'
  where id = v_sess.id;

  v_receipt := jsonb_build_object(
    'attempt_id', v_att.id,
    'state', 'submitted',
    'submitted_at', v_now,
    'correct_count', v_correct,
    'question_count', v_total,
    'score', v_score,
    'explanations_available', v_now >= v_asg.closes_at,
    'receipt_code', v_receipt_code
  );

  insert into private.idempotency_records (scope, key_digest, request_hash, attempt_id, response_json, expires_at)
  values (v_scope, p_idempotency_key_digest, p_request_hash, v_att.id, v_receipt, v_now + interval '24 hours');

  return v_receipt;
end;
$$;

revoke all on function api.resolve_guest_join(text, text) from public;
revoke all on function api.submit_guest_attempt(text, text, text, jsonb) from public;
grant execute on function api.resolve_guest_join(text, text) to guest_api;
grant execute on function api.submit_guest_attempt(text, text, text, jsonb) to guest_api;
