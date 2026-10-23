"use client";

import { useState } from "react";
import { Plus, Copy, Check, PencilSimple } from "@phosphor-icons/react";
import { headingWeight } from "@/lib/style";
import { errorMessage } from "@/lib/errors";
import { createInquiryDesk, setInquiryDeskActive, updateInquiryDeskSlug, type InquiryDesk } from "@/app/actions";
import InfoTooltip from "@/components/InfoTooltip";

// 依頼主アプリの公開URL（OrgsAdmin.tsx の事業者URLと同じドメイン）。
const CLIENT_APP_ORIGIN = "https://port.s-stylegolf.com";

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

// 他社サービス（TeeRA など）のお問い合わせを引き受けるときの入口。名前だけで作れて、
// URL と振り分け先（依頼主一覧の絞り込みに出る「問い合わせ：〇〇」）は自動でできる。
export default function InquiryDesksCard({ initialDesks, canEdit }: { initialDesks: InquiryDesk[]; canEdit: boolean }) {
  const [desks, setDesks] = useState(initialDesks);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [slugDraft, setSlugDraft] = useState("");

  function startEdit(desk: InquiryDesk) {
    setEditingId(desk.id);
    setSlugDraft(desk.slug);
    setError("");
  }

  async function saveSlug(desk: InquiryDesk) {
    if (saving) return;
    const next = slugDraft.trim().toLowerCase();
    if (!next || next === desk.slug) {
      setEditingId(null);
      return;
    }
    if (!confirm(`URLを /${next} に変えますか？（/${desk.slug} は使えなくなります）`)) return;
    setSaving(true);
    setError("");
    try {
      const slug = await updateInquiryDeskSlug(desk.id, next);
      setDesks((d) => d.map((x) => (x.id === desk.id ? { ...x, slug } : x)));
      setEditingId(null);
    } catch (e) {
      setError(errorMessage(e, "変更できませんでした"));
    } finally {
      setSaving(false);
    }
  }

  async function create() {
    if (saving) return;
    if (!name.trim()) {
      setAdding(false);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const desk = await createInquiryDesk(name);
      setDesks((d) => [desk, ...d]);
      setName("");
      setAdding(false);
    } catch (e) {
      setError(errorMessage(e, "作成できませんでした"));
    } finally {
      setSaving(false);
    }
  }

  async function toggle(desk: InquiryDesk) {
    if (togglingId) return;
    if (desk.active && !confirm(`「${desk.name}」の受付を止めますか？（過去のトークは残ります）`)) return;
    setTogglingId(desk.id);
    setError("");
    try {
      await setInquiryDeskActive(desk.id, !desk.active);
      setDesks((d) => d.map((x) => (x.id === desk.id ? { ...x, active: !desk.active } : x)));
    } catch (e) {
      setError(errorMessage(e, "切り替えできませんでした"));
    } finally {
      setTogglingId(null);
    }
  }

  async function copy(desk: InquiryDesk) {
    try {
      await navigator.clipboard.writeText(`${CLIENT_APP_ORIGIN}/${desk.slug}`);
      setCopiedId(desk.id);
      setTimeout(() => setCopiedId((c) => (c === desk.id ? null : c)), 1500);
    } catch {
      setError("コピーできませんでした");
    }
  }

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 15 }}>問い合わせ窓口</div>
        <InfoTooltip text="他社サービスのお問い合わせを引き受けるときの入口です。名前を入れるだけでURLができ、そこから届いたトークは依頼主一覧で「問い合わせ：〇〇」として分かれます。依頼主側はチャットだけの画面になります。受付をオフにすると新しい問い合わせは止まり、過去のトークは残ります。" />
        <div style={{ flex: 1 }} />
        {canEdit && !adding && (
          <button onClick={() => setAdding(true)} style={smallBtn}>
            <Plus size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
            窓口を追加
          </button>
        )}
      </div>

      {adding && (
        <div style={{ display: "flex", gap: 8 }}>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) create();
              if (e.key === "Escape") setAdding(false);
            }}
            placeholder="窓口の名前（例：TeeRA）"
            className="vid-input"
            style={input}
          />
          <button onClick={() => { setAdding(false); setName(""); }} style={{ ...smallBtn, color: "var(--color-neutral-400)", borderColor: "var(--color-divider)" }}>
            やめる
          </button>
          <button onClick={create} disabled={saving} style={{ ...smallBtn, color: "var(--color-accent-100)", background: "var(--color-accent-900)", opacity: saving ? 0.6 : 1 }}>
            {saving ? "作成中…" : "作成"}
          </button>
        </div>
      )}

      {error && <div style={{ fontSize: 12, color: "var(--color-accent-200)" }}>{error}</div>}

      {desks.length === 0 && !adding && <div style={{ fontSize: 12.5, color: "var(--color-neutral-500)" }}>まだ窓口がありません。</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {desks.map((d) => (
          <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-divider)", background: "var(--color-bg)" }}>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2, opacity: d.active ? 1 : 0.55 }}>
              <span style={{ fontSize: 13.5 }}>{d.name}</span>
              {editingId === d.id ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 12, color: "var(--color-neutral-500)" }}>/</span>
                  <input
                    autoFocus
                    value={slugDraft}
                    onChange={(e) => setSlugDraft(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing) saveSlug(d);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    placeholder="半角英数字"
                    className="vid-input"
                    style={{ ...input, flex: "1 1 120px", maxWidth: 220, height: 28, fontSize: 12.5 }}
                  />
                  <button onClick={() => setEditingId(null)} style={{ ...smallBtn, height: 28, color: "var(--color-neutral-400)", borderColor: "var(--color-divider)" }}>
                    やめる
                  </button>
                  <button onClick={() => saveSlug(d)} disabled={saving} style={{ ...smallBtn, height: 28, color: "var(--color-accent-100)", background: "var(--color-accent-900)", opacity: saving ? 0.6 : 1 }}>
                    保存
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => canEdit && startEdit(d)}
                  disabled={!canEdit}
                  title={canEdit ? "URLを変える" : undefined}
                  style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 4, maxWidth: "100%", padding: 0, cursor: canEdit ? "pointer" : "default", fontSize: 11, color: "var(--color-neutral-500)", background: "transparent", border: "none" }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>/{d.slug}</span>
                  {canEdit && <PencilSimple size={11} style={{ flex: "none" }} />}
                </button>
              )}
            </div>
            {editingId !== d.id && (
              <>
                <button onClick={() => copy(d)} aria-label="URLをコピー" title="URLをコピー" style={{ ...smallBtn, width: 32, padding: 0, display: "grid", placeItems: "center" }}>
                  {copiedId === d.id ? <Check size={14} /> : <Copy size={14} />}
                </button>
                <button
                  onClick={() => canEdit && toggle(d)}
                  disabled={!canEdit || togglingId === d.id}
                  style={{
                    ...smallBtn,
                    cursor: canEdit ? "pointer" : "default",
                    color: d.active ? "var(--color-accent-100)" : "var(--color-neutral-400)",
                    background: d.active ? "var(--color-accent-900)" : "transparent",
                    borderColor: d.active ? "var(--color-accent)" : "var(--color-divider)",
                  }}
                >
                  {d.active ? "受付中" : "停止中"}
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
