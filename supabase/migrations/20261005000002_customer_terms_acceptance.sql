-- 個別の契約書を交わさない分、ログイン（新規登録）の際に利用規約への
-- 同意を必須にして記録しておく。既存の依頼主はnullのままでよい
-- （遡って同意を取り直すことはしない）。
alter table customers add column if not exists terms_accepted_at timestamptz;
