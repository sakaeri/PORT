"use client";

import { useState } from "react";
import { ArrowSquareOut, Buildings, CaretDown, CaretRight } from "@phosphor-icons/react";
import { headingWeight } from "@/lib/style";
import { convertCustomerToOrg } from "@/app/actions";
import { EMPTY_ORG_FORM, OrgAccountFields, slugify, type OrgAccountFormState } from "@/components/OrgAccountFields";

interface CustomerRow {
  id: string;
  name: string;
  memberNo: string | null;
  creatorName: string | null;
  convertedOrg: { displayName: string; slug: string | null } | null;
}

const card: React.CSSProperties = {
  padding: 16,
  borderRadius: "var(--radius-md)",
  background: "var(--color-surface)",
  border: "1px solid var(--color-divider)",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};
const smallBtn: React.CSSProperties = {
  height: 30,
  padding: "0 12px",
  cursor: "pointer",
  fontSize: 11.5,
  whiteSpace: "nowrap",
  color: "var(--color-accent)",
  background: "transparent",
  border: "1px solid var(--color-accent)",
  borderRadius: "var(--radius-md)",
};

export default function CustomersList({ rows: initialRows, isHq }: { rows: CustomerRow[]; isHq: boolean }) {
  const [rows, setRows] = useState(initialRows);
  const [openId, setOpenId] = useState<string | null>(null);

  function markConverted(id: string, displayName: string, slug: string | null) {
    setRows((r) => r.map((row) => (row.id === id ? { ...row, convertedOrg: { displayName, slug } } : row)));
    setOpenId(null);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map((c) => {
        const open = openId === c.id;
        return (
          <div key={c.id} style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--color-divider)", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "var(--color-surface)" }}>
              {isHq && !c.convertedOrg && (
                <button onClick={() => setOpenId(open ? null : c.id)} aria-label="事業者として登録" style={{ flex: "none", display: "flex", cursor: "pointer", color: "var(--color-neutral-500)", background: "transparent", border: "none" }}>
                  {open ? <CaretDown size={13} /> : <CaretRight size={13} />}
                </button>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                <div style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>{c.memberNo ?? "—"}</div>
              </div>
              {!isHq && (
                <div style={{ flex: "none", fontSize: 11.5, color: "var(--color-neutral-500)" }}>
                  {c.creatorName ? `担当: ${c.creatorName}` : "未割り当て"}
                </div>
              )}
              {isHq && c.convertedOrg && (
                <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: "var(--color-accent-200)" }}>
                  <Buildings size={14} />
                  {c.convertedOrg.displayName} として登録済み
                  {c.convertedOrg.slug && (
                    <a href={`https://port.s-stylegolf.com/${c.convertedOrg.slug}`} target="_blank" rel="noreferrer" style={{ display: "flex", color: "var(--color-neutral-400)" }} aria-label="サイトを開く">
                      <ArrowSquareOut size={13} />
                    </a>
                  )}
                </div>
              )}
              {isHq && !c.convertedOrg && (
                <button onClick={() => setOpenId(open ? null : c.id)} style={smallBtn}>
                  事業者として登録
                </button>
              )}
            </div>
            {open && <ConvertForm customerId={c.id} customerName={c.name} onDone={markConverted} onCancel={() => setOpenId(null)} />}
          </div>
        );
      })}
    </div>
  );
}

function ConvertForm({
  customerId,
  customerName,
  onDone,
  onCancel,
}: {
  customerId: string;
  customerName: string;
  onDone: (id: string, displayName: string, slug: string | null) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<OrgAccountFormState>({ ...EMPTY_ORG_FORM, display_name: customerName, slug: slugify(customerName) });
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ slug: string; email: string; password: string } | null>(null);

  function set<K extends keyof OrgAccountFormState>(key: K, value: string) {
    setForm((f) => {
      const next = { ...f, [key]: value };
      if (key === "display_name" && !slugTouched) next.slug = slugify(value);
      if (key === "slug") setSlugTouched(true);
      return next;
    });
  }

  async function submit() {
    if (saving) return;
    setError("");
    setSaving(true);
    try {
      const result = await convertCustomerToOrg(customerId, form);
      setCreated({ slug: result.slug, email: form.owner_email, password: form.owner_password });
      onDone(customerId, form.display_name, result.slug);
    } catch (e) {
      setError(e instanceof Error ? e.message : "登録できませんでした");
    } finally {
      setSaving(false);
    }
  }

  if (created) {
    return (
      <div style={{ ...card, borderRadius: 0, border: "none", borderTop: "1px solid var(--color-divider)", background: "var(--color-accent-900)" }}>
        <div style={{ fontSize: 13.5, color: "var(--color-accent-100)" }}>「{form.display_name}」を事業者として登録しました。次の内容をお伝えください。</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5 }}>
          <div>URL：<b>port.s-stylegolf.com/{created.slug}</b></div>
          <div>ログインメール：<b>{created.email}</b></div>
          <div>初期パスワード：<b style={{ letterSpacing: "0.04em" }}>{created.password}</b></div>
        </div>
        <div style={{ fontSize: 11, color: "var(--color-accent-200)", lineHeight: 1.6 }}>パスワードはこの画面にしか出ません。忘れずにコピーして伝えてください。</div>
      </div>
    );
  }

  return (
    <div style={{ ...card, borderRadius: 0, border: "none", borderTop: "1px solid var(--color-divider)" }}>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 14 }}>事業者として登録</div>
      <div style={{ fontSize: 11.5, color: "var(--color-neutral-500)", lineHeight: 1.6 }}>
        この依頼主をそのまま新しい事業者にします。表示名は問い合わせ時の名前を引き継いでいるので、必要に応じて書き換えてください。
      </div>
      <OrgAccountFields form={form} set={set} />
      {error && <span style={{ fontSize: 11.5, color: "var(--color-accent-200)" }}>{error}</span>}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={submit} disabled={saving} style={{ ...smallBtn, height: 36, color: "var(--color-accent-100)", background: "var(--color-accent-900)" }}>
          {saving ? "登録中…" : "この内容で登録"}
        </button>
        <button onClick={onCancel} style={{ ...smallBtn, height: 36, color: "var(--color-neutral-400)", borderColor: "var(--color-divider)" }}>
          キャンセル
        </button>
      </div>
    </div>
  );
}
