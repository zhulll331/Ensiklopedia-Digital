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
