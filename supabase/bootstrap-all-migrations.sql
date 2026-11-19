-- Berkas gabungan otomatis untuk SQL Editor Supabase (dari supabase/migrations/0001..0008)
-- Jalankan seluruh isi berkas ini sekali di Supabase Dashboard -> SQL Editor.

-- === 0001_schemas_and_identity.sql ===
-- 0001_schemas_and_identity.sql
-- Fondasi schema terpisah (app, private, api) serta tabel identitas dewasa & kelas.

create extension if not exists pgcrypto;

create schema if not exists app;
create schema if not exists private;
create schema if not exists api;

-- Role khusus untuk koneksi server sesi tamu (tanpa akses langsung ke tabel)
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'guest_api') then
    create role guest_api nologin;
  end if;
end
$$;

revoke all on schema public from public;
revoke all on schema app from public;
revoke all on schema private from public;
revoke all on schema api from public;

-- Profil dewasa (guru dan admin). User auth tetap berasal dari auth.users Supabase.
create table if not exists app.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('teacher', 'admin')),
  display_name text not null check (char_length(btrim(display_name)) between 2 and 80),
  status text not null default 'invited' check (status in ('invited', 'active', 'suspended')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists app.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  district_label text not null check (char_length(btrim(district_label)) between 2 and 80),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists app.teacher_schools (
  teacher_id uuid not null references app.profiles (user_id) on delete cascade,
  school_id uuid not null references app.schools (id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (teacher_id, school_id)
);

-- Index unik untuk menegakkan FK komposit kepemilikan sekolah oleh guru
create unique index if not exists uq_teacher_schools_active
  on app.teacher_schools (teacher_id, school_id)
  where status = 'active';

create table if not exists app.classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references app.profiles (user_id) on delete restrict,
  school_id uuid not null references app.schools (id) on delete restrict,
  label text not null check (char_length(btrim(label)) between 1 and 40),
  grade smallint not null check (grade in (3, 4)),
  academic_year text not null check (academic_year ~ '^[0-9]{4}/[0-9]{4}$'),
  archived_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint fk_classes_teacher_school
    foreign key (teacher_id, school_id)
    references app.teacher_schools (teacher_id, school_id)
    on delete restrict
);

create index if not exists idx_classes_teacher_archived
  on app.classes (teacher_id, archived_at);

-- Mendukung composite FK (id, teacher_id, grade) dari tabel assignments
create unique index if not exists uq_classes_id_teacher_grade
  on app.classes (id, teacher_id, grade);

-- === 0002_content_and_media.sql ===
-- 0002_content_and_media.sql
-- Tabel konten ensiklopedia berversi, validasi ahli, sumber, media karantina/terkurasi, dan lokasi wilayah umum.

create table if not exists app.media_assets (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('image', 'illustration', 'pdf', 'video', 'evidence')),
  storage_bucket text not null,
  storage_path text not null unique,
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  scan_status text not null default 'quarantine' check (scan_status in ('quarantine', 'cleared', 'rejected')),
  checksum_sha256 text not null check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  mime text not null,
  bytes bigint not null check (bytes > 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  credit text not null default '',
  license text not null default '',
  metadata_scrubbed_at timestamptz,
  created_by uuid references app.profiles (user_id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists app.content_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('book', 'chapter', 'site', 'glossary', 'video', 'guide', 'worksheet', 'page', 'news')),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  published_revision_id uuid,
  archived_at timestamptz,
  created_by uuid references app.profiles (user_id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists app.content_revisions (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references app.content_items (id) on delete cascade,
  version_no integer not null check (version_no >= 1),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  summary text not null default '',
  body_json jsonb not null default '{}'::jsonb,
  target_grades smallint[] not null default array[3, 4]::smallint[]
    check (target_grades <@ array[3, 4]::smallint[] and cardinality(target_grades) >= 1),
  metadata_json jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'in_review', 'approved', 'published', 'archived')),
  search_vector tsvector generated always as (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(summary, ''))
  ) stored,
  created_by uuid references app.profiles (user_id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  published_at timestamptz,
  unique (content_id, version_no),
  unique (content_id, id)
);

-- Composite FK: memastikan pointer published_revision_id selalu menunjuk revisi milik item sendiri
alter table app.content_items
  drop constraint if exists fk_content_items_published_revision,
  add constraint fk_content_items_published_revision
    foreign key (id, published_revision_id)
    references app.content_revisions (content_id, id)
    deferrable initially deferred;

create index if not exists idx_content_revisions_content_version
  on app.content_revisions (content_id, version_no desc);

create index if not exists idx_content_revisions_search
  on app.content_revisions using gin (search_vector);

create table if not exists app.review_records (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references app.content_revisions (id) on delete cascade,
  review_type text not null check (review_type in ('language', 'material', 'media', 'location')),
  reviewer_label text not null check (char_length(btrim(reviewer_label)) between 2 and 120),
  decision text not null check (decision in ('approved', 'changes_requested', 'rejected')),
  notes text not null default '',
  evidence_asset_id uuid references app.media_assets (id) on delete set null,
  recorded_by uuid references app.profiles (user_id) on delete set null,
  reviewed_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_review_records_revision
  on app.review_records (revision_id, review_type);

create table if not exists app.source_references (
  id uuid primary key default gen_random_uuid(),
  citation_text text not null check (char_length(btrim(citation_text)) >= 3),
  url text check (url is null or url ~ '^https?://'),
  doi text,
  accessed_at date,
  source_type text not null check (source_type in ('book', 'journal', 'report', 'archive', 'expert_note', 'regulation'))
);

create table if not exists app.revision_sources (
  revision_id uuid not null references app.content_revisions (id) on delete cascade,
  source_id uuid not null references app.source_references (id) on delete restrict,
  locator text not null default '',
  note text not null default '',
  primary key (revision_id, source_id, locator)
);

create table if not exists app.content_links (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references app.content_revisions (id) on delete cascade,
  target_content_id uuid not null references app.content_items (id) on delete restrict,
  relation_type text not null check (relation_type in ('book_chapter', 'related_glossary', 'related_worksheet', 'related_site', 'related_quiz')),
  sort_order integer not null default 0,
  unique (revision_id, target_content_id, relation_type)
);

create table if not exists app.site_public_locations (
  revision_id uuid primary key references app.content_revisions (id) on delete cascade,
  area_label text not null check (char_length(btrim(area_label)) between 2 and 120),
  display_lat double precision not null check (display_lat between -12 and 8),
  display_lon double precision not null check (display_lon between 94 and 142),
  precision_label text not null default 'Perkiraan wilayah umum',
  display_zoom_max smallint not null default 12 check (display_zoom_max between 8 and 13),
  clearance_review_id uuid not null references app.review_records (id) on delete restrict
);

create table if not exists app.content_media (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references app.content_revisions (id) on delete cascade,
  asset_id uuid not null references app.media_assets (id) on delete restrict,
  role text not null check (role in ('hero', 'cover', 'inline', 'gallery', 'poster', 'caption_vtt', 'download')),
  alt_text text not null default '',
  caption text not null default '',
  sort_order integer not null default 0
);

create table if not exists app.site_settings (
  key text primary key check (key in (
    'hero_title',
    'hero_subtitle',
    'hero_slogan',
    'contact_email',
    'contact_org_name',
    'privacy_notice_summary'
  )),
  value_json jsonb not null,
  updated_by uuid references app.profiles (user_id) on delete set null,
  updated_at timestamptz not null default timezone('utc', now())
);

-- === 0003_quizzes_assignments_attempts.sql ===
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

-- === 0004_audit_retention_and_rls.sql ===
-- 0004_audit_retention_and_rls.sql
-- Tabel audit, dukungan, ekspor, rate-limit counter, retensi, serta RLS & grants minimum.

create table if not exists private.support_access (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references app.profiles (user_id) on delete restrict,
  assignment_id uuid not null references app.assignments (id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) >= 5),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  check (expires_at <= created_at + interval '30 minutes')
);

create table if not exists private.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_type text not null check (actor_type in ('teacher', 'admin', 'guest', 'system')),
  actor_id text not null,
  action text not null,
  target_type text not null,
  target_id text not null,
  request_id text not null,
  outcome text not null check (outcome in ('success', 'denied', 'error')),
  created_at timestamptz not null default timezone('utc', now()),
  safe_metadata jsonb not null default '{}'::jsonb
);

