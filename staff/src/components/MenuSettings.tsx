"use client";

import { useState } from "react";
import { Trash, Plus, CaretDown, CaretRight } from "@phosphor-icons/react";
import { headingWeight } from "@/lib/style";
import {
  updateCompanyInfo,
  createMenu,
  updateMenu,
  deleteMenu,
  addMenuQuestion,
  updateMenuQuestion,
  deleteMenuQuestion,
} from "@/app/actions";

interface Company {
  name: string;
  display_name: string;
  rep_name: string;
  address: string;
  tel: string;
  email: string;
}

interface Question {
  id: string;
  menu_id: string;
  label: string;
  sort: number;
}

interface Menu {
  id: string;
  org_id: string;
  label: string;
  note: string | null;
  price: number;
  lead_hours: number;
  active: boolean;
  menu_questions: Question[];
}

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

export default function MenuSettings({
  orgId,
  initialCompany,
  initialMenus,
}: {
  orgId: string;
  initialCompany: Company;
  initialMenus: Menu[];
}) {
  return (
    <div style={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: 20, maxWidth: 760 }}>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 22 }}>メニュー管理</div>
      <CompanyInfoCard initial={initialCompany} />
      <MenuListCard orgId={orgId} initialMenus={initialMenus} />
      <div style={{ fontSize: 12, color: "var(--color-neutral-600)", lineHeight: 1.7 }}>
        ログイン情報・返信テンプレ・契約書テンプレート・キャンセル/返金ポリシーの編集は次のフェーズで対応します。
      </div>
    </div>
  );
}

