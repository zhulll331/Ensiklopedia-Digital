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
