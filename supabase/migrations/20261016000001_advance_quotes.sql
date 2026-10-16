-- 立替（実費の支払い代行）の見積もり。
--
-- advance_amount   : 見積もり額のうちの実費（航空券代など）。売上・実績には含めず、
--                    手数料（amount - advance_amount）だけを計上する。通常の見積もりは null。
-- quote_expires_at : 見積もりの有効期限。予約サイトの支払い画面が打ち切られて値段が
--                    変わる前に承諾してもらうためのもの。過ぎたら承諾（支払い）できない。

alter table requests add column if not exists advance_amount integer;
alter table requests add column if not exists quote_expires_at timestamptz;

-- 期限切れの見積もりは、画面を開きっぱなしで押されても通らないよう DB で拒否する。
-- pay_request_from_balance が phase を quoted から進める update で発火し、
-- 例外で残高の引き落としごと取り消される。見送り・キャンセルは期限後でもできる。
create or replace function reject_expired_quote() returns trigger
language plpgsql as $$
begin
  if old.phase = 'quoted'
     and new.phase not in ('quoted', 'cancelled', 'declined')
     and old.quote_expires_at is not null
     and old.quote_expires_at < now() then
    raise exception '見積もりの有効期限が切れています。担当者に再見積もりをご依頼ください';
  end if;
  return new;
end $$;

drop trigger if exists requests_reject_expired_quote on requests;
create trigger requests_reject_expired_quote
  before update of phase on requests
  for each row execute function reject_expired_quote();
