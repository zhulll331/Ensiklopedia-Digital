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
