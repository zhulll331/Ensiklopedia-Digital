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

-- === 0010_admin_foundation.sql ===
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

-- === 0011_admin_overview_rpc.sql ===
-- 0011_admin_overview_rpc.sql
-- RPC ringkasan status job sistem untuk dashboard admin (private.job_runs tetap terisolasi).

create or replace function api.get_admin_recent_job_runs(
  p_actor_id uuid,
  p_limit integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 5), 1), 20);
  v_rows jsonb;
begin
  if not private.is_active_admin(p_actor_id) then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  select coalesce(
    jsonb_agg(
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
  into v_rows
  from (
    select id, job_type, status, started_at, finished_at, safe_error_code
    from private.job_runs
    order by started_at desc
    limit v_limit
  ) jr;

  return v_rows;
end;
$$;

revoke all on function api.get_admin_recent_job_runs(uuid, integer) from public, anon, authenticated;
grant execute on function api.get_admin_recent_job_runs(uuid, integer) to service_role;

-- === 0012_admin_cms_rpcs.sql ===
-- 0012_admin_cms_rpcs.sql
-- Migrasi Fase 2: Perketat publish gate (hanya status 'approved' + review media)
-- serta RPC mutasi CMS terstruktur (D1, D3, D5) dengan audit transaksi tunggal.

-- 1. Perbarui fungsi internal publikasi revisi (D3: wajib status = 'approved' + paritas media review)
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
  v_has_media boolean;
  v_has_media_ok boolean;
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

  if v_status <> 'approved' then
    raise exception 'STATE_CONFLICT:REQUIRES_APPROVED';
  end if;

  select exists (
    select 1 from app.revision_sources rs where rs.revision_id = p_revision_id
  ) into v_has_source;

  if not v_has_source then
    raise exception 'VALIDATION_FAILED:SOURCE_REQUIRED';
  end if;

  select exists (
    select 1 from app.review_records rr
    where rr.revision_id = p_revision_id
      and rr.review_type = 'language'
      and rr.decision = 'approved'
  ) into v_has_lang_ok;

  select exists (
    select 1 from app.review_records rr
    where rr.revision_id = p_revision_id
      and rr.review_type = 'material'
      and rr.decision = 'approved'
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
    select 1 from app.content_media cm where cm.revision_id = p_revision_id
  ) into v_has_media;

  if v_has_media then
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

    select exists (
      select 1
      from app.review_records rr
      where rr.revision_id = p_revision_id
        and rr.review_type = 'media'
        and rr.decision = 'approved'
    ) into v_has_media_ok;

    if not v_has_media_ok then
      raise exception 'VALIDATION_FAILED:MEDIA_REVIEW_REQUIRED';
    end if;
  end if;

  update app.content_revisions
  set status = 'published',
      published_at = timezone('utc', now())
  where id = p_revision_id;

  update app.content_items
  set published_revision_id = p_revision_id,
      archived_at = null
  where id = v_content_id;

  perform private.write_audit(
    'admin',
    p_actor_id::text,
    'publish_content_revision',
    'content_revision',
    p_revision_id::text,
    p_request_id,
    'success',
    jsonb_build_object('content_id', v_content_id, 'kind', v_kind)
  );

  return p_revision_id;
end;
$$;

revoke all on function private.publish_content_revision(uuid, uuid, text) from public;

-- 2. Buat content_item baru beserta draf revisi v1
create or replace function api.create_content_item_with_draft(
  p_actor_id uuid,
  p_kind text,
  p_slug text,
  p_title text,
  p_summary text default '',
  p_target_grades integer[] default array[3, 4],
  p_body_json jsonb default '{}'::jsonb,
  p_metadata_json jsonb default '{}'::jsonb,
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
  v_summary text := btrim(coalesce(p_summary, ''));
  v_grades smallint[] := coalesce(p_target_grades, array[3, 4])::smallint[];
  v_content_id uuid;
  v_revision_id uuid;
begin
  if not private.is_active_admin(p_actor_id) then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  if p_kind not in ('book', 'chapter', 'site', 'glossary', 'video', 'guide', 'worksheet', 'page', 'news') then
    raise exception 'VALIDATION_FAILED:INVALID_KIND';
  end if;

  if v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or char_length(v_slug) < 2 or char_length(v_slug) > 120 then
    raise exception 'VALIDATION_FAILED:INVALID_SLUG';
  end if;

  if char_length(v_title) < 1 or char_length(v_title) > 200 then
    raise exception 'VALIDATION_FAILED:INVALID_TITLE';
  end if;

  if not (v_grades <@ array[3, 4]::smallint[] and cardinality(v_grades) >= 1) then
    raise exception 'VALIDATION_FAILED:INVALID_GRADES';
  end if;

  if exists (select 1 from app.content_items ci where ci.slug = v_slug) then
    raise exception 'VALIDATION_FAILED:SLUG_EXISTS';
  end if;

  insert into app.content_items (kind, slug, created_by)
  values (p_kind, v_slug, p_actor_id)
  returning id into v_content_id;

  insert into app.content_revisions (
    content_id,
    version_no,
    title,
    summary,
    body_json,
    target_grades,
    metadata_json,
    status,
    created_by
  )
  values (
    v_content_id,
    1,
    v_title,
    v_summary,
    coalesce(p_body_json, '{}'::jsonb),
    v_grades,
    coalesce(p_metadata_json, '{}'::jsonb),
    'draft',
    p_actor_id
  )
  returning id into v_revision_id;

  perform private.write_audit(
    'admin',
    p_actor_id::text,
    'create_content_item',
    'content_revision',
    v_revision_id::text,
    p_request_id,
    'success',
    jsonb_build_object(
      'content_id', v_content_id,
      'kind', p_kind,
      'slug', v_slug,
      'version_no', 1
    )
  );

  return jsonb_build_object(
    'content_id', v_content_id,
    'revision_id', v_revision_id,
    'version_no', 1
  );
end;
$$;

revoke all on function api.create_content_item_with_draft(uuid, text, text, text, text, integer[], jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function api.create_content_item_with_draft(uuid, text, text, text, text, integer[], jsonb, jsonb, text) to service_role;

-- 3. Buat revisi baru (v+1) berstatus 'draft' yang menyalin isi & relasi sumber/media/tautan
-- Catatan: review_records dan site_public_locations tidak disalin agar revisi baru tetap menjalani telaah & clearance ulang.
create or replace function api.create_new_content_revision(
  p_actor_id uuid,
  p_content_id uuid,
  p_source_revision_id uuid default null,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item_kind text;
  v_src_rev app.content_revisions%rowtype;
  v_next_version integer;
  v_new_revision_id uuid;
begin
  if not private.is_active_admin(p_actor_id) then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  select ci.kind
  into v_item_kind
  from app.content_items ci
  where ci.id = p_content_id
  for update;

  if not found then
    raise exception 'RESOURCE_NOT_FOUND';
  end if;

  if p_source_revision_id is not null then
    select *
    into v_src_rev
    from app.content_revisions cr
    where cr.id = p_source_revision_id
      and cr.content_id = p_content_id;
  else
    select *
    into v_src_rev
    from app.content_revisions cr
    where cr.content_id = p_content_id
    order by cr.version_no desc
    limit 1;
  end if;

  if v_src_rev.id is null then
    raise exception 'RESOURCE_NOT_FOUND';
  end if;

  select coalesce(max(cr.version_no), 0) + 1
  into v_next_version
  from app.content_revisions cr
  where cr.content_id = p_content_id;

  insert into app.content_revisions (
    content_id,
    version_no,
    title,
    summary,
    body_json,
    target_grades,
    metadata_json,
    status,
    created_by
  )
  values (
    p_content_id,
    v_next_version,
    v_src_rev.title,
    v_src_rev.summary,
    v_src_rev.body_json,
    v_src_rev.target_grades,
    v_src_rev.metadata_json,
    'draft',
    p_actor_id
  )
  returning id into v_new_revision_id;

  insert into app.revision_sources (revision_id, source_id, locator, note)
  select v_new_revision_id, rs.source_id, rs.locator, rs.note
  from app.revision_sources rs
  where rs.revision_id = v_src_rev.id;

  insert into app.content_media (revision_id, asset_id, role, alt_text, caption, sort_order)
  select v_new_revision_id, cm.asset_id, cm.role, cm.alt_text, cm.caption, cm.sort_order
  from app.content_media cm
  where cm.revision_id = v_src_rev.id;

  insert into app.content_links (revision_id, target_content_id, relation_type, sort_order)
  select v_new_revision_id, cl.target_content_id, cl.relation_type, cl.sort_order
  from app.content_links cl
  where cl.revision_id = v_src_rev.id;

  perform private.write_audit(
    'admin',
    p_actor_id::text,
    'create_content_revision',
    'content_revision',
    v_new_revision_id::text,
    p_request_id,
    'success',
    jsonb_build_object(
      'content_id', p_content_id,
      'kind', v_item_kind,
      'source_revision_id', v_src_rev.id,
      'version_no', v_next_version
    )
  );

  return jsonb_build_object(
    'content_id', p_content_id,
    'revision_id', v_new_revision_id,
    'version_no', v_next_version
  );
end;
$$;

revoke all on function api.create_new_content_revision(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function api.create_new_content_revision(uuid, uuid, uuid, text) to service_role;

-- 4. Perbarui isi draf revisi (hanya saat status = 'draft'; ADR-05)
create or replace function api.update_content_revision_draft(
  p_actor_id uuid,
  p_revision_id uuid,
  p_title text,
  p_summary text,
  p_target_grades integer[],
  p_body_json jsonb,
  p_metadata_json jsonb,
  p_sources jsonb default null,
  p_media jsonb default null,
  p_links jsonb default null,
  p_request_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_content_id uuid;
  v_status text;
  v_title text := btrim(coalesce(p_title, ''));
  v_summary text := btrim(coalesce(p_summary, ''));
  v_grades smallint[] := coalesce(p_target_grades, array[3, 4])::smallint[];
begin
  if not private.is_active_admin(p_actor_id) then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  select cr.content_id, cr.status
  into v_content_id, v_status
  from app.content_revisions cr
  where cr.id = p_revision_id
  for update;

  if not found then
    raise exception 'RESOURCE_NOT_FOUND';
  end if;

  if v_status <> 'draft' then
    raise exception 'STATE_CONFLICT:IMMUTABLE';
  end if;

  if char_length(v_title) < 1 or char_length(v_title) > 200 then
    raise exception 'VALIDATION_FAILED:INVALID_TITLE';
  end if;

  if not (v_grades <@ array[3, 4]::smallint[] and cardinality(v_grades) >= 1) then
    raise exception 'VALIDATION_FAILED:INVALID_GRADES';
  end if;

  update app.content_revisions
  set title = v_title,
      summary = v_summary,
      target_grades = v_grades,
      body_json = coalesce(p_body_json, '{}'::jsonb),
      metadata_json = coalesce(p_metadata_json, '{}'::jsonb)
  where id = p_revision_id;

  if p_sources is not null and jsonb_typeof(p_sources) = 'array' then
    if exists (
      select 1
      from jsonb_to_recordset(p_sources) as s(source_id uuid, locator text, note text)
      where s.source_id is null
         or not exists (select 1 from app.source_references sr where sr.id = s.source_id)
    ) then
      raise exception 'VALIDATION_FAILED:INVALID_SOURCE_ID';
    end if;

    delete from app.revision_sources where revision_id = p_revision_id;

    insert into app.revision_sources (revision_id, source_id, locator, note)
    select distinct on (s.source_id, btrim(coalesce(s.locator, '')))
      p_revision_id,
      s.source_id,
      btrim(coalesce(s.locator, '')),
      btrim(coalesce(s.note, ''))
    from jsonb_to_recordset(p_sources) as s(source_id uuid, locator text, note text)
    order by s.source_id, btrim(coalesce(s.locator, ''))
    on conflict (revision_id, source_id, locator) do update
      set note = excluded.note;
  end if;

  if p_media is not null and jsonb_typeof(p_media) = 'array' then
    if exists (
      select 1
      from jsonb_to_recordset(p_media) as m(asset_id uuid, role text, alt_text text, caption text, sort_order integer)
      where m.asset_id is null
         or not exists (select 1 from app.media_assets ma where ma.id = m.asset_id)
         or m.role not in ('hero', 'cover', 'inline', 'gallery', 'poster', 'caption_vtt', 'download')
    ) then
      raise exception 'VALIDATION_FAILED:INVALID_MEDIA';
    end if;

    delete from app.content_media where revision_id = p_revision_id;

    insert into app.content_media (revision_id, asset_id, role, alt_text, caption, sort_order)
    select
      p_revision_id,
      m.asset_id,
      m.role,
      btrim(coalesce(m.alt_text, '')),
      btrim(coalesce(m.caption, '')),
      coalesce(m.sort_order, 0)
    from jsonb_to_recordset(p_media) as m(asset_id uuid, role text, alt_text text, caption text, sort_order integer);
  end if;

  if p_links is not null and jsonb_typeof(p_links) = 'array' then
    if exists (
      select 1
      from jsonb_to_recordset(p_links) as l(target_content_id uuid, relation_type text, sort_order integer)
      where l.target_content_id is null
         or l.target_content_id = v_content_id
         or not exists (select 1 from app.content_items ci where ci.id = l.target_content_id)
         or l.relation_type not in ('book_chapter', 'related_glossary', 'related_worksheet', 'related_site', 'related_quiz')
    ) then
      raise exception 'VALIDATION_FAILED:INVALID_CONTENT_LINK';
    end if;

    delete from app.content_links where revision_id = p_revision_id;

    insert into app.content_links (revision_id, target_content_id, relation_type, sort_order)
    select
      p_revision_id,
      l.target_content_id,
      l.relation_type,
      min(coalesce(l.sort_order, 0))
    from jsonb_to_recordset(p_links) as l(target_content_id uuid, relation_type text, sort_order integer)
    group by l.target_content_id, l.relation_type;
  end if;

  perform private.write_audit(
    'admin',
    p_actor_id::text,
    'update_content_revision_draft',
    'content_revision',
    p_revision_id::text,
    p_request_id,
    'success',
    jsonb_build_object('content_id', v_content_id)
  );

  return p_revision_id;
end;
$$;

revoke all on function api.update_content_revision_draft(uuid, uuid, text, text, integer[], jsonb, jsonb, jsonb, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function api.update_content_revision_draft(uuid, uuid, text, text, integer[], jsonb, jsonb, jsonb, jsonb, jsonb, text) to service_role;

-- 5. Tambah rujukan sumber ke app.source_references
create or replace function api.upsert_source_reference(
  p_actor_id uuid,
  p_citation_text text,
  p_url text default null,
  p_doi text default null,
  p_accessed_at date default null,
  p_source_type text default 'report',
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_citation text := btrim(coalesce(p_citation_text, ''));
  v_url text := nullif(btrim(coalesce(p_url, '')), '');
  v_doi text := nullif(btrim(coalesce(p_doi, '')), '');
  v_source app.source_references%rowtype;
begin
  if not private.is_active_admin(p_actor_id) then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  if char_length(v_citation) < 3 then
    raise exception 'VALIDATION_FAILED:INVALID_CITATION';
  end if;

  if p_source_type not in ('book', 'journal', 'report', 'archive', 'expert_note', 'regulation') then
    raise exception 'VALIDATION_FAILED:INVALID_SOURCE_TYPE';
  end if;

  if v_url is not null and v_url !~ '^https?://' then
    raise exception 'VALIDATION_FAILED:INVALID_URL';
  end if;

  insert into app.source_references (citation_text, url, doi, accessed_at, source_type)
  values (v_citation, v_url, v_doi, p_accessed_at, p_source_type)
  returning * into v_source;

  perform private.write_audit(
    'admin',
    p_actor_id::text,
    'create_source_reference',
    'source_reference',
    v_source.id::text,
    p_request_id,
    'success',
    jsonb_build_object('source_type', v_source.source_type)
  );

  return jsonb_build_object(
    'id', v_source.id,
    'citation_text', v_source.citation_text,
    'url', v_source.url,
    'doi', v_source.doi,
    'accessed_at', v_source.accessed_at,
    'source_type', v_source.source_type
  );
end;
$$;

revoke all on function api.upsert_source_reference(uuid, text, text, text, date, text, text) from public, anon, authenticated;
grant execute on function api.upsert_source_reference(uuid, text, text, text, date, text, text) to service_role;

-- 6. Transisi status revisi terkendali (+ takedown konten terbit bila published -> archived)
create or replace function api.transition_content_revision(
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
  v_content_id uuid;
  v_status text;
  v_published_rev_id uuid;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_needs_reason boolean := false;
  v_unpublished_live boolean := false;
begin
  if not private.is_active_admin(p_actor_id) then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  select cr.content_id, cr.status, ci.published_revision_id
  into v_content_id, v_status, v_published_rev_id
  from app.content_revisions cr
  join app.content_items ci on ci.id = cr.content_id
  where cr.id = p_revision_id
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

  update app.content_revisions
  set status = p_next_status
  where id = p_revision_id;

  if p_next_status = 'archived' and v_published_rev_id = p_revision_id then
    update app.content_items
    set published_revision_id = null,
        archived_at = timezone('utc', now())
    where id = v_content_id;
    v_unpublished_live := true;
  end if;

  perform private.write_audit(
    'admin',
    p_actor_id::text,
    'transition_content_revision',
    'content_revision',
    p_revision_id::text,
    p_request_id,
    'success',
    jsonb_build_object(
      'content_id', v_content_id,
      'from_status', v_status,
      'to_status', p_next_status,
      'reason', left(v_reason, 300),
      'unpublished_live', v_unpublished_live
    )
  );

  return jsonb_build_object(
    'revision_id', p_revision_id,
    'content_id', v_content_id,
    'from_status', v_status,
    'to_status', p_next_status,
    'unpublished_live', v_unpublished_live
  );
end;
$$;

revoke all on function api.transition_content_revision(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function api.transition_content_revision(uuid, uuid, text, text, text, text) to service_role;

-- 7. Catat validasi kurator pada revisi (tidak diizinkan untuk revisi published/archived)
create or replace function api.add_revision_review(
  p_actor_id uuid,
  p_revision_id uuid,
  p_review_type text,
  p_reviewer_label text,
  p_decision text,
  p_notes text default '',
  p_evidence_asset_id uuid default null,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_content_id uuid;
  v_status text;
  v_reviewer text := btrim(coalesce(p_reviewer_label, ''));
  v_notes text := btrim(coalesce(p_notes, ''));
  v_review app.review_records%rowtype;
begin
  if not private.is_active_admin(p_actor_id) then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  select cr.content_id, cr.status
  into v_content_id, v_status
  from app.content_revisions cr
  where cr.id = p_revision_id
  for update;

  if not found then
    raise exception 'RESOURCE_NOT_FOUND';
  end if;

  if v_status in ('published', 'archived') then
    raise exception 'STATE_CONFLICT:IMMUTABLE';
  end if;

  if p_review_type not in ('language', 'material', 'media', 'location') then
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

  insert into app.review_records (
    revision_id,
    review_type,
    reviewer_label,
    decision,
    notes,
    evidence_asset_id,
    recorded_by
  )
  values (
    p_revision_id,
    p_review_type,
    v_reviewer,
    p_decision,
    v_notes,
    p_evidence_asset_id,
    p_actor_id
  )
  returning * into v_review;

  perform private.write_audit(
    'admin',
    p_actor_id::text,
    'add_revision_review',
    'content_revision',
    p_revision_id::text,
    p_request_id,
    'success',
    jsonb_build_object(
      'content_id', v_content_id,
      'review_id', v_review.id,
      'review_type', v_review.review_type,
      'decision', v_review.decision
    )
  );

  return jsonb_build_object(
    'id', v_review.id,
    'revision_id', v_review.revision_id,
    'review_type', v_review.review_type,
    'reviewer_label', v_review.reviewer_label,
    'decision', v_review.decision,
    'notes', v_review.notes,
    'evidence_asset_id', v_review.evidence_asset_id,
    'reviewed_at', v_review.reviewed_at
  );
end;
$$;

revoke all on function api.add_revision_review(uuid, uuid, text, text, text, text, uuid, text) from public, anon, authenticated;
grant execute on function api.add_revision_review(uuid, uuid, text, text, text, text, uuid, text) to service_role;

-- === 0013_admin_site_locations_rpcs.sql ===
-- 0013_admin_site_locations_rpcs.sql
-- Migrasi Fase 3: RPC pengelolaan lokasi wilayah umum situs (penguatan SEC-16 & ADR-05).

-- 1. Upsert lokasi wilayah umum untuk revisi situs (maksimal 2 desimal, wajib clearance review location approved)
create or replace function api.upsert_site_public_location(
  p_actor_id uuid,
  p_revision_id uuid,
  p_area_label text,
  p_display_lat double precision,
  p_display_lon double precision,
  p_precision_label text default 'Perkiraan wilayah umum',
  p_display_zoom_max integer default 11,
  p_clearance_review_id uuid default null,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_content_id uuid;
  v_kind text;
  v_status text;
  v_area_label text := btrim(coalesce(p_area_label, ''));
  v_precision_label text := btrim(coalesce(p_precision_label, 'Perkiraan wilayah umum'));
  v_lat_rounded double precision;
  v_lon_rounded double precision;
  v_row app.site_public_locations%rowtype;
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

  if v_kind <> 'site' then
    raise exception 'VALIDATION_FAILED:NOT_A_SITE';
  end if;

  if v_status not in ('draft', 'in_review') then
    raise exception 'STATE_CONFLICT:IMMUTABLE';
  end if;

  if char_length(v_area_label) < 2 or char_length(v_area_label) > 120 then
    raise exception 'VALIDATION_FAILED:INVALID_AREA_LABEL';
  end if;

  if char_length(v_precision_label) < 3 or char_length(v_precision_label) > 80 then
    raise exception 'VALIDATION_FAILED:INVALID_PRECISION_LABEL';
  end if;

  if p_display_zoom_max is null or p_display_zoom_max < 8 or p_display_zoom_max > 13 then
    raise exception 'VALIDATION_FAILED:INVALID_ZOOM';
  end if;

  if p_display_lat is null or p_display_lon is null
     or p_display_lat < -12 or p_display_lat > 8
     or p_display_lon < 94 or p_display_lon > 142 then
    raise exception 'VALIDATION_FAILED:COORDINATES_OUT_OF_RANGE';
  end if;

  v_lat_rounded := pg_catalog.round(p_display_lat::numeric, 2)::double precision;
  v_lon_rounded := pg_catalog.round(p_display_lon::numeric, 2)::double precision;

  if pg_catalog.abs(p_display_lat - v_lat_rounded) > 0.000001
     or pg_catalog.abs(p_display_lon - v_lon_rounded) > 0.000001 then
    raise exception 'VALIDATION_FAILED:COORDINATES_TOO_PRECISE';
  end if;

  if p_clearance_review_id is null or not exists (
    select 1
    from app.review_records rr
    where rr.id = p_clearance_review_id
      and rr.revision_id = p_revision_id
      and rr.review_type = 'location'
      and rr.decision = 'approved'
  ) then
    raise exception 'VALIDATION_FAILED:INVALID_CLEARANCE_REVIEW';
  end if;

  insert into app.site_public_locations (
    revision_id,
    area_label,
    display_lat,
    display_lon,
    precision_label,
    display_zoom_max,
    clearance_review_id
  )
  values (
    p_revision_id,
    v_area_label,
    v_lat_rounded,
    v_lon_rounded,
    v_precision_label,
    p_display_zoom_max::smallint,
    p_clearance_review_id
  )
  on conflict (revision_id) do update
    set area_label = excluded.area_label,
        display_lat = excluded.display_lat,
        display_lon = excluded.display_lon,
        precision_label = excluded.precision_label,
        display_zoom_max = excluded.display_zoom_max,
        clearance_review_id = excluded.clearance_review_id
  returning * into v_row;

  perform private.write_audit(
    'admin',
    p_actor_id::text,
    'upsert_site_public_location',
    'content_revision',
    p_revision_id::text,
    p_request_id,
    'success',
    jsonb_build_object(
      'content_id', v_content_id,
      'area_label', v_row.area_label,
      'display_zoom_max', v_row.display_zoom_max,
      'clearance_review_id', v_row.clearance_review_id
    )
  );

  return jsonb_build_object(
    'revision_id', v_row.revision_id,
    'area_label', v_row.area_label,
    'display_lat', v_row.display_lat,
    'display_lon', v_row.display_lon,
    'precision_label', v_row.precision_label,
    'display_zoom_max', v_row.display_zoom_max,
    'clearance_review_id', v_row.clearance_review_id
  );
end;
$$;

revoke all on function api.upsert_site_public_location(uuid, uuid, text, double precision, double precision, text, integer, uuid, text) from public, anon, authenticated;
grant execute on function api.upsert_site_public_location(uuid, uuid, text, double precision, double precision, text, integer, uuid, text) to service_role;

-- 2. Hapus lokasi wilayah umum pada revisi situs yang masih dapat diubah (draft/in_review)
create or replace function api.delete_site_public_location(
  p_actor_id uuid,
  p_revision_id uuid,
  p_request_id text default null
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

  if v_kind <> 'site' then
    raise exception 'VALIDATION_FAILED:NOT_A_SITE';
  end if;

  if v_status not in ('draft', 'in_review') then
    raise exception 'STATE_CONFLICT:IMMUTABLE';
  end if;

  delete from app.site_public_locations spl
  where spl.revision_id = p_revision_id;

  perform private.write_audit(
    'admin',
    p_actor_id::text,
    'delete_site_public_location',
    'content_revision',
    p_revision_id::text,
    p_request_id,
    'success',
    jsonb_build_object('content_id', v_content_id)
  );

  return p_revision_id;
end;
$$;

revoke all on function api.delete_site_public_location(uuid, uuid, text) from public, anon, authenticated;
grant execute on function api.delete_site_public_location(uuid, uuid, text) to service_role;

-- === 0014_admin_media_rpcs.sql ===
-- 0014_admin_media_rpcs.sql
-- Migrasi Fase 4: RPC pengelolaan media karantina, finalisasi scrub/signature,
-- review clearance manusia (SEC-17/19/20), dan pembersihan unggahan yatim.

-- 1. Catat intent unggahan baru di karantina (belum berisi berkas / sentinel SHA-256)
create or replace function api.create_media_upload_intent(
  p_actor_id uuid,
  p_kind text,
  p_storage_path text,
  p_mime text,
  p_bytes bigint,
  p_credit text default '',
  p_license text default '',
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text := btrim(coalesce(p_storage_path, ''));
  v_mime text := lower(btrim(coalesce(p_mime, '')));
  v_credit text := btrim(coalesce(p_credit, ''));
  v_license text := btrim(coalesce(p_license, ''));
  v_asset app.media_assets%rowtype;
begin
  if not private.is_active_admin(p_actor_id) then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  if p_kind not in ('image', 'illustration', 'pdf', 'video', 'evidence') then
    raise exception 'VALIDATION_FAILED:INVALID_MEDIA_KIND';
  end if;

  if v_mime not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'video/mp4') then
    raise exception 'VALIDATION_FAILED:UNSUPPORTED_MIME';
  end if;

  if p_bytes is null or p_bytes <= 0 then
    raise exception 'VALIDATION_FAILED:INVALID_BYTES';
  end if;

  if v_path = '' or v_path not like 'quarantine/%' or pg_catalog.strpos(v_path, '..') > 0 then
    raise exception 'VALIDATION_FAILED:INVALID_STORAGE_PATH';
  end if;

  insert into app.media_assets (
    kind,
    storage_bucket,
    storage_path,
    visibility,
    scan_status,
    checksum_sha256,
    mime,
    bytes,
    width,
    height,
    credit,
    license,
    metadata_scrubbed_at,
    created_by
  )
  values (
    p_kind,
    'media-quarantine',
    v_path,
    'private',
    'quarantine',
    pg_catalog.repeat('0', 64),
    v_mime,
    p_bytes,
    null,
    null,
    v_credit,
    v_license,
    null,
    p_actor_id
  )
  returning * into v_asset;

  perform private.write_audit(
    'admin',
    p_actor_id::text,
    'create_media_upload_intent',
    'media_asset',
    v_asset.id::text,
    p_request_id,
    'success',
    jsonb_build_object(
      'kind', v_asset.kind,
      'mime', v_asset.mime,
      'bytes', v_asset.bytes,
      'storage_path', v_asset.storage_path
    )
  );

  return jsonb_build_object(
    'id', v_asset.id,
    'kind', v_asset.kind,
    'storage_bucket', v_asset.storage_bucket,
    'storage_path', v_asset.storage_path,
    'visibility', v_asset.visibility,
    'scan_status', v_asset.scan_status,
    'checksum_sha256', v_asset.checksum_sha256,
    'mime', v_asset.mime,
    'bytes', v_asset.bytes,
    'width', v_asset.width,
    'height', v_asset.height,
    'credit', v_asset.credit,
    'license', v_asset.license,
    'metadata_scrubbed_at', v_asset.metadata_scrubbed_at,
    'created_at', v_asset.created_at
  );
end;
$$;

revoke all on function api.create_media_upload_intent(uuid, text, text, text, bigint, text, text, text) from public, anon, authenticated;
grant execute on function api.create_media_upload_intent(uuid, text, text, text, bigint, text, text, text) to service_role;

-- 2. Finalisasi aset di karantina setelah verifikasi magic bytes, ukuran nyata, & scrub gambar
create or replace function api.finalize_media_asset(
  p_actor_id uuid,
  p_asset_id uuid,
  p_storage_path text,
  p_mime text,
  p_bytes bigint,
  p_checksum_sha256 text,
  p_width integer default null,
  p_height integer default null,
  p_mark_scrubbed boolean default false,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asset app.media_assets%rowtype;
  v_path text := btrim(coalesce(p_storage_path, ''));
  v_mime text := lower(btrim(coalesce(p_mime, '')));
  v_sha text := lower(btrim(coalesce(p_checksum_sha256, '')));
begin
  if not private.is_active_admin(p_actor_id) then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  select *
  into v_asset
  from app.media_assets ma
  where ma.id = p_asset_id
  for update;

  if not found then
    raise exception 'RESOURCE_NOT_FOUND';
  end if;

  if v_asset.scan_status <> 'quarantine' then
    raise exception 'STATE_CONFLICT:NOT_IN_QUARANTINE';
  end if;

  if v_mime not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'video/mp4') then
    raise exception 'VALIDATION_FAILED:UNSUPPORTED_MIME';
  end if;

  if p_bytes is null or p_bytes <= 0 then
    raise exception 'VALIDATION_FAILED:INVALID_BYTES';
  end if;

  if v_path = '' or v_path not like 'quarantine/%' or pg_catalog.strpos(v_path, '..') > 0 then
    raise exception 'VALIDATION_FAILED:INVALID_STORAGE_PATH';
  end if;

  if v_sha !~ '^[0-9a-f]{64}$' or v_sha = pg_catalog.repeat('0', 64) then
    raise exception 'VALIDATION_FAILED:INVALID_CHECKSUM';
  end if;

  update app.media_assets
  set storage_path = v_path,
      mime = v_mime,
      bytes = p_bytes,
      checksum_sha256 = v_sha,
      width = case when p_width is not null and p_width > 0 then p_width else null end,
      height = case when p_height is not null and p_height > 0 then p_height else null end,
      metadata_scrubbed_at = case
        when coalesce(p_mark_scrubbed, false) then timezone('utc', now())
        else metadata_scrubbed_at
      end
  where id = p_asset_id
  returning * into v_asset;

  perform private.write_audit(
    'admin',
    p_actor_id::text,
    'finalize_media_asset',
    'media_asset',
    v_asset.id::text,
    p_request_id,
    'success',
    jsonb_build_object(
      'mime', v_asset.mime,
      'bytes', v_asset.bytes,
      'scrubbed', v_asset.metadata_scrubbed_at is not null
    )
  );

  return jsonb_build_object(
    'id', v_asset.id,
    'kind', v_asset.kind,
    'storage_bucket', v_asset.storage_bucket,
    'storage_path', v_asset.storage_path,
    'visibility', v_asset.visibility,
    'scan_status', v_asset.scan_status,
    'checksum_sha256', v_asset.checksum_sha256,
    'mime', v_asset.mime,
    'bytes', v_asset.bytes,
    'width', v_asset.width,
    'height', v_asset.height,
    'credit', v_asset.credit,
    'license', v_asset.license,
    'metadata_scrubbed_at', v_asset.metadata_scrubbed_at,
    'created_at', v_asset.created_at
  );
end;
$$;

revoke all on function api.finalize_media_asset(uuid, uuid, text, text, bigint, text, integer, integer, boolean, text) from public, anon, authenticated;
grant execute on function api.finalize_media_asset(uuid, uuid, text, text, bigint, text, integer, integer, boolean, text) to service_role;

-- 3. Keputusan pemeriksaan manusia atas media karantina (cleared -> publik / rejected)
create or replace function api.review_media_asset(
  p_actor_id uuid,
  p_asset_id uuid,
  p_decision text,
  p_storage_bucket text default null,
  p_storage_path text default null,
  p_credit text default null,
  p_license text default null,
  p_mark_scrubbed boolean default false,
  p_review_notes text default '',
  p_checklist jsonb default '{}'::jsonb,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asset app.media_assets%rowtype;
  v_credit text;
  v_license text;
  v_bucket text;
  v_path text;
  v_scrubbed_at timestamptz;
  v_notes text := btrim(coalesce(p_review_notes, ''));
begin
  if not private.is_active_admin(p_actor_id) then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  if p_decision not in ('cleared', 'rejected') then
    raise exception 'VALIDATION_FAILED:INVALID_DECISION';
  end if;

  select *
  into v_asset
  from app.media_assets ma
  where ma.id = p_asset_id
  for update;

  if not found then
    raise exception 'RESOURCE_NOT_FOUND';
  end if;

  if p_decision = 'cleared' then
    if v_asset.scan_status = 'rejected' then
      raise exception 'STATE_CONFLICT:ALREADY_REJECTED';
    end if;

    if v_asset.checksum_sha256 = pg_catalog.repeat('0', 64) then
      raise exception 'STATE_CONFLICT:NOT_FINALIZED';
    end if;

    v_credit := btrim(coalesce(nullif(p_credit, ''), v_asset.credit));
    v_license := btrim(coalesce(nullif(p_license, ''), v_asset.license));
    if char_length(v_credit) < 2 or char_length(v_license) < 2 then
      raise exception 'VALIDATION_FAILED:CREDIT_LICENSE_REQUIRED';
    end if;

    v_scrubbed_at := coalesce(
      v_asset.metadata_scrubbed_at,
      case when coalesce(p_mark_scrubbed, false) then timezone('utc', now()) else null end
    );
    if v_scrubbed_at is null then
      raise exception 'VALIDATION_FAILED:SCRUB_REQUIRED';
    end if;

    v_bucket := coalesce(nullif(btrim(coalesce(p_storage_bucket, '')), ''), v_asset.storage_bucket);
    v_path := coalesce(nullif(btrim(coalesce(p_storage_path, '')), ''), v_asset.storage_path);
    if v_bucket not in ('media-public', 'media-quarantine')
       or v_path = ''
       or pg_catalog.strpos(v_path, '..') > 0 then
      raise exception 'VALIDATION_FAILED:INVALID_STORAGE_PATH';
    end if;

    update app.media_assets
    set scan_status = 'cleared',
        visibility = case when v_asset.kind = 'evidence' then 'private' else 'public' end,
        storage_bucket = v_bucket,
        storage_path = v_path,
        credit = v_credit,
        license = v_license,
        metadata_scrubbed_at = v_scrubbed_at
    where id = p_asset_id
    returning * into v_asset;
  else
    if char_length(v_notes) < 5 then
      raise exception 'VALIDATION_FAILED:REASON_REQUIRED';
    end if;

    if exists (
      select 1
      from app.content_media cm
      join app.content_revisions cr on cr.id = cm.revision_id
      where cm.asset_id = p_asset_id
        and cr.status = 'published'
    ) then
      raise exception 'STATE_CONFLICT:REFERENCED_BY_PUBLISHED';
    end if;

    update app.media_assets
    set scan_status = 'rejected',
        visibility = 'private'
    where id = p_asset_id
    returning * into v_asset;
  end if;

  perform private.write_audit(
    'admin',
    p_actor_id::text,
    'review_media_asset',
    'media_asset',
    v_asset.id::text,
    p_request_id,
    'success',
    jsonb_build_object(
      'decision', p_decision,
      'kind', v_asset.kind,
      'visibility', v_asset.visibility,
      'storage_bucket', v_asset.storage_bucket,
      'checklist', coalesce(p_checklist, '{}'::jsonb),
      'notes', left(v_notes, 300)
    )
  );

  return jsonb_build_object(
    'id', v_asset.id,
    'kind', v_asset.kind,
    'storage_bucket', v_asset.storage_bucket,
    'storage_path', v_asset.storage_path,
    'visibility', v_asset.visibility,
    'scan_status', v_asset.scan_status,
    'checksum_sha256', v_asset.checksum_sha256,
    'mime', v_asset.mime,
    'bytes', v_asset.bytes,
    'width', v_asset.width,
    'height', v_asset.height,
    'credit', v_asset.credit,
    'license', v_asset.license,
    'metadata_scrubbed_at', v_asset.metadata_scrubbed_at,
    'created_at', v_asset.created_at
  );
end;
$$;

revoke all on function api.review_media_asset(uuid, uuid, text, text, text, text, text, boolean, text, jsonb, text) from public, anon, authenticated;
grant execute on function api.review_media_asset(uuid, uuid, text, text, text, text, text, boolean, text, jsonb, text) to service_role;

-- 4. Pembersih unggahan karantina yatim (intent tidak difinalisasi / kadaluwarsa)
create or replace function api.cleanup_orphan_media_uploads(
  p_actor_id uuid default null,
  p_older_than_minutes integer default 120,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_mins integer := least(greatest(coalesce(p_older_than_minutes, 120), 1), 43200);
  v_cutoff timestamptz := v_now - pg_catalog.make_interval(mins => v_mins);
  v_deleted jsonb := '[]'::jsonb;
  v_count integer := 0;
begin
  if p_actor_id is not null and not private.is_active_admin(p_actor_id) then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  with victims as (
    select ma.id
    from app.media_assets ma
    where ma.scan_status = 'quarantine'
      and ma.storage_bucket = 'media-quarantine'
      and ma.checksum_sha256 = pg_catalog.repeat('0', 64)
      and ma.created_at < v_cutoff
      and not exists (select 1 from app.content_media cm where cm.asset_id = ma.id)
      and not exists (select 1 from app.review_records rr where rr.evidence_asset_id = ma.id)
    for update skip locked
  ),
  removed as (
    delete from app.media_assets ma
    using victims v
    where ma.id = v.id
    returning ma.id, ma.storage_bucket, ma.storage_path
  )
  select
    count(*)::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'storage_bucket', r.storage_bucket,
          'storage_path', r.storage_path
        )
      ),
      '[]'::jsonb
    )
  into v_count, v_deleted
  from removed r;

  insert into private.job_runs (job_type, status, started_at, finished_at)
  values ('media_orphan_cleanup', 'succeeded', v_now, timezone('utc', now()));

  perform private.write_audit(
    case when p_actor_id is not null then 'admin' else 'system' end,
    coalesce(p_actor_id::text, 'cron'),
    'cleanup_orphan_media_uploads',
    'media_asset',
    '-',
    p_request_id,
    'success',
    jsonb_build_object('deleted_count', v_count, 'older_than_minutes', v_mins)
  );

  return jsonb_build_object(
    'deleted_count', v_count,
    'deleted_objects', v_deleted
  );
end;
$$;

revoke all on function api.cleanup_orphan_media_uploads(uuid, integer, text) from public, anon, authenticated;
grant execute on function api.cleanup_orphan_media_uploads(uuid, integer, text) to service_role;

-- === 0015_admin_external_media_rpc.sql ===
-- 0015_admin_external_media_rpc.sql
-- Dukungan media link eksternal hemat storage (YouTube, Vimeo, Google Drive, & URL HTTPS)
-- tanpa mengubah skema tabel app.media_assets.

-- 1. Daftarkan tautan media eksternal ke antrean karantina (0 byte Storage, diaudit)
create or replace function api.register_external_media_link(
  p_actor_id uuid,
  p_kind text,
  p_external_url text,
  p_mime text,
  p_checksum_sha256 text,
  p_credit text default '',
  p_license text default '',
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text := btrim(coalesce(p_external_url, ''));
  v_mime text := lower(btrim(coalesce(p_mime, '')));
  v_sha text := lower(btrim(coalesce(p_checksum_sha256, '')));
  v_credit text := btrim(coalesce(p_credit, ''));
  v_license text := btrim(coalesce(p_license, ''));
  v_asset app.media_assets%rowtype;
begin
  if not private.is_active_admin(p_actor_id) then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  if p_kind not in ('image', 'illustration', 'video', 'pdf') then
    raise exception 'VALIDATION_FAILED:INVALID_MEDIA_KIND';
  end if;

  if v_url !~ '^https://' or char_length(v_url) < 12 or char_length(v_url) > 1000 then
    raise exception 'VALIDATION_FAILED:INVALID_STORAGE_PATH';
  end if;

  if v_mime not in (
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/x-external',
    'video/mp4',
    'video/webm',
    'video/x-youtube',
    'video/x-vimeo',
    'video/x-external',
    'application/pdf'
  ) then
    raise exception 'VALIDATION_FAILED:UNSUPPORTED_MIME';
  end if;

  if v_sha !~ '^[0-9a-f]{64}$' or v_sha = pg_catalog.repeat('0', 64) then
    raise exception 'VALIDATION_FAILED:INVALID_CHECKSUM';
  end if;

  if exists (select 1 from app.media_assets ma where ma.storage_path = v_url) then
    raise exception 'VALIDATION_FAILED:URL_ALREADY_EXISTS';
  end if;

  insert into app.media_assets (
    kind,
    storage_bucket,
    storage_path,
    visibility,
    scan_status,
    checksum_sha256,
    mime,
    bytes,
    width,
    height,
    credit,
    license,
    metadata_scrubbed_at,
    created_by
  )
  values (
    p_kind,
    'external-link',
    v_url,
    'private',
    'quarantine',
    v_sha,
    v_mime,
    1,
    null,
    null,
    v_credit,
    v_license,
    null,
    p_actor_id
  )
  returning * into v_asset;

  perform private.write_audit(
    'admin',
    p_actor_id::text,
    'register_external_media_link',
    'media_asset',
    v_asset.id::text,
    p_request_id,
    'success',
    jsonb_build_object(
      'kind', v_asset.kind,
      'mime', v_asset.mime,
      'storage_bucket', v_asset.storage_bucket,
      'storage_path', left(v_asset.storage_path, 300)
    )
  );

  return jsonb_build_object(
    'id', v_asset.id,
    'kind', v_asset.kind,
    'storage_bucket', v_asset.storage_bucket,
    'storage_path', v_asset.storage_path,
    'visibility', v_asset.visibility,
    'scan_status', v_asset.scan_status,
    'checksum_sha256', v_asset.checksum_sha256,
    'mime', v_asset.mime,
    'bytes', v_asset.bytes,
    'width', v_asset.width,
    'height', v_asset.height,
    'credit', v_asset.credit,
    'license', v_asset.license,
    'metadata_scrubbed_at', v_asset.metadata_scrubbed_at,
    'created_at', v_asset.created_at
  );
end;
$$;

revoke all on function api.review_media_asset(uuid, uuid, text, text, text, text, text, boolean, text, jsonb, text) from public, anon, authenticated;
grant execute on function api.review_media_asset(uuid, uuid, text, text, text, text, text, boolean, text, jsonb, text) to service_role;

revoke all on function api.register_external_media_link(uuid, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function api.register_external_media_link(uuid, text, text, text, text, text, text, text) to service_role;

-- 2. Perbarui api.review_media_asset agar mendukung bucket 'external-link'
create or replace function api.review_media_asset(
  p_actor_id uuid,
  p_asset_id uuid,
  p_decision text,
  p_storage_bucket text default null,
  p_storage_path text default null,
  p_credit text default null,
  p_license text default null,
  p_mark_scrubbed boolean default false,
  p_review_notes text default '',
  p_checklist jsonb default '{}'::jsonb,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asset app.media_assets%rowtype;
  v_credit text;
  v_license text;
  v_bucket text;
  v_path text;
  v_scrubbed_at timestamptz;
  v_notes text := btrim(coalesce(p_review_notes, ''));
begin
  if not private.is_active_admin(p_actor_id) then
    raise exception 'ACTION_NOT_ALLOWED';
  end if;

  if p_decision not in ('cleared', 'rejected') then
    raise exception 'VALIDATION_FAILED:INVALID_DECISION';
  end if;

  select *
  into v_asset
  from app.media_assets ma
  where ma.id = p_asset_id
  for update;

  if not found then
    raise exception 'RESOURCE_NOT_FOUND';
  end if;

  if p_decision = 'cleared' then
    if v_asset.scan_status = 'rejected' then
      raise exception 'STATE_CONFLICT:ALREADY_REJECTED';
    end if;

    if v_asset.checksum_sha256 = pg_catalog.repeat('0', 64) then
      raise exception 'STATE_CONFLICT:NOT_FINALIZED';
    end if;

    v_credit := btrim(coalesce(nullif(p_credit, ''), v_asset.credit));
    v_license := btrim(coalesce(nullif(p_license, ''), v_asset.license));
    if char_length(v_credit) < 2 or char_length(v_license) < 2 then
      raise exception 'VALIDATION_FAILED:CREDIT_LICENSE_REQUIRED';
    end if;

    v_scrubbed_at := coalesce(
      v_asset.metadata_scrubbed_at,
      case when coalesce(p_mark_scrubbed, false) then timezone('utc', now()) else null end
    );
    if v_scrubbed_at is null then
      raise exception 'VALIDATION_FAILED:SCRUB_REQUIRED';
    end if;

    v_bucket := coalesce(nullif(btrim(coalesce(p_storage_bucket, '')), ''), v_asset.storage_bucket);
    v_path := coalesce(nullif(btrim(coalesce(p_storage_path, '')), ''), v_asset.storage_path);
    if v_bucket not in ('media-public', 'media-quarantine', 'external-link')
       or v_path = ''
       or (v_bucket = 'external-link' and v_path !~ '^https://')
       or (v_bucket <> 'external-link' and pg_catalog.strpos(v_path, '..') > 0) then
      raise exception 'VALIDATION_FAILED:INVALID_STORAGE_PATH';
    end if;

    update app.media_assets
    set scan_status = 'cleared',
        visibility = case when v_asset.kind = 'evidence' then 'private' else 'public' end,
        storage_bucket = v_bucket,
        storage_path = v_path,
        credit = v_credit,
        license = v_license,
        metadata_scrubbed_at = v_scrubbed_at
    where id = p_asset_id
    returning * into v_asset;
  else
    if char_length(v_notes) < 5 then
      raise exception 'VALIDATION_FAILED:REASON_REQUIRED';
    end if;

    if exists (
      select 1
      from app.content_media cm
      join app.content_revisions cr on cr.id = cm.revision_id
      where cm.asset_id = p_asset_id
        and cr.status = 'published'
    ) then
      raise exception 'STATE_CONFLICT:REFERENCED_BY_PUBLISHED';
    end if;

    update app.media_assets
    set scan_status = 'rejected',
        visibility = 'private'
    where id = p_asset_id
    returning * into v_asset;
  end if;

  perform private.write_audit(
    'admin',
    p_actor_id::text,
    'review_media_asset',
    'media_asset',
    v_asset.id::text,
    p_request_id,
    'success',
    jsonb_build_object(
      'decision', p_decision,
      'kind', v_asset.kind,
      'visibility', v_asset.visibility,
      'storage_bucket', v_asset.storage_bucket,
      'checklist', coalesce(p_checklist, '{}'::jsonb),
      'notes', left(v_notes, 300)
    )
  );

  return jsonb_build_object(
    'id', v_asset.id,
    'kind', v_asset.kind,
    'storage_bucket', v_asset.storage_bucket,
    'storage_path', v_asset.storage_path,
    'visibility', v_asset.visibility,
    'scan_status', v_asset.scan_status,
    'checksum_sha256', v_asset.checksum_sha256,
    'mime', v_asset.mime,
    'bytes', v_asset.bytes,
    'width', v_asset.width,
    'height', v_asset.height,
    'credit', v_asset.credit,
    'license', v_asset.license,
    'metadata_scrubbed_at', v_asset.metadata_scrubbed_at,
    'created_at', v_asset.created_at
  );
end;
$$;

revoke all on function api.review_media_asset(uuid, uuid, text, text, text, text, text, boolean, text, jsonb, text) from public, anon, authenticated;
grant execute on function api.review_media_asset(uuid, uuid, text, text, text, text, text, boolean, text, jsonb, text) to service_role;

-- === 0016_admin_quiz_rpcs.sql ===
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

-- === 0017_admin_people_rpcs.sql ===
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
