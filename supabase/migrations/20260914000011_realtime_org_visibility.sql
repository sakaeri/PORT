-- 受付側のトーク画面が「開いたまま新着を待つ」リアルタイム更新でだけ新着を
-- 拾えなかった原因: postgres_changes はブラウザの WebSocket 経由で届くため、
-- 通常のAPIリクエストのようにカスタムヘッダー(x-vid-org)を付けられない
-- （ライブラリ側で明示的に「WebSocketにヘッダーは付けられない」仕様）。
-- そのため auth_org() はヘッダーを読めず、必ずプロフィールの「本来の
-- 事業所」にフォールバックする。マルチ事業所スタッフ（今ログイン中の
-- 事業所が本来の事業所と違う）だと、そのフォールバック先が違う事業所に
-- なってしまい、messages_read/threads_read の「org_id = auth_org()」の
-- 時点で弾かれ、新着イベントが黙って捨てられていた。
--
-- 直接の初回読み込み(SSR/REST)はヘッダーが正しく飛ぶので今まで気づかな
-- かった。受付(is_office)の可視範囲だけ、「今選んでいる事業所と一致するか」
-- ではなく「その行の事業所のスタッフとして正式に権限があるか」で判定する
-- is_staff_of() に切り替え、ヘッダーの有無に左右されないようにする。
-- 依頼主・制作者側の可視範囲（my_customer_id()/my_creator_id() 経由）は
-- そのままヘッダー依存のままで変更していない。

create or replace function is_staff_of(target_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles where id = auth.uid() and org_id = target_org and role in ('owner','reception')
  ) or exists (
    select 1 from staff_org_links where user_id = auth.uid() and org_id = target_org and role in ('owner','reception')
  )
$$;

drop policy if exists threads_read on threads;
create policy threads_read on threads for select using (
  is_staff_of(org_id)
  or (org_id = auth_org() and (
    (kind = 'customer' and customer_id = my_customer_id())
    or (kind in ('case','internal') and (
         creator_id = my_creator_id()
         or exists (select 1 from requests r where r.id = threads.request_id and r.creator_id = my_creator_id())))
  ))
);

drop policy if exists messages_read on messages;
create policy messages_read on messages for select using (
  exists (
    select 1 from threads t
    where t.id = messages.thread_id
      and (
        is_staff_of(t.org_id)
        or (t.org_id = auth_org() and (
          (t.kind = 'customer' and t.customer_id = my_customer_id())
          or (t.kind in ('case','internal') and (
                t.creator_id = my_creator_id()
                or exists (select 1 from requests r where r.id = t.request_id and r.creator_id = my_creator_id())
          ))
        ))
      )
  )
);
