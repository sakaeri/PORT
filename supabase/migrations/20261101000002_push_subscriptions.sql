-- プッシュ通知の宛先（ブラウザ・端末ごと）。お客さんアプリとスタッフアプリの両方で使う。
-- 本人が許可した端末を登録し、送るときはサーバー（service role）が読む。
create table if not exists push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on push_subscriptions (user_id);
alter table push_subscriptions enable row level security;

drop policy if exists push_subscriptions_own on push_subscriptions;
create policy push_subscriptions_own on push_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

notify pgrst, 'reload schema';