create table if not exists private.export_jobs (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references app.profiles (user_id) on delete restrict,
  assignment_id uuid not null references app.assignments (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed', 'expired')),
  object_path text,
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists private.job_runs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  status text not null check (status in ('running', 'succeeded', 'failed')),
  started_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz,
  safe_error_code text
);

create table if not exists private.outbox_events (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  aggregate_id uuid not null,
  payload_minimal jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'processed', 'failed')),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists private.rate_limit_counters (
  bucket_key text primary key,
  hit_count integer not null default 1 check (hit_count >= 0),
  window_expires_at timestamptz not null
);

create index if not exists idx_rate_limit_expires
  on private.rate_limit_counters (window_expires_at);

-- Helper fungsi RLS dengan search_path tetap/kosong dan tabel fully-qualified
create or replace function private.is_active_teacher(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app.profiles p
    where p.user_id = uid
      and p.role = 'teacher'
      and p.status = 'active'
  );
$$;

create or replace function private.is_active_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app.profiles p
    where p.user_id = uid
      and p.role = 'admin'
      and p.status = 'active'
  );
$$;

revoke all on function private.is_active_teacher(uuid) from public;
revoke all on function private.is_active_admin(uuid) from public;

-- Aktifkan RLS pada seluruh tabel app
alter table app.profiles enable row level security;
alter table app.schools enable row level security;
alter table app.teacher_schools enable row level security;
alter table app.classes enable row level security;
alter table app.media_assets enable row level security;
alter table app.content_items enable row level security;
alter table app.content_revisions enable row level security;
alter table app.review_records enable row level security;
alter table app.source_references enable row level security;
alter table app.revision_sources enable row level security;
alter table app.content_links enable row level security;
alter table app.site_public_locations enable row level security;
alter table app.content_media enable row level security;
alter table app.site_settings enable row level security;
alter table app.quizzes enable row level security;
alter table app.quiz_revisions enable row level security;
alter table app.quiz_review_records enable row level security;
alter table app.quiz_questions enable row level security;
alter table app.quiz_choices enable row level security;
alter table app.question_sources enable row level security;
alter table app.assignments enable row level security;
alter table app.attempts enable row level security;
alter table app.attempt_questions enable row level security;
alter table app.attempt_answers enable row level security;
alter table app.attempt_annotations enable row level security;
alter table app.result_selections enable row level security;

