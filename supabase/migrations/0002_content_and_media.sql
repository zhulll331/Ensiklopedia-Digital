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