function CompanyInfoCard({ initial }: { initial: Company }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  function set<K extends keyof Company>(key: K, value: Company[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setDone(false);
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await updateCompanyInfo(form);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={card}>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 15 }}>会社情報</div>
      <div style={{ fontSize: 11.5, color: "var(--color-neutral-500)", lineHeight: 1.6 }}>契約書の「甲」・依頼主への表示名・見積書と請求書に使います</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="正式名称" value={form.name} onChange={(v) => set("name", v)} />
        <Field label="表示名（依頼主に見える）" value={form.display_name} onChange={(v) => set("display_name", v)} />
        <Field label="代表者名" value={form.rep_name} onChange={(v) => set("rep_name", v)} />
        <Field label="電話番号" value={form.tel} onChange={(v) => set("tel", v)} />
        <Field label="メールアドレス" value={form.email} onChange={(v) => set("email", v)} />
        <Field label="住所" value={form.address} onChange={(v) => set("address", v)} />
      </div>
      {error && <span style={{ fontSize: 11.5, color: "var(--color-accent-200)" }}>{error}</span>}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={save} disabled={saving} style={{ ...smallBtn, height: 36 }}>
          {saving ? "保存中…" : "保存"}
        </button>
        {done && <span style={{ fontSize: 11.5, color: "var(--color-accent-300)" }}>保存しました</span>}
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

function MenuListCard({ orgId, initialMenus }: { orgId: string; initialMenus: Menu[] }) {
  const [menus, setMenus] = useState(initialMenus);
  const [openId, setOpenId] = useState<string | null>(null);

  async function handleAdd() {
    const id = await createMenu(orgId);
    setMenus((m) => [...m, { id, org_id: orgId, label: "新しいメニュー", note: null, price: 0, lead_hours: 24, active: true, menu_questions: [] }]);
    setOpenId(id);
  }

  async function handleDelete(id: string) {
    if (!confirm("このメニューを削除しますか？")) return;
    await deleteMenu(id);
    setMenus((m) => m.filter((x) => x.id !== id));
  }

  function patchLocal(id: string, patch: Partial<Menu>) {
    setMenus((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function commit(m: Menu) {
    await updateMenu(m.id, { label: m.label, note: m.note ?? "", price: m.price, lead_hours: m.lead_hours, active: m.active });
  }

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div style={{ flex: 1, fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 15 }}>受付メニュー</div>
        <button onClick={handleAdd} style={smallBtn}>
          <Plus size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
          メニューを追加
        </button>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--color-neutral-500)", lineHeight: 1.6 }}>依頼主が相談するときに選ぶ一覧です。金額・作業時間の目安・はじめの質問をここで決めます</div>

      {menus.length === 0 && <div style={{ fontSize: 12.5, color: "var(--color-neutral-500)" }}>まだメニューがありません。</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {menus.map((m) => {
          const open = openId === m.id;
          return (
            <div key={m.id} style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--color-divider)", overflow: "hidden" }}>
              <button
                onClick={() => setOpenId(open ? null : m.id)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", cursor: "pointer", background: "var(--color-bg)", border: "none", textAlign: "left", color: "var(--color-text)" }}
              >
                {open ? <CaretDown size={13} /> : <CaretRight size={13} />}
                <span style={{ flex: 1, fontSize: 13.5, opacity: m.active ? 1 : 0.5 }}>{m.label || "（無題）"}</span>
                <span style={{ fontSize: 11.5, color: "var(--color-neutral-500)" }}>¥{m.price.toLocaleString("ja-JP")}</span>
              </button>
              {open && (
                <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      <span style={label}>メニュー名</span>
                      <input value={m.label} onChange={(e) => patchLocal(m.id, { label: e.target.value })} onBlur={() => commit(m)} className="vid-input" style={input} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      <span style={label}>請求金額（円）</span>
                      <input
                        type="number"
                        value={m.price}
                        onChange={(e) => patchLocal(m.id, { price: Number(e.target.value) })}
                        onBlur={() => commit(m)}
                        className="vid-input"
                        style={input}
                      />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      <span style={label}>作業時間の目安（時間）</span>
                      <input
                        type="number"
                        value={m.lead_hours}
                        onChange={(e) => patchLocal(m.id, { lead_hours: Number(e.target.value) })}
                        onBlur={() => commit(m)}
                        className="vid-input"
                        style={input}
                      />
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <span style={label}>詳細内容</span>
                    <input value={m.note ?? ""} onChange={(e) => patchLocal(m.id, { note: e.target.value })} onBlur={() => commit(m)} className="vid-input" style={input} />
                  </div>

                  <QuestionsEditor menuId={m.id} questions={m.menu_questions} onChange={(qs) => patchLocal(m.id, { menu_questions: qs })} />

                  <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 6, borderTop: "1px solid var(--color-divider)" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-neutral-400)" }}>
                      <input type="checkbox" checked={m.active} onChange={(e) => { patchLocal(m.id, { active: e.target.checked }); commit({ ...m, active: e.target.checked }); }} />
                      表示する
                    </label>
                    <div style={{ flex: 1 }} />
                    <button onClick={() => handleDelete(m.id)} style={{ ...smallBtn, color: "var(--color-accent-200)", borderColor: "var(--color-divider)" }}>
                      <Trash size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
                      削除
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function QuestionsEditor({ menuId, questions, onChange }: { menuId: string; questions: Question[]; onChange: (q: Question[]) => void }) {
  async function add() {
    const id = await addMenuQuestion(menuId, "", questions.length);
    onChange([...questions, { id, menu_id: menuId, label: "", sort: questions.length }]);
  }
  function patch(id: string, val: string) {
    onChange(questions.map((q) => (q.id === id ? { ...q, label: val } : q)));
  }
  async function commit(id: string, val: string) {
    await updateMenuQuestion(id, val);
  }
  async function remove(id: string) {
    await deleteMenuQuestion(id);
    onChange(questions.filter((q) => q.id !== id));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={label}>はじめの質問</span>
      {questions.map((q) => (
        <div key={q.id} style={{ display: "flex", gap: 8 }}>
          <input
            value={q.label}
            onChange={(e) => patch(q.id, e.target.value)}
            onBlur={() => commit(q.id, q.label)}
            className="vid-input"
            style={{ ...input, flex: 1, height: 32 }}
          />
          <button onClick={() => remove(q.id)} aria-label="削除" style={{ flex: "none", width: 32, height: 32, cursor: "pointer", color: "var(--color-neutral-500)", background: "transparent", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}>
            <Trash size={13} />
          </button>
        </div>
      ))}
      <button onClick={add} style={{ alignSelf: "flex-start", ...smallBtn, height: 30 }}>
        ＋質問を追加
      </button>
    </div>
  );
}
