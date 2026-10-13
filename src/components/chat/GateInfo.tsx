"use client";

import { useState } from "react";
import { X, ListNumbers, Coins, Question } from "@phosphor-icons/react";
import { headingWeight } from "@/lib/style";

// ログイン前の入口画面（AccountGate）の下に並べる、サービス紹介の3つのボタン。
// 画面自体には説明文を置かず、見たい人だけがポップアップで開ける形にする。
// 文面は利用規約（/terms の DEFAULT_TERMS_CONTENT）と食い違わない範囲に留める。
type Topic = "howto" | "pricing" | "faq";

const TOPICS: { id: Topic; label: string; Icon: typeof Question }[] = [
  { id: "howto", label: "利用方法", Icon: ListNumbers },
  { id: "pricing", label: "料金形態", Icon: Coins },
  { id: "faq", label: "よくあるご質問", Icon: Question },
];

const STEPS = [
  { title: "トークでご相談", body: "やってほしいことを、チャットでそのままお送りください。" },
  { title: "お見積り", body: "内容を確認し、金額と目安をトーク上でお送りします。" },
  { title: "ご依頼の確定", body: "内容にご納得いただけたら、チャージ残高からお支払いいただき、作業に着手します。" },
  { title: "完了のご報告", body: "作業が終わると、トーク上に完了報告が届きます。" },
];

const PRICING = [
  { title: "ご依頼ごとのお見積り", body: "料金はご依頼の内容に応じて、その都度お見積りします。ご登録は無料です。" },
  { title: "チャージ残高からお支払い", body: "あらかじめクレジットカードで残高をチャージし、ご依頼の確定時にその残高からお支払いいただきます。自動チャージも設定できます。" },
  { title: "ご依頼の確定前なら費用はかかりません", body: "見積もりを見てから見送ることもできます。ご依頼の確定後のキャンセル・返金については利用規約をご確認ください。" },
];

const FAQ = [
  { q: "どんなことを頼めますか？", a: "調べもの、資料の作成、各種手配など、事務まわりのちょっとした頼みごとからお気軽にご相談ください。お受けできない内容の場合は、見積もりの前にお伝えします。" },
  { q: "単発だけでも頼めますか？", a: "はい。1回だけのご依頼も、毎月など定期的なご依頼も、同じトークからご相談いただけます。" },
  { q: "見積もりを見てから断れますか？", a: "はい。ご依頼の確定前であれば、いつでも見送ることができ、費用はかかりません。" },
  { q: "同時にいくつまで頼めますか？", a: "同時に進められるご依頼は3件までです。" },
  { q: "支払い方法は？", a: "クレジットカードで残高をチャージし、その残高からお支払いいただきます。" },
];

const scrim: React.CSSProperties = { position: "fixed", inset: 0, background: "var(--stb-scrim)", zIndex: 50, display: "grid", placeItems: "center", padding: "var(--space-4)" };
const dialogBox: React.CSSProperties = {
  width: "min(420px, 100%)",
  maxHeight: "calc(100vh - 32px)",
  overflowY: "auto",
  position: "relative",
  display: "flex",
  flexDirection: "column",
  gap: 16,
  padding: 22,
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

function Content({ topic }: { topic: Topic }) {
  if (topic === "howto") return <>{STEPS.map((s, i) => <Section key={s.title} mark={String(i + 1)} title={s.title} body={s.body} />)}</>;
  if (topic === "pricing") return <>{PRICING.map((p) => <Section key={p.title} title={p.title} body={p.body} />)}</>;
  return <>{FAQ.map((f) => <Section key={f.q} mark="Q" title={f.q} body={f.a} />)}</>;
}

export default function GateInfo() {
  const [open, setOpen] = useState<Topic | null>(null);
  const current = TOPICS.find((t) => t.id === open);

  return (
    <>
      <div style={{ width: "100%", display: "flex", gap: 8, marginTop: 4 }}>
        {TOPICS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setOpen(id)}
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
              padding: "12px 4px 10px",
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
            <Icon size={22} color="var(--color-accent)" />
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
              style={{ position: "absolute", top: 14, right: 14, width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--color-neutral-500)", background: "transparent", border: "none" }}
            >
              <X size={16} />
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <current.Icon size={22} color="var(--color-accent)" />
              <span style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 19 }}>{current.label}</span>
            </div>
            <Content topic={current.id} />
          </div>
        </div>
      )}
    </>
  );
}
