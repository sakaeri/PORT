-- 依頼主だけが複数の事業所（org）の顧客になれるようにする。
-- スタッフ（受付・制作者）は今まで通り1人1事業所のまま、一切変更しない。
--
-- 仕組み: アクセスされたサブドメイン（organizations.domain）から「今どの事業所の
-- 画面を見ているか」を求め、Next.js 側がその org_id を毎リクエスト x-vid-org という
-- HTTPヘッダーで送る。Supabase（PostgREST）はリクエストヘッダーを
-- current_setting('request.headers', true) として RLS から読めるので、
-- auth_org() をこのヘッダー優先・プロフィール後方互換フォールバックに書き換える。
-- ヘッダーを送らないアクセス（＝別アプリのスタッフ用画面）は今まで通りプロフィール基準のまま動く。

-- ============================================================
-- 1. 事業所ごとの区別: 独自ドメイン（将来の大口向け）と、URLパスの合言葉（既定）
-- ============================================================
alter table organizations add column if not exists domain text unique;
alter table organizations add column if not exists slug text unique
  check (slug is null or slug <> 'auth'); -- /auth/confirm と衝突させない

-- ドメイン→org_id の変換。ログイン前の匿名ユーザーでも呼べる必要があるため
-- security definer にして誰でも実行可にする（返すのは id だけで機微情報なし）。
-- 一致するドメインがなければ app_config.default_org_id にフォールバックする
-- （今までの「1事業所だけ」の動かし方や、ローカル開発・プレビューURLはこれで動く）。
create or replace function org_id_by_domain(p_domain text) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select id from organizations where domain = p_domain),
    default_org_id()
  )
$$;
grant execute on function org_id_by_domain(text) to anon, authenticated;

-- URLの先頭パス（例: port.example.com/a-company の "a-company"）→ org_id。
-- 一致しなければ null を返す（ドメイン判定にフォールバックさせるため、ここでは
-- デフォルト事業所にはフォールバックしない）。新しい事業所を増やすのに
-- Vercel・DNSを一切触らず、この1行を足すだけで済むようにするための仕組み。
create or replace function org_id_by_slug(p_slug text) returns uuid
language sql stable security definer set search_path = public as $$
  select id from organizations where slug = p_slug
$$;
grant execute on function org_id_by_slug(text) to anon, authenticated;

-- ============================================================
-- 2. auth_org() をヘッダー優先に書き換える（ヘッダーがなければ今まで通り）
-- ============================================================
create or replace function current_request_org() returns uuid
language sql stable as $$
  select nullif(current_setting('request.headers', true)::json->>'x-vid-org', '')::uuid
$$;

create or replace function auth_org() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    current_request_org(),
    (select org_id from profiles where id = auth.uid())
  )
$$;

-- ============================================================
-- 3. 依頼主は1事業所につき1行まで（同じ組み合わせを重複させない）
-- ============================================================
alter table customers add constraint customers_profile_org_unique unique (profile_id, org_id);

-- my_customer_id() を「今の事業所での自分の顧客行」に限定する。
-- auth_org() が上のヘッダー機構で正しい事業所を返すようになったので、
-- 1人が複数の customers 行を持っていても常に1行だけに絞り込める。
create or replace function my_customer_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from customers where profile_id = auth.uid() and org_id = auth_org()
$$;

-- ============================================================
-- 4. 自分が顧客になっている事業所の一覧（マイページの「会社の履歴」用）
-- ============================================================
create or replace function my_companies() returns table(org_id uuid, display_name text, domain text, slug text)
language sql stable security definer set search_path = public as $$
  select o.id, o.display_name, o.domain, o.slug
  from organizations o
  join customers c on c.org_id = o.id
  where c.profile_id = auth.uid()
  order by o.display_name
$$;
grant execute on function my_companies() to authenticated;

-- ============================================================
-- 5. handle_new_customer トリガーを profiles の作成だけに縮小する。
--    customers/threads の作成は Next.js 側（getCustomerContext）に移す。
--    理由: このトリガーは auth.users への insert（＝ signInAnonymously）から
--    直接呼ばれ、Supabase Auth 経由のためどの事業所のドメインから来たかを
--    知る手段がない。一方 Next.js 側は毎リクエスト現在の事業所が分かっているので、
--    「まだこの事業所の customers 行がなければ作る」を一本化した方が安全で単純。
-- ============================================================
create or replace function handle_new_customer() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  target_org uuid;
begin
  if coalesce(new.is_anonymous, false) is not true then
    return new; -- スタッフ等の通常アカウントはここでは作らない（別途 admin が作成）
  end if;

  target_org := default_org_id();
  if target_org is null then
    raise exception 'app_config.default_org_id が未設定です';
  end if;

  insert into profiles (id, org_id, role, display_name)
  values (new.id, target_org, 'client', 'ゲスト依頼主')
  on conflict (id) do nothing;

  return new;
end $$;

-- ============================================================
-- 6. 依頼主が「今の事業所」に初めて来た時、その場で customers/threads 行を作る。
--    on conflict で安全に何度呼んでも1行にまとまる（Server Component の
--    再実行・並行呼び出し対策）。
-- ============================================================
create or replace function ensure_customer_for_org(p_org_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  result_id uuid;
  new_thread_id uuid;
begin
  select id into result_id from customers where profile_id = auth.uid() and org_id = p_org_id;
  if result_id is not null then
    return result_id;
  end if;

  insert into customers (org_id, profile_id, name, member_no)
  values (p_org_id, auth.uid(), '未登録の依頼主', 'C-' || lpad(nextval('customer_no_seq')::text, 6, '0'))
  on conflict (profile_id, org_id) do nothing
  returning id into result_id;

  if result_id is null then
    -- 同時アクセスで他方が先に作った場合はそれを使う
    select id into result_id from customers where profile_id = auth.uid() and org_id = p_org_id;
  else
    insert into threads (org_id, kind, customer_id, last_msg_at)
    values (p_org_id, 'customer', result_id, now());
  end if;

  return result_id;
end $$;
grant execute on function ensure_customer_for_org(uuid) to authenticated;