-- Kebijakan dasar isolasi kepemilikan guru dan profil diri
drop policy if exists profiles_select_own on app.profiles;
create policy profiles_select_own on app.profiles
  for select
  using (user_id = auth.uid() and status <> 'suspended');

drop policy if exists classes_teacher_own on app.classes;
create policy classes_teacher_own on app.classes
  for all
  using (teacher_id = auth.uid() and private.is_active_teacher(auth.uid()))
  with check (teacher_id = auth.uid() and private.is_active_teacher(auth.uid()));

drop policy if exists assignments_teacher_own on app.assignments;
create policy assignments_teacher_own on app.assignments
  for all
  using (
    private.is_active_teacher(auth.uid())
    and exists (
      select 1
      from app.classes c
      where c.id = assignments.class_id
        and c.teacher_id = auth.uid()
    )
  )
  with check (
    private.is_active_teacher(auth.uid())
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
    private.is_active_teacher(auth.uid())
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
    private.is_active_teacher(auth.uid())
    and exists (
      select 1
      from app.attempts att
      join app.assignments a on a.id = att.assignment_id
      join app.classes c on c.id = a.class_id
      where att.id = attempt_annotations.attempt_id
        and c.teacher_id = auth.uid()
    )
  );

-- Grants minimal untuk guest_api: hanya EXECUTE fungsi di schema api, tanpa akses langsung ke tabel
grant usage on schema api to guest_api;
revoke all on all tables in schema app from guest_api;
revoke all on all tables in schema private from guest_api;

-- === 0005_cms_publish_and_public_views.sql ===
-- 0005_cms_publish_and_public_views.sql
-- Fungsi publikasi atomik untuk CMS admin & kebijakan baca publik hanya untuk revisi terbit.

-- Publik hanya boleh membaca item yang memiliki published_revision_id dan tidak diarsipkan.
drop policy if exists content_items_public_read on app.content_items;
create policy content_items_public_read on app.content_items
  for select
  using (archived_at is null and published_revision_id is not null);

drop policy if exists content_revisions_public_read on app.content_revisions;
create policy content_revisions_public_read on app.content_revisions
  for select
  using (
    status = 'published'
    and exists (
      select 1
      from app.content_items ci
      where ci.id = content_revisions.content_id
        and ci.published_revision_id = content_revisions.id
        and ci.archived_at is null
    )
  );

