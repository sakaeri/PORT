-- 問い合わせ窓口：他社サービス（TeeRA など）のお問い合わせを中央秘書が
-- 一時的に引き受けるための入口。/<slug>（例：/teera）から入った人のトークは
-- 窓口ごとの部署（「問い合わせ：TeeRA」）に振り分けられ、依頼主側はチャット
-- だけの画面になる。外販用の事業所（organizations）とは別物で、あくまで
-- 1つの事業所の中に入口を足すだけ。
--
-- 止めたいときは active を false にする（新しい問い合わせを受け付けなくなる
-- だけで、過去のトークはそのまま残る）。削除はしない運用。

create table if not exists inquiry_desks (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  name          text not null,
  slug          text not null unique,
  department_id uuid references departments(id) on delete set null,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists inquiry_desks_org_idx on inquiry_desks (org_id);
alter table inquiry_desks enable row level security;

-- 本部画面の一覧用。作成・切替はサーバー側（service role）で行う。
drop policy if exists inquiry_desks_read on inquiry_desks;
create policy inquiry_desks_read on inquiry_desks for select using (is_staff_of(org_id));

-- proxy.ts が URL の先頭（/teera）から窓口を引くためのもの。ログイン前でも呼ぶ。
create or replace function desk_by_slug(p_slug text)
returns table(id uuid, org_id uuid, name text, active boolean)
language sql stable security definer set search_path = public as $$
  select d.id, d.org_id, d.name, d.active from inquiry_desks d where d.slug = p_slug
$$;
grant execute on function desk_by_slug(text) to anon, authenticated;

-- 窓口から入った人のトークを、その窓口の部署に振り分ける。まだ一度も
-- 書き込んでいない（member_no が未採番の）トークだけが対象なので、すでに
-- 中央秘書でやり取りしている人のトークが勝手に移ることはない。
-- 最初の挨拶文も窓口用に差し替える。何度呼んでも同じ結果になる。
create or replace function claim_desk_thread(p_desk_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  d inquiry_desks%rowtype;
  t_id uuid;
begin
  select * into d from inquiry_desks where id = p_desk_id;
  if not found or not d.active or d.department_id is null then
    return;
  end if;

  select t.id into t_id
  from customers c
  join threads t on t.customer_id = c.id and t.kind = 'customer'
  where c.profile_id = auth.uid() and c.org_id = d.org_id and c.member_no is null
  limit 1;
  if t_id is null then
    return;
  end if;

  update threads set department_id = d.department_id
  where id = t_id and department_id is distinct from d.department_id;

  update messages
  set body = d.name || 'のお問い合わせ窓口です。' || chr(10) || 'ご用件をこちらのチャットでお送りください。'
  where thread_id = t_id and sender_id is null and sender_role is null and kind = 'text';
end $$;
grant execute on function claim_desk_thread(uuid) to authenticated;
