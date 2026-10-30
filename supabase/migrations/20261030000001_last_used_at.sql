-- 受付メニュー・返信テンプレを「最近使った順」に並べるための日時。
-- 作った時点で now()（＝一番上）になり、見積もりやトークで使うたびに更新する。
-- 使われなくなったものは、ほかが更新されていくにつれて自然に下へ下がる。

alter table menus add column if not exists last_used_at timestamptz not null default now();
alter table intake_forms add column if not exists last_used_at timestamptz not null default now();

-- 今あるものは、これまでに実際に使った日で埋める（一度も使っていないものは一番下）。
update menus m
set last_used_at = coalesce(
  (select max(r.created_at) from request_items ri join requests r on r.id = ri.request_id where ri.menu_id = m.id),
  '2000-01-01'::timestamptz
);

update intake_forms f
set last_used_at = coalesce(
  (select max(msg.sent_at)
     from messages msg join threads t on t.id = msg.thread_id
    where t.org_id = f.org_id and msg.kind = 'intake_request' and msg.payload->>'formLabel' = f.label),
  '2000-01-01'::timestamptz
);

create index if not exists menus_org_last_used_idx on menus (org_id, last_used_at desc);
create index if not exists intake_forms_org_last_used_idx on intake_forms (org_id, last_used_at desc);

notify pgrst, 'reload schema';
