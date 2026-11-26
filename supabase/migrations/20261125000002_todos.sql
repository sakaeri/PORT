-- 「今日やること」に並べる、トークから手で入れるやること。
-- 窓口だけの運用にしたので、案件（requests）から作っていた一覧の代わりに使う。
-- 見える・触れる範囲は、そのトークが見える人（担当者は自分の担当窓口のトークだけ）。

create table if not exists todos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  thread_id uuid not null references threads(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  due_date date not null default ((now() at time zone 'Asia/Tokyo')::date),
  done_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists todos_org_due_idx on todos (org_id, due_date) where done_at is null;
create index if not exists todos_thread_idx on todos (thread_id);

alter table todos enable row level security;

drop policy if exists todos_staff on todos;
create policy todos_staff on todos for all
  using (is_staff_of(org_id) and exists (select 1 from threads t where t.id = todos.thread_id and t.org_id = todos.org_id))
  with check (is_staff_of(org_id) and exists (select 1 from threads t where t.id = todos.thread_id and t.org_id = todos.org_id));

notify pgrst, 'reload schema';
