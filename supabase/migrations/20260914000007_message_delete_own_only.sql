-- 非表示(hidden_at)機能は不要になったので撤去し、削除を「自分が送った
-- メッセージだけ」に絞った上で、削除後もその場に小さく「削除されました」
-- と出せるように、行を消さず deleted_at を立てるだけの soft delete にする。

drop policy if exists messages_office_manage on messages;
drop policy if exists messages_office_delete on messages;

alter table messages drop column if exists hidden_at;
alter table messages add column if not exists deleted_at timestamptz;

-- 自分が送ったメッセージだけ、自分で削除（deleted_at を立てる）できる。
create policy messages_sender_delete on messages for update using (
  sender_id = auth.uid()
) with check (
  sender_id = auth.uid()
);
