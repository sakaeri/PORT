-- 完了報告の「誰が書いたか」（creator_id）を、使われなくなった creators 表ではなく
-- profiles（ログインしているスタッフ本人）につなぎ直す。
-- アプリは profiles の id を入れているが、creators を指したままだったため、
-- creators に行の無いスタッフ（＝今の全員）が報告すると保存に失敗していた。

alter table completion_reports drop constraint if exists completion_reports_creator_id_fkey;

-- これまでの行で creators の id が入っているものは、その人の profiles の id に置き換える。
update completion_reports r
set creator_id = c.profile_id
from creators c
where r.creator_id = c.id;

-- どちらにも当てはまらない値は消しておく（つなぎ直しで弾かれないように）。
update completion_reports
set creator_id = null
where creator_id is not null
  and not exists (select 1 from profiles p where p.id = completion_reports.creator_id);

alter table completion_reports
  add constraint completion_reports_creator_id_fkey
  foreign key (creator_id) references profiles(id) on delete set null;

notify pgrst, 'reload schema';
