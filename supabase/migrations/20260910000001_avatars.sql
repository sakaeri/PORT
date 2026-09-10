-- プロフィール画像用の Storage バケット。
-- パスは "<auth.uid()>/<uuid>-<filename>" とし、本人だけが書き込める。
-- 画像自体はトーク相手に見せる目的のもので機微情報ではないため公開バケットにする
-- （getPublicUrl をそのまま <img> に使えるようにするため。署名URLの発行は不要）。
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects for select using (bucket_id = 'avatars');

drop policy if exists avatars_write on storage.objects;
create policy avatars_write on storage.objects for insert with check (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists avatars_update on storage.objects;
create policy avatars_update on storage.objects for update using (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists avatars_delete on storage.objects;
create policy avatars_delete on storage.objects for delete using (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
);
