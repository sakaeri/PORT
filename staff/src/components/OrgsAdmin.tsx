"use client";

import { useState } from "react";
import { Plus, ArrowSquareOut } from "@phosphor-icons/react";
import { headingWeight } from "@/lib/style";
import { createOrgAccount } from "@/app/actions";

interface Org {
  id: string;
  name: string;
  display_name: string;
  slug: string | null;
  plan_status: string;
  created_at: string;
}

const PLAN_LABEL: Record<string, string> = {
  trial: "トライアル中",
  active: "契約中",
  past_due: "支払い遅延",
  paused: "一時停止",
  cancelled: "解約済み",
};

const card: React.CSSProperties = {
  padding: 16,
  borderRadius: "var(--radius-md)",
  background: "var(--color-surface)",
  border: "1px solid var(--color-divider)",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};
const input: React.CSSProperties = {
  width: "100%",
  height: 36,
  padding: "6px 10px",
  fontSize: 13.5,
  color: "var(--color-text)",
  background: "var(--color-bg)",
  border: "1px solid var(--color-divider)",
  borderRadius: "var(--radius-md)",
  outline: "none",
};
const label: React.CSSProperties = { fontSize: 12, color: "var(--color-neutral-500)" };
const smallBtn: React.CSSProperties = {
  height: 36,
  padding: "0 14px",
  cursor: "pointer",
  fontSize: 12.5,
  whiteSpace: "nowrap",
  color: "var(--color-accent)",
  background: "transparent",
  border: "1px solid var(--color-accent)",
  borderRadius: "var(--radius-md)",
};

function randomPassword() {
  return Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6).toUpperCase();
}

function slugify(v: string) {
  return v
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const EMPTY_FORM = {
  name: "",
  display_name: "",
  rep_name: "",
  tel: "",
  email: "",
  slug: "",
  owner_email: "",
  owner_password: "",
  owner_display_name: "",
};

export default function OrgsAdmin({ initialOrgs, loadError }: { initialOrgs: Org[]; loadError: boolean }) {
  const [orgs, setOrgs] = useState(initialOrgs);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ displayName: string; slug: string; email: string; password: string } | null>(null);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => {
      const next = { ...f, [key]: value };
      if (key === "display_name" && !slugTouched) next.slug = slugify(value);
      return next;
    });
  }

  async function submit() {
    if (saving) return;
    setError("");
    setSaving(true);
    try {
      const result = await createOrgAccount(form);
      setCreated({ displayName: form.display_name, slug: result.slug, email: form.owner_email, password: form.owner_password });
      setOrgs((o) => [{ id: result.orgId, name: form.name, display_name: form.display_name, slug: result.slug, plan_status: "trial", created_at: new Date().toISOString() }, ...o]);
      setForm(EMPTY_FORM);
      setSlugTouched(false);
      setShowForm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "作成できませんでした");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: 20, maxWidth: 900, width: "100%", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <div style={{ flex: 1, fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 22 }}>事業者管理</div>
        {!showForm && (
          <button onClick={() => setShowForm(true)} style={{ ...smallBtn, color: "var(--color-accent-100)", background: "var(--color-accent-900)" }}>
            <Plus size={13} style={{ marginRight: 4, verticalAlign: -1 }} />
            新しい事業者を追加
          </button>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--color-neutral-500)", lineHeight: 1.6 }}>
        PORT本部から、新しく使い始める事業者のアカウントを作成します。ここで作った事業者の受付は <code>port.s-stylegolf.com/合言葉</code> のURLでログインできます。
      </div>

      {created && (
        <div style={{ ...card, border: "1px solid var(--color-accent-800)", background: "var(--color-accent-900)" }}>
          <div style={{ fontSize: 13.5, color: "var(--color-accent-100)" }}>「{created.displayName}」を作成しました。次の内容を事業者にお伝えください。</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5 }}>
            <div>URL：<b>port.s-stylegolf.com/{created.slug}</b></div>
            <div>ログインメール：<b>{created.email}</b></div>
            <div>初期パスワード：<b style={{ letterSpacing: "0.04em" }}>{created.password}</b></div>
          </div>
          <div style={{ fontSize: 11, color: "var(--color-accent-200)", lineHeight: 1.6 }}>パスワードはこの画面にしか出ません。忘れずにコピーして伝えてください。</div>
          <button onClick={() => setCreated(null)} style={{ ...smallBtn, alignSelf: "flex-start" }}>閉じる</button>
        </div>
      )}

      {showForm && (
        <div style={card}>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 15 }}>新しい事業者の情報</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="正式名称" value={form.name} onChange={(v) => set("name", v)} />
            <Field label="表示名（依頼主に見える）" value={form.display_name} onChange={(v) => set("display_name", v)} />
            <Field label="代表者名" value={form.rep_name} onChange={(v) => set("rep_name", v)} />
            <Field label="電話番号" value={form.tel} onChange={(v) => set("tel", v)} />
            <Field label="連絡用メールアドレス" value={form.email} onChange={(v) => set("email", v)} />
            <Field
              label="URLの合言葉（半角英数字とハイフン）"
              value={form.slug}
              onChange={(v) => { setSlugTouched(true); set("slug", slugify(v)); }}
            />
          </div>

          <div style={{ fontSize: 12, color: "var(--color-neutral-500)", paddingTop: 6, borderTop: "1px solid var(--color-divider)" }}>この事業者のオーナーが受付画面に入るためのログイン情報</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="オーナーの表示名" value={form.owner_display_name} onChange={(v) => set("owner_display_name", v)} />
            <Field label="ログインメールアドレス" value={form.owner_email} onChange={(v) => set("owner_email", v)} />
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={label}>初期パスワード</span>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={form.owner_password} onChange={(e) => set("owner_password", e.target.value)} className="vid-input" style={input} />
                <button onClick={() => set("owner_password", randomPassword())} style={{ ...smallBtn, flex: "none" }}>自動生成</button>
              </div>
            </div>
          </div>

          {error && <span style={{ fontSize: 11.5, color: "var(--color-accent-200)" }}>{error}</span>}

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={submit} disabled={saving} style={{ ...smallBtn, color: "var(--color-accent-100)", background: "var(--color-accent-900)" }}>
              {saving ? "作成中…" : "この内容で作成"}
            </button>
            <button onClick={() => { setShowForm(false); setError(""); }} style={{ ...smallBtn, color: "var(--color-neutral-400)", borderColor: "var(--color-divider)" }}>
              キャンセル
            </button>
          </div>
        </div>
      )}

      {loadError && <div style={{ fontSize: 13, color: "var(--color-accent-200)" }}>読み込みに失敗しました。</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {orgs.length === 0 && !loadError && (
          <div style={{ fontSize: 12.5, color: "var(--color-neutral-500)" }}>まだ登録事業者がいません。</div>
        )}
        {orgs.map((o) => (
          <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: "var(--radius-md)", background: "var(--color-surface)", border: "1px solid var(--color-divider)" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.display_name}</div>
              <div style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>{o.slug ? `/${o.slug}` : "URLの合言葉が未設定"}</div>
            </div>
            <div style={{ flex: "none", fontSize: 11.5, color: "var(--color-neutral-500)" }}>{PLAN_LABEL[o.plan_status] ?? o.plan_status}</div>
            {o.slug && (
              <a href={`https://port.s-stylegolf.com/${o.slug}`} target="_blank" rel="noreferrer" style={{ flex: "none", display: "flex", color: "var(--color-neutral-400)" }} aria-label="サイトを開く">
                <ArrowSquareOut size={15} />
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({ label: l, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={label}>{l}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="vid-input" style={input} />
    </div>
  );
}