drop policy if exists site_public_locations_public_read on app.site_public_locations;
create policy site_public_locations_public_read on app.site_public_locations
  for select
  using (
    exists (
      select 1
      from app.content_items ci
      join app.review_records rr on rr.id = site_public_locations.clearance_review_id
      where ci.published_revision_id = site_public_locations.revision_id
        and ci.archived_at is null
        and rr.revision_id = site_public_locations.revision_id
        and rr.review_type = 'location'
        and rr.decision = 'approved'
    )
  );

drop policy if exists media_assets_public_read on app.media_assets;
create policy media_assets_public_read on app.media_assets
  for select
  using (
    visibility = 'public'
    and scan_status = 'cleared'
    and metadata_scrubbed_at is not null
  );

-- Fungsi atomik publikasi revisi konten (admin aktif saja).
create or replace function private.publish_content_revision(
  p_revision_id uuid,
  p_actor_id uuid,
  p_request_id text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_content_id uuid;
  v_kind text;
  v_status text;
  v_has_source boolean;
  v_has_lang_ok boolean;
  v_has_material_ok boolean;
  v_has_location_ok boolean;
  v_has_uncleared_media boolean;
begin
  if not private.is_active_admin(p_actor_id) then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  select cr.content_id, ci.kind, cr.status
  into v_content_id, v_kind, v_status
  from app.content_revisions cr
  join app.content_items ci on ci.id = cr.content_id
  where cr.id = p_revision_id
  for update;

  if not found then
    raise exception 'RESOURCE_NOT_FOUND';
  end if;

  if v_status not in ('approved', 'in_review') then
    raise exception 'STATE_CONFLICT';
  end if;

  select exists (
    select 1 from app.revision_sources rs where rs.revision_id = p_revision_id
  ) into v_has_source;

  if not v_has_source then
    raise exception 'VALIDATION_FAILED:SOURCE_REQUIRED';
  end if;

  select exists (
    select 1 from app.review_records rr
    where rr.revision_id = p_revision_id and rr.review_type = 'language' and rr.decision = 'approved'
  ) into v_has_lang_ok;

  select exists (
    select 1 from app.review_records rr
    where rr.revision_id = p_revision_id and rr.review_type = 'material' and rr.decision = 'approved'
  ) into v_has_material_ok;

  if not (v_has_lang_ok and v_has_material_ok) then
    raise exception 'VALIDATION_FAILED:REVIEWS_REQUIRED';
  end if;

  if v_kind = 'site' then
    select exists (
      select 1
      from app.site_public_locations spl
      join app.review_records rr on rr.id = spl.clearance_review_id
      where spl.revision_id = p_revision_id
        and rr.revision_id = p_revision_id
        and rr.review_type = 'location'
        and rr.decision = 'approved'
    ) into v_has_location_ok;

    if not v_has_location_ok then
      raise exception 'VALIDATION_FAILED:LOCATION_CLEARANCE_REQUIRED';
    end if;
  end if;

  select exists (
    select 1
    from app.content_media cm
    join app.media_assets ma on ma.id = cm.asset_id
    where cm.revision_id = p_revision_id
      and (ma.scan_status <> 'cleared' or ma.metadata_scrubbed_at is null)
  ) into v_has_uncleared_media;

  if v_has_uncleared_media then
    raise exception 'VALIDATION_FAILED:MEDIA_NOT_CLEARED';
  end if;

  update app.content_revisions
  set status = 'published',
      published_at = timezone('utc', now())
  where id = p_revision_id;

  update app.content_items
  set published_revision_id = p_revision_id
  where id = v_content_id;

  insert into private.audit_logs (
    actor_type, actor_id, action, target_type, target_id, request_id, outcome, safe_metadata
  ) values (
    'admin', p_actor_id::text, 'publish_content_revision', 'content_revision', p_revision_id::text, p_request_id, 'success',
    jsonb_build_object('content_id', v_content_id, 'kind', v_kind)
  );

  return p_revision_id;
end;
$$;

revoke all on function private.publish_content_revision(uuid, uuid, text) from public;

-- === 0006_rate_limit_and_retention.sql ===
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

-- === 0007_guest_rpc_and_api_functions.sql ===
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

-- === 0008_supabase_grants_and_rpcs.sql ===
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

-- === 0009_fix_rls_recursion_and_location_helper.sql ===
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
