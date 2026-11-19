-- 0003_quizzes_assignments_attempts.sql
-- Kuis, kunci jawaban terisolasi di schema private, penugasan tanpa akun siswa, sesi tamu, dan percobaan.

create table if not exists app.quizzes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  published_revision_id uuid,
  archived_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists app.quiz_revisions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references app.quizzes (id) on delete cascade,
  version_no integer not null check (version_no >= 1),
  title text not null check (char_length(btrim(title)) between 2 and 160),
  grade smallint not null check (grade in (3, 4)),
  usage_mode text not null check (usage_mode in ('practice', 'assignment')),
  instructions text not null default '',
  status text not null default 'draft' check (status in ('draft', 'in_review', 'approved', 'published', 'archived')),
  validated_by uuid references app.profiles (user_id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  published_at timestamptz,
  unique (quiz_id, version_no),
  unique (quiz_id, id),
  unique (id, grade, usage_mode)
);

alter table app.quizzes
  drop constraint if exists fk_quizzes_published_revision,
  add constraint fk_quizzes_published_revision
    foreign key (id, published_revision_id)
    references app.quiz_revisions (quiz_id, id)
    deferrable initially deferred;

create table if not exists app.quiz_review_records (
  id uuid primary key default gen_random_uuid(),
  quiz_revision_id uuid not null references app.quiz_revisions (id) on delete cascade,
  review_type text not null check (review_type in ('language', 'material', 'media')),
  decision text not null check (decision in ('approved', 'changes_requested', 'rejected')),
  reviewer_label text not null,
  evidence_asset_id uuid references app.media_assets (id) on delete set null,
  reviewed_at timestamptz not null default timezone('utc', now())
);

create table if not exists app.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_revision_id uuid not null references app.quiz_revisions (id) on delete cascade,
  position integer not null check (position >= 1),
  prompt_json jsonb not null,
  media_asset_id uuid references app.media_assets (id) on delete set null,
  unique (quiz_revision_id, position),
  unique (quiz_revision_id, id)
);

create table if not exists app.quiz_choices (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references app.quiz_questions (id) on delete cascade,
  position smallint not null check (position between 1 and 4),
  label_json jsonb not null,
  unique (question_id, position),
  unique (question_id, id)
);

-- Kunci jawaban disimpan di schema private; tidak pernah masuk API publik atau guru.
create table if not exists private.quiz_answer_keys (
  question_id uuid primary key references app.quiz_questions (id) on delete cascade,
  correct_choice_id uuid not null,
  explanation_json jsonb not null default '{}'::jsonb,
  constraint fk_answer_key_choice
    foreign key (question_id, correct_choice_id)
    references app.quiz_choices (question_id, id)
    on delete restrict
);

create table if not exists app.question_sources (
  question_id uuid not null references app.quiz_questions (id) on delete cascade,
  source_id uuid not null references app.source_references (id) on delete restrict,
  locator text not null default '',
  primary key (question_id, source_id, locator)
);

create table if not exists app.assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null,
  teacher_id uuid not null,
  grade smallint not null check (grade in (3, 4)),
  quiz_revision_id uuid not null,
  usage_mode text not null default 'assignment' check (usage_mode = 'assignment'),
  title text not null check (char_length(btrim(title)) between 2 and 160),
  state text not null default 'draft' check (state in ('draft', 'open', 'closed', 'revoked', 'archived')),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  session_minutes integer not null default 120 check (session_minutes between 10 and 180),
  consent_policy_version text not null,
  consent_readiness_at timestamptz,
  created_by uuid not null references app.profiles (user_id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  check (closes_at > opens_at),
  constraint fk_assignments_class_owner_grade
    foreign key (class_id, teacher_id, grade)
    references app.classes (id, teacher_id, grade)
    on delete restrict,
  constraint fk_assignments_quiz_grade_mode
    foreign key (quiz_revision_id, grade, usage_mode)
    references app.quiz_revisions (id, grade, usage_mode)
    on delete restrict
);

create unique index if not exists uq_assignments_id_revision
  on app.assignments (id, quiz_revision_id);

create index if not exists idx_assignments_class_created
  on app.assignments (class_id, created_at desc);

