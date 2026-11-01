-- ログインをメールのリンク（または同じメールの数字）だけにしたので、これまでに
-- 設定されたパスワードを誰も知らないランダムな値に置き換えて、使えなくする。
-- （Supabase にはパスワードを消す操作がないため。ログイン中の人はそのまま使える。）
-- ※ 本番では、新しいログイン方法でスタッフアプリに入れることを確認してから実行する。
update auth.users
set encrypted_password = extensions.crypt(encode(extensions.gen_random_bytes(32), 'base64'), extensions.gen_salt('bf')),
    raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) - 'has_password'
where coalesce(encrypted_password, '') <> '';
