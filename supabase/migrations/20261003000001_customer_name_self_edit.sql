-- 依頼主の「名前」の自己変更を、初回だけでなくいつでも自由にできるようにする。
-- これまでは customers_self_set_name_once が「プレースホルダーからの1回だけ」
-- しか許可しておらず、2回目以降はトーク経由で受付に依頼する運用だった。
-- 書類の宛名が勝手に動かないようにする目的だったが、staff_alias（スタッフ）
-- と同じ発想で、本人が自由に変えられる name とは別に、本部・マネージャーが
-- 社内向け（書類の宛名など）に付ける staff_label を独立して持たせることで
-- 両立させる。staff_label があればそれを、無ければ name を使う。
alter table customers add column if not exists staff_label text;

drop policy if exists customers_self_set_name_once on customers;
create policy customers_self_update on customers for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
