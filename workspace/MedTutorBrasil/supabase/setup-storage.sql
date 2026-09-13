-- Execute uma vez no SQL Editor do projeto Supabase.
-- Este bucket permanece privado: as imagens clínicas nunca recebem acesso público.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'materiais-estudo',
  'materiais-estudo',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "MedTutor: inserir imagens próprias" on storage.objects;
create policy "MedTutor: inserir imagens próprias"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'materiais-estudo'
  and owner_id = (select auth.uid())
);

drop policy if exists "MedTutor: ler imagens próprias" on storage.objects;
create policy "MedTutor: ler imagens próprias"
on storage.objects for select to authenticated
using (
  bucket_id = 'materiais-estudo'
  and owner_id = (select auth.uid())
);

drop policy if exists "MedTutor: atualizar imagens próprias" on storage.objects;
create policy "MedTutor: atualizar imagens próprias"
on storage.objects for update to authenticated
using (
  bucket_id = 'materiais-estudo'
  and owner_id = (select auth.uid())
)
with check (
  bucket_id = 'materiais-estudo'
  and owner_id = (select auth.uid())
);

drop policy if exists "MedTutor: remover imagens próprias" on storage.objects;
create policy "MedTutor: remover imagens próprias"
on storage.objects for delete to authenticated
using (
  bucket_id = 'materiais-estudo'
  and owner_id = (select auth.uid())
);
