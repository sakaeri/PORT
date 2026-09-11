-- PORT自身を運営する事業所を1つだけ区別するための印。
-- true の事業所は「売上・実績」画面が見積ベースの集計ではなく、
-- PORTに登録している事業所数とその基本料・席数から算出される
-- PORT自身の売上を表示するモードになる。
alter table organizations add column if not exists is_hq boolean not null default false;