create table if not exists private.assignment_access (
  assignment_id uuid primary key references app.assignments (id) on delete cascade,
  join_token_hash text not null unique check (join_token_hash ~ '^[0-9a-f]{64}$'),
  join_code_digest text not null unique check (join_code_digest ~ '^[0-9a-f]{64}$'),
  generation integer not null default 1 check (generation >= 1),
  rotated_at timestamptz not null default timezone('utc', now())
);

create table if not exists private.consent_evidence_refs (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references app.classes (id) on delete cascade,
  attempt_id uuid,
  external_reference text not null check (char_length(btrim(external_reference)) between 2 and 160),
  policy_version text not null,
  recorded_by uuid not null references app.profiles (user_id) on delete restrict,
  recorded_at timestamptz not null default timezone('utc', now()),
  withdrawn_at timestamptz
);

create table if not exists app.attempts (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null,
  quiz_revision_id uuid not null,
  student_name text not null check (char_length(btrim(student_name)) between 1 and 80),
  corrected_name text check (corrected_name is null or char_length(btrim(corrected_name)) between 1 and 80),
  state text not null default 'in_progress' check (state in ('in_progress', 'submitted', 'expired', 'cancelled')),
  answer_revision integer not null default 0 check (answer_revision >= 0),
  started_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  submitted_at timestamptz,
  correct_count integer check (correct_count is null or correct_count >= 0),
  question_count integer check (question_count is null or question_count >= 1),
  score numeric(5, 2) check (score is null or (score >= 0 and score <= 100)),
  receipt_code text,
  purge_at timestamptz not null,
  constraint fk_attempts_assignment_revision
    foreign key (assignment_id, quiz_revision_id)
    references app.assignments (id, quiz_revision_id)
    on delete restrict,
  check (
    (state <> 'submitted' and submitted_at is null and score is null and correct_count is null)
    or
    (state = 'submitted' and submitted_at is not null and score is not null and correct_count is not null and question_count is not null and correct_count <= question_count)
  )
);

create index if not exists idx_attempts_assignment_state_submitted
  on app.attempts (assignment_id, state, submitted_at desc);

create index if not exists idx_attempts_purge_at
  on app.attempts (purge_at);

create table if not exists app.attempt_questions (
  attempt_id uuid not null references app.attempts (id) on delete cascade,
  question_id uuid not null references app.quiz_questions (id) on delete restrict,
  position integer not null check (position >= 1),
  choice_order_json jsonb not null,
  primary key (attempt_id, question_id),
  unique (attempt_id, position)
);

create table if not exists app.attempt_answers (
  attempt_id uuid not null,
  question_id uuid not null,
  selected_choice_id uuid,
  updated_at timestamptz not null default timezone('utc', now()),
  is_correct boolean,
  primary key (attempt_id, question_id),
  constraint fk_attempt_answers_question
    foreign key (attempt_id, question_id)
    references app.attempt_questions (attempt_id, question_id)
    on delete cascade,
  constraint fk_attempt_answers_choice
    foreign key (question_id, selected_choice_id)
    references app.quiz_choices (question_id, id)
    on delete restrict
);

create table if not exists private.guest_sessions (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references app.attempts (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  issued_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists idx_guest_sessions_expires
  on private.guest_sessions (expires_at);

create table if not exists private.idempotency_records (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  key_digest text not null check (key_digest ~ '^[0-9a-f]{64}$'),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  attempt_id uuid references app.attempts (id) on delete cascade,
  response_json jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  unique (scope, key_digest)
);

create table if not exists app.attempt_annotations (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references app.attempts (id) on delete cascade,
  actor_id uuid not null references app.profiles (user_id) on delete restrict,
  kind text not null check (kind in ('verified', 'invalidated', 'name_correction', 'note')),
  reason text not null check (char_length(btrim(reason)) >= 3),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists app.result_selections (
  assignment_id uuid not null references app.assignments (id) on delete cascade,
  normalized_name_digest text not null check (normalized_name_digest ~ '^[0-9a-f]{64}$'),
  selected_attempt_id uuid not null references app.attempts (id) on delete cascade,
  selected_by uuid not null references app.profiles (user_id) on delete restrict,
  reason text not null default '',
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (assignment_id, normalized_name_digest)
);
