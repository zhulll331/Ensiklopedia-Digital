-- DATA SAMPEL NON-PRODUKSI (untuk pengembangan UI dan pengujian tahap awal).
-- Jangan dipakai sebagai naskah ilmiah final sebelum kurasi ahli arkeologi & bahasa.

insert into app.site_settings (key, value_json)
values
  ('hero_title', '"Menjelajah Jejak Megalitik Banyuwangi"'::jsonb),
  ('hero_subtitle', '"Pelajari warisan batu leluhur di Banyuwangi lewat bacaan ramah anak untuk kelas III dan IV SD."'::jsonb),
  ('hero_slogan', '"Kenali, Jaga, Lestarikan"'::jsonb),
  ('contact_org_name', '"[Nama Pengelola Resmi — belum diisi]"'::jsonb),
  ('contact_email', '"[Email Kontak Privasi — belum diisi]"'::jsonb)
on conflict (key) do nothing;
