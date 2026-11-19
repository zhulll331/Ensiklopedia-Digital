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
