"use client";

import { useState } from "react";
import Link from "next/link";
import { CaretDown, CaretRight, Plus } from "@phosphor-icons/react";
import { headingWeight } from "@/lib/style";
import { errorMessage, unwrap } from "@/lib/errors";
import { createReferralSource, updateReferralSource } from "@/app/actions";
import InfoTooltip from "@/components/InfoTooltip";

export type ReferralSourceWithCustomers = {
  id: string;
  name: string;
  active: boolean;
  customers: { id: string; label: string }[];
};

const card: React.CSSProperties = {
  padding: 16,
  borderRadius: "var(--radius-md)",
  background: "var(--color-surface)",
  border: "1px solid var(--color-divider)",
  boxShadow: "var(--shadow-sm)",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};
const smallBtn: React.CSSProperties = {
  height: 32,
  padding: "0 12px",
  cursor: "pointer",
  fontSize: 12,
  whiteSpace: "nowrap",
  color: "var(--color-accent)",
  background: "transparent",
  border: "1px solid var(--color-accent)",
  borderRadius: "var(--radius-md)",
};
const input: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  height: 32,
  padding: "6px 10px",
  fontSize: 13.5,
  color: "var(--color-text)",
  background: "var(--color-bg)",
  border: "1px solid var(--color-divider)",
  borderRadius: "var(--radius-md)",
  outline: "none",
};

// 紹介カードを渡してくれる先生など。ここに登録しておくと、依頼主の画面で
// 「〇〇の紹介」を選べる。タップすると、その紹介元から来た依頼主が開く。
export default function ReferralSourcesCard({ initialSources, canEdit }: { initialSources: ReferralSourceWithCustomers[]; canEdit: boolean }) {
  const [sources, setSources] = useState(initialSources);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  async function add() {
    if (busy || !name.trim()) return;
    setBusy(true);
    setError("");
    try {
      const { data } = unwrap(await createReferralSource(name));
      setSources((rows) => [...rows, { ...data!, customers: [] }]);
      setName("");
      setAdding(false);
    } catch (e) {
      setError(errorMessage(e, "追加できませんでした"));
    } finally {
      setBusy(false);
    }
  }

  async function save(id: string, fields: { name?: string; active?: boolean }) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      unwrap(await updateReferralSource(id, fields));
      setSources((rows) => rows.map((r) => (r.id === id ? { ...r, ...fields, name: fields.name?.trim() ?? r.name } : r)));
      setEditingId(null);
    } catch (e) {
      setError(errorMessage(e, "保存できませんでした"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 15, whiteSpace: "nowrap" }}>紹介元</div>
        <InfoTooltip text="紹介カードを渡してくれる方を登録します。依頼主がトークで「〇〇の紹介です」と伝えたら、依頼主の画面の「紹介元」で選ぶと、5,000円分が残高に入ります（1人1回・有効期限なし）。" />
        <div style={{ flex: 1 }} />
        {canEdit && !adding && (
          <button onClick={() => setAdding(true)} style={smallBtn}>
            <Plus size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
            紹介元を追加
          </button>
        )}
      </div>

      {adding && (
        <div style={{ display: "flex", gap: 8 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例：〇〇税理士事務所" className="vid-input" style={input} autoFocus />
          <button onClick={add} disabled={busy || !name.trim()} style={smallBtn}>
            追加
          </button>
          <button
            onClick={() => {
              setAdding(false);
              setName("");
            }}
            style={{ ...smallBtn, color: "var(--color-neutral-400)", borderColor: "var(--color-divider)" }}
          >
            やめる
          </button>
        </div>
      )}
      {error && <div style={{ fontSize: 11.5, color: "var(--color-accent-200)" }}>{error}</div>}
      {sources.length === 0 && !adding && <div style={{ fontSize: 12.5, color: "var(--color-neutral-500)" }}>まだ紹介元がありません。</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sources.map((s) => {
          const open = openId === s.id;
          return (
            <div key={s.id} style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--color-divider)", overflow: "hidden", opacity: s.active ? 1 : 0.55 }}>
              <button
                onClick={() => setOpenId(open ? null : s.id)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", cursor: "pointer", background: "var(--color-bg)", border: "none", textAlign: "left", color: "var(--color-text)" }}
              >
                {open ? <CaretDown size={13} /> : <CaretRight size={13} />}
                <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.name}
                  {!s.active && "（非表示）"}
                </span>
                <span style={{ flex: "none", fontSize: 12, color: "var(--color-neutral-500)" }}>{s.customers.length}人</span>
              </button>
              {open && (
                <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                  {s.customers.length === 0 ? (
                    <div style={{ fontSize: 12, color: "var(--color-neutral-500)" }}>まだ紹介された依頼主はいません。</div>
                  ) : (
                    s.customers.map((c) => (
                      <Link key={c.id} href={`/customers/${c.id}`} style={{ fontSize: 13, color: "var(--color-accent)", textDecoration: "none" }}>
                        {c.label}
                      </Link>
                    ))
                  )}
                  {canEdit && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, paddingTop: 8, borderTop: "1px solid var(--color-divider)" }}>
                      {editingId === s.id ? (
                        <>
                          <input value={editName} onChange={(e) => setEditName(e.target.value)} className="vid-input" style={input} autoFocus />
                          <button onClick={() => save(s.id, { name: editName })} disabled={busy || !editName.trim()} style={smallBtn}>
                            保存
                          </button>
                          <button onClick={() => setEditingId(null)} style={{ ...smallBtn, color: "var(--color-neutral-400)", borderColor: "var(--color-divider)" }}>
                            やめる
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              setEditingId(s.id);
                              setEditName(s.name);
                            }}
                            style={{ ...smallBtn, color: "var(--color-neutral-400)", borderColor: "var(--color-divider)" }}
                          >
                            名前を変える
                          </button>
                          <button onClick={() => save(s.id, { active: !s.active })} disabled={busy} style={{ ...smallBtn, color: "var(--color-neutral-400)", borderColor: "var(--color-divider)" }}>
                            {s.active ? "非表示にする" : "表示に戻す"}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
