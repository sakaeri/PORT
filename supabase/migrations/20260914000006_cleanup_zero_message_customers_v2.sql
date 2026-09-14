-- 前回(20260914000005)の掃除は「member_no が NULL の依頼主」だけを対象にしていたが、
-- 今回の修正が入る前に作られた依頼主は既に member_no が採番済み（例: C-000130 など）のまま
-- 一度もメッセージを送っていなかったため、前回の掃除条件では消えなかった。
-- ここでは member_no の有無に関係なく、「一度もメッセージが無いスレッドしか持っていない
-- 依頼主」を対象にやり直す（事業者に変換済み・実際にやり取りのある依頼主は必ずメッセージが
-- あるので対象にならない）。

delete from customers c
where not exists (
  select 1 from threads t join messages m on m.thread_id = t.id where t.customer_id = c.id
);
