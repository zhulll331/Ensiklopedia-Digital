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
