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
