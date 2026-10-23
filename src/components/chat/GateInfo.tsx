"use client";

import { useState } from "react";
import { X, ListNumbers, Coins, Question, MagnifyingGlass } from "@phosphor-icons/react";
import { headingWeight } from "@/lib/style";
import { TASK_EXAMPLES, TASK_READINGS } from "@/lib/task-examples";

// ログイン前の入口画面（AccountGate）の下に並べる、サービス紹介の3つのボタン。
// 画面自体には説明文を置かず、見たい人だけがポップアップで開ける形にする。
// 文面は利用規約（/terms の DEFAULT_TERMS_CONTENT）と食い違わない範囲に留める。
type Topic = "tasks" | "howto" | "pricing" | "faq";

const TOPICS: { id: Topic; label: string; Icon: typeof Question }[] = [
  { id: "tasks", label: "頼めること", Icon: MagnifyingGlass },
  { id: "howto", label: "利用方法", Icon: ListNumbers },
  { id: "pricing", label: "料金形態", Icon: Coins },
  { id: "faq", label: "よくあるご質問", Icon: Question },
];

const STEPS = [
  { title: "トークでご相談", body: "やってほしいことを、チャットでそのままお送りください。" },
  { title: "担当秘書を選任", body: "ご相談の内容に合わせて担当秘書がつき、その後のやり取りを担当します。" },
  { title: "お見積り", body: "内容を確認し、金額と目安をトーク上でお送りします。" },
  { title: "ご依頼の確定", body: "内容にご納得いただけたら、チャージ残高からお支払いいただき、作業に着手します。" },
  { title: "完了のご報告", body: "作業が終わると、トーク上に完了報告が届きます。" },
];

const PRICING = [
  { title: "1案件 3,000円〜", body: "料金はご依頼の内容に応じて、その都度お見積りします。ご登録は無料です。" },
  { title: "チャージ残高からお支払い", body: "あらかじめクレジットカードで残高をチャージし、ご依頼の確定時にその残高からお支払いいただきます。自動チャージも設定できます。" },
  { title: "ご依頼の確定前なら費用はかかりません", body: "見積もりを見てから見送ることもできます。ご依頼の確定後のキャンセル・返金については利用規約をご確認ください。" },
];

const FAQ = [
  { q: "どんなことを頼めますか？", a: "調べもの、資料の作成、各種手配など、事務まわりのちょっとした頼みごとからお気軽にご相談ください。お受けできない内容の場合は、見積もりの前にお伝えします。" },
  { q: "自社サービスのお問い合わせ窓口もお願いできますか？", a: "はい。御社サービス専用のお問い合わせチャットをご用意し、秘書がお客さまに対応します。キャンペーン中だけなど、期間限定の窓口にも対応しています。" },
  { q: "単発だけでも頼めますか？", a: "はい。1回だけのご依頼も、毎月など定期的なご依頼も、同じトークからご相談いただけます。" },
  { q: "見積もりを見てから断れますか？", a: "はい。ご依頼の確定前であれば、いつでも見送ることができ、費用はかかりません。" },
  { q: "担当秘書は変えてもらえますか？", a: "はい。マイページの「ご意見・ご要望」からお知らせください。担当秘書には共有されず、運営に直接届きます。" },
  { q: "電話やオンラインで相談できますか？", a: "ご依頼は基本的にチャットで承っています。込み入ったご相談は、ZoomやGoogle Meetでのオンライン打ち合わせも可能です（内容の確認のため、録画させていただく場合があります）。" },
  { q: "同時にいくつまで頼めますか？", a: "同時に進められるご依頼は3件までです。" },
  { q: "支払い方法は？", a: "クレジットカードで残高をチャージし、その残高からお支払いいただきます。" },
];

const scrim: React.CSSProperties = { position: "fixed", inset: 0, background: "var(--stb-scrim)", zIndex: 50, display: "grid", placeItems: "center", padding: "var(--space-4)" };
// 見出しと✕は固定して、中身だけをスクロールさせる。スマホでは画面の上下に
// 余白を残し（ブラウザのツールバー分も考えて dvh で測る）、画面いっぱいに
// 張り付かないようにする。
const dialogBox: React.CSSProperties = {
  width: "min(420px, 100%)",
  maxHeight: "min(640px, calc(100dvh - 96px))",
  overflow: "hidden",
  position: "relative",
  display: "flex",
  flexDirection: "column",
  borderRadius: "var(--radius-lg)",
  background: "var(--color-surface)",
  color: "var(--color-text)",
  boxShadow: "var(--shadow-lg)",
};

// 各項目の見出しを帯にして、どこからどこまでが1つの話かを一目で分かるようにする。
const band: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "7px 12px",
  borderRadius: "var(--radius-md)",
  fontSize: 13.5,
  color: "var(--color-accent-100)",
  background: "var(--color-accent-900)",
  borderLeft: "3px solid var(--color-accent)",
};
const badge: React.CSSProperties = {
  flex: "none",
  minWidth: 20,
  height: 20,
  padding: "0 5px",
  display: "grid",
  placeItems: "center",
  borderRadius: 10,
  fontSize: 11,
  color: "var(--color-bg)",
  background: "var(--color-accent)",
};
const bodyText: React.CSSProperties = { padding: "0 4px 0 12px", fontSize: 13, lineHeight: 1.75, color: "var(--color-neutral-400)" };

