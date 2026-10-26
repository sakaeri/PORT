-- 依頼主が評価できるのは自分の依頼だけにする（前は request_id を確かめて
-- いなかったので、他人の依頼に先に評価を入れて、本人が評価できなくする
-- ことができた。ratings は request_id ごとに1件まで）。
drop policy if exists ratings_insert on ratings;
create policy ratings_insert on ratings for insert with check (
  customer_id = my_customer_id()
  and exists (select 1 from requests r where r.id = request_id and r.customer_id = my_customer_id())
);
