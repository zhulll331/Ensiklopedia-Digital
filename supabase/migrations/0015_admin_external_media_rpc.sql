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