function Section({ mark, title, body }: { mark?: string; title: string; body: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={band}>
        {mark && <span style={badge}>{mark}</span>}
        <span>{title}</span>
      </div>
      <div style={bodyText}>{body}</div>
    </div>
  );
}

// ひらがな・カタカナ、大文字・小文字、全角・半角の違いを気にせず探せるようにそろえる。
function normalize(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/\s+/g, "");
}

// 入力そのものに加えて、読み仮名の表から漢字に置き換えた語でも探す（「よや」→「予約」）。
function searchTerms(q: string): string[] {
  if (!q) return [];
  const terms = new Set([q]);
  for (const [reading, word] of TASK_READINGS) {
    if (q.length >= 2 && reading.startsWith(q)) terms.add(normalize(word));
    else if (q.includes(reading)) terms.add(q.replace(reading, normalize(word)));
  }
  return [...terms];
}

function TaskList() {
  const [query, setQuery] = useState("");
  const terms = searchTerms(normalize(query));
  const hit = (s: string) => terms.some((t) => normalize(s).includes(t));
  const groups = TASK_EXAMPLES.map((g) => ({
    category: g.category,
    items: terms.length && !hit(g.category) ? g.items.filter(hit) : g.items,
  })).filter((g) => g.items.length > 0);

  return (
    <>
      {/* 下へスクロールしても検索欄は上に残す */}
      <div style={{ position: "sticky", top: -16, zIndex: 1, margin: "-16px 0 -6px", padding: "16px 0 10px", background: "var(--color-surface)" }}>
        <MagnifyingGlass size={15} color="var(--color-neutral-500)" style={{ position: "absolute", left: 11, top: 27 }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="例：予約、請求書、SNS"
          className="vid-input"
          style={{ width: "100%", height: 38, padding: "0 12px 0 32px", fontSize: 13.5, color: "var(--color-text)", background: "var(--color-bg)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)", outline: "none" }}
        />
      </div>
      {groups.length === 0 ? (
        <div style={{ ...bodyText, padding: "4px 4px 8px" }}>ここにないことも、まずはトークでお気軽にご相談ください。</div>
      ) : (
        groups.map((g) => (
          <div key={g.category} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={band}>{g.category}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "0 2px" }}>
              {g.items.map((it) => (
                <span key={it} style={{ padding: "5px 10px", fontSize: 12.5, lineHeight: 1.5, color: "var(--color-text)", background: "var(--color-bg)", border: "1px solid var(--color-divider)", borderRadius: 999 }}>
                  {it}
                </span>
              ))}
            </div>
          </div>
        ))
      )}
    </>
  );
}

function Content({ topic }: { topic: Topic }) {
  if (topic === "tasks") return <TaskList />;
  if (topic === "howto") return <>{STEPS.map((s, i) => <Section key={s.title} mark={String(i + 1)} title={s.title} body={s.body} />)}</>;
  if (topic === "pricing") return <>{PRICING.map((p) => <Section key={p.title} title={p.title} body={p.body} />)}</>;
  return <>{FAQ.map((f) => <Section key={f.q} mark="Q" title={f.q} body={f.a} />)}</>;
}

export default function GateInfo() {
  const [open, setOpen] = useState<Topic | null>(null);
  const current = TOPICS.find((t) => t.id === open);

  return (
    <>
      <div style={{ width: "100%", display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, marginTop: 4 }}>
        {TOPICS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setOpen(id)}
            style={{
              minWidth: 0,
              height: 46,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              padding: "0 6px",
              cursor: "pointer",
              fontSize: 12,
              whiteSpace: "nowrap",
              color: "var(--color-text)",
              background: "var(--color-surface)",
              border: "1px solid var(--color-divider)",
              borderRadius: "var(--radius-md)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <Icon size={19} color="var(--color-accent)" />
            {label}
          </button>
        ))}
      </div>

      {current && (
        <div style={scrim} onClick={() => setOpen(null)}>
          <div role="dialog" aria-modal="true" aria-label={current.label} onClick={(e) => e.stopPropagation()} style={dialogBox}>
            <button
              onClick={() => setOpen(null)}
              aria-label="閉じる"
              style={{ position: "absolute", top: 15, right: 14, zIndex: 1, width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--color-neutral-500)", background: "transparent", border: "none" }}
            >
              <X size={16} />
            </button>
            <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "18px 52px 14px 20px", borderBottom: "1px solid var(--color-divider)" }}>
              <current.Icon size={22} color="var(--color-accent)" />
              <span style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 19 }}>{current.label}</span>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", display: "flex", flexDirection: "column", gap: 16, padding: "16px 20px 22px" }}>
              <Content topic={current.id} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
