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
  updateLoginEmail,
  updateLoginPassword,
  createIntakeForm,
  updateIntakeForm,
  deleteIntakeForm,
  addIntakeField,
  updateIntakeField,
  deleteIntakeField,
  createAgreement,
  updateAgreement,
  deleteAgreement,
  addAgreementExtra,
  updateAgreementExtra,
  removeAgreementExtra,
  updateRefundPolicy,
} from "@/app/actions";
import type { AgreementKind, PayMode, RefundMode, RefundStage } from "@/lib/supabase/types";

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

interface IntakeField {
  id: string;
  form_id: string;
  key: string;
  label: string;
  kind: string;
  sort: number;
}

interface IntakeForm {
  id: string;
  org_id: string;
  label: string;
  note: string | null;
  save_answers: boolean;
  sort: number;
  intake_fields: IntakeField[];
}

interface AgreementExtra {
  clause: string;
}

interface Agreement {
  id: string;
  org_id: string;
  label: string;
  kind: AgreementKind;
  scope: string | null;
  pay_mode: PayMode;
  pay_fixed: number | null;
  pay_pct: number | null;
  close_day: string | null;
  pay_day: string | null;
  pay_method: string | null;
  open_term: boolean;
  body_text: string | null;
  agreement_extras: AgreementExtra[];
}

interface RefundPolicyRow {
  stage: RefundStage;
  mode: RefundMode;
  pct: number;
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
  initialLoginEmail,
  initialTemplates,
  initialAgreements,
  initialRefundPolicy,
}: {
  orgId: string;
  initialCompany: Company;
  initialMenus: Menu[];
  initialLoginEmail: string;
  initialTemplates: IntakeForm[];
  initialAgreements: Agreement[];
  initialRefundPolicy: RefundPolicyRow[];
}) {
  return (
    <div style={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: 20, maxWidth: 760 }}>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 22 }}>メニュー管理</div>
      <CompanyInfoCard initial={initialCompany} />
      <MenuListCard orgId={orgId} initialMenus={initialMenus} />
      <LoginInfoCard initialEmail={initialLoginEmail} />
      <TemplatesCard orgId={orgId} initialTemplates={initialTemplates} />
      <AgreementsCard orgId={orgId} initialAgreements={initialAgreements} />
      <RefundPolicyCard orgId={orgId} initialPolicy={initialRefundPolicy} />
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

function LoginInfoCard({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [editingEmail, setEditingEmail] = useState(false);
  const [editingPw, setEditingPw] = useState(false);
  const [nextEmail, setNextEmail] = useState(initialEmail);
  const [curPw, setCurPw] = useState("");
  const [nextPw, setNextPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveEmail() {
    if (saving) return;
    setError("");
    if (!nextEmail.trim()) return setError("メールアドレスを入力してください");
    setSaving(true);
    try {
      await updateLoginEmail(nextEmail.trim());
      setEmail(nextEmail.trim());
      setEditingEmail(false);
      setDone("確認メールを新しいアドレスに送信しました。リンクを開くと切り替わります。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "変更できませんでした");
    } finally {
      setSaving(false);
    }
  }

  async function savePassword() {
    if (saving) return;
    setError("");
    if (nextPw.length < 8) return setError("新しいパスワードは8文字以上にしてください");
    if (nextPw !== confirmPw) return setError("新しいパスワードが一致しません");
    setSaving(true);
    try {
      await updateLoginPassword(curPw, nextPw);
      setEditingPw(false);
      setCurPw("");
      setNextPw("");
      setConfirmPw("");
      setDone("パスワードを変更しました。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "変更できませんでした");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={card}>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 15 }}>ログイン情報</div>
      <div style={{ fontSize: 11.5, color: "var(--color-neutral-500)", lineHeight: 1.6 }}>この管理画面に入るためのメールアドレスとパスワードです。書類には使いません。</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 13px", borderRadius: "var(--radius-md)", background: "var(--color-bg)", border: "1px solid var(--color-divider)" }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={label}>メールアドレス</span>
            <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email}</span>
          </div>
          <button onClick={() => { setEditingEmail((v) => !v); setEditingPw(false); setError(""); setDone(""); }} style={smallBtn}>変更</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 13px", borderRadius: "var(--radius-md)", background: "var(--color-bg)", border: "1px solid var(--color-divider)" }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={label}>パスワード</span>
            <span style={{ fontSize: 13, letterSpacing: "0.12em" }}>••••••••</span>
          </div>
          <button onClick={() => { setEditingPw((v) => !v); setEditingEmail(false); setError(""); setDone(""); }} style={smallBtn}>変更</button>
        </div>
      </div>

      {editingEmail && (
        <div style={{ display: "flex", flexDirection: "column", gap: 9, padding: 13, borderRadius: "var(--radius-md)", background: "var(--color-bg)", border: "1px solid var(--color-accent-800)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={label}>新しいメールアドレス</span>
            <input value={nextEmail} onChange={(e) => setNextEmail(e.target.value)} className="vid-input" style={input} />
          </div>
          {error && <span style={{ fontSize: 11.5, color: "var(--color-accent-200)" }}>{error}</span>}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={saveEmail} disabled={saving} style={{ ...smallBtn, height: 34 }}>{saving ? "保存中…" : "変更を保存"}</button>
            <button onClick={() => { setEditingEmail(false); setNextEmail(email); setError(""); }} style={{ ...smallBtn, color: "var(--color-neutral-400)", borderColor: "var(--color-divider)" }}>キャンセル</button>
          </div>
        </div>
      )}

      {editingPw && (
        <div style={{ display: "flex", flexDirection: "column", gap: 9, padding: 13, borderRadius: "var(--radius-md)", background: "var(--color-bg)", border: "1px solid var(--color-accent-800)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={label}>現在のパスワード</span>
              <input type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} className="vid-input" style={input} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={label}>新しいパスワード</span>
              <input type="password" value={nextPw} onChange={(e) => setNextPw(e.target.value)} placeholder="8文字以上" className="vid-input" style={input} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={label}>確認のため再入力</span>
              <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} className="vid-input" style={input} />
            </div>
          </div>
          {error && <span style={{ fontSize: 11.5, color: "var(--color-accent-200)" }}>{error}</span>}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={savePassword} disabled={saving} style={{ ...smallBtn, height: 34 }}>{saving ? "保存中…" : "変更を保存"}</button>
            <button onClick={() => { setEditingPw(false); setCurPw(""); setNextPw(""); setConfirmPw(""); setError(""); }} style={{ ...smallBtn, color: "var(--color-neutral-400)", borderColor: "var(--color-divider)" }}>キャンセル</button>
          </div>
        </div>
      )}

      {done && !editingEmail && !editingPw && <span style={{ fontSize: 11.5, color: "var(--color-accent-300)" }}>{done}</span>}
    </div>
  );
}

function TemplatesCard({ orgId, initialTemplates }: { orgId: string; initialTemplates: IntakeForm[] }) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [openId, setOpenId] = useState<string | null>(null);

  async function handleAdd() {
    const id = await createIntakeForm(orgId, true);
    setTemplates((t) => [...t, { id, org_id: orgId, label: "新しいテンプレ", note: null, save_answers: true, sort: 999, intake_fields: [] }]);
    setOpenId(id);
  }

  async function handleDelete(id: string) {
    if (!confirm("このテンプレを削除しますか？")) return;
    await deleteIntakeForm(id);
    setTemplates((t) => t.filter((x) => x.id !== id));
  }

  function patchLocal(id: string, patch: Partial<IntakeForm>) {
    setTemplates((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function commit(t: IntakeForm) {
    await updateIntakeForm(t.id, { label: t.label, note: t.note ?? "", save_answers: t.save_answers });
  }

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div style={{ flex: 1, fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 15 }}>返信テンプレ</div>
        <button onClick={handleAdd} style={smallBtn}>
          <Plus size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
          テンプレを追加
        </button>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--color-neutral-500)", lineHeight: 1.6 }}>受付がトークからワンタップで送る定型の返信です。項目を付けると入力フォームになり、「回答を依頼主データに残す」をオンにすると次回以降は自動で引き当てます。</div>

      {templates.length === 0 && <div style={{ fontSize: 12.5, color: "var(--color-neutral-500)" }}>まだテンプレがありません。</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {templates.map((t) => {
          const open = openId === t.id;
          return (
            <div key={t.id} style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--color-divider)", overflow: "hidden" }}>
              <button
                onClick={() => setOpenId(open ? null : t.id)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", cursor: "pointer", background: "var(--color-bg)", border: "none", textAlign: "left", color: "var(--color-text)" }}
              >
                {open ? <CaretDown size={13} /> : <CaretRight size={13} />}
                <span style={{ flex: 1, fontSize: 13.5 }}>{t.label || "（無題）"}</span>
                <span style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>{t.intake_fields.length > 0 ? `項目${t.intake_fields.length}件` : "定型文のみ"}</span>
              </button>
              {open && (
                <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <span style={label}>テンプレ名</span>
                    <input value={t.label} onChange={(e) => patchLocal(t.id, { label: e.target.value })} onBlur={() => commit(t)} className="vid-input" style={input} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <span style={label}>定型文の本文（項目がなければそのまま送信されます）</span>
                    <textarea
                      value={t.note ?? ""}
                      onChange={(e) => patchLocal(t.id, { note: e.target.value })}
                      onBlur={() => commit(t)}
                      rows={3}
                      className="vid-input"
                      style={{ ...input, height: "auto", padding: "8px 10px", resize: "vertical" }}
                    />
                  </div>

                  <TemplateFieldsEditor formId={t.id} fields={t.intake_fields} onChange={(fields) => patchLocal(t.id, { intake_fields: fields })} />

                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-neutral-400)", paddingTop: 6, borderTop: "1px solid var(--color-divider)" }}>
                    <input
                      type="checkbox"
                      checked={t.save_answers}
                      onChange={(e) => { patchLocal(t.id, { save_answers: e.target.checked }); commit({ ...t, save_answers: e.target.checked }); }}
                    />
                    回答を依頼主データに残す（次回以降は自動で引き当てます）
                  </label>

                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button onClick={() => handleDelete(t.id)} style={{ ...smallBtn, color: "var(--color-accent-200)", borderColor: "var(--color-divider)" }}>
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

const FIELD_KINDS = [
  { value: "text", label: "テキスト" },
  { value: "tel", label: "電話番号" },
  { value: "email", label: "メールアドレス" },
  { value: "date", label: "日付" },
  { value: "textarea", label: "長文" },
];

function TemplateFieldsEditor({ formId, fields, onChange }: { formId: string; fields: IntakeField[]; onChange: (f: IntakeField[]) => void }) {
  async function add() {
    const created = await addIntakeField(formId, fields.length);
    onChange([...fields, { id: created.id, form_id: formId, key: created.key, label: "", kind: "text", sort: fields.length }]);
  }
  function patch(id: string, p: Partial<IntakeField>) {
    onChange(fields.map((f) => (f.id === id ? { ...f, ...p } : f)));
  }
  async function commit(f: IntakeField) {
    await updateIntakeField(f.id, { label: f.label, kind: f.kind });
  }
  async function remove(id: string) {
    await deleteIntakeField(id);
    onChange(fields.filter((f) => f.id !== id));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={label}>入力してもらう項目（空なら定型文をそのまま送るだけになります）</span>
      {fields.map((f) => (
        <div key={f.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 120px 32px", gap: 8 }}>
          <input
            value={f.label}
            onChange={(e) => patch(f.id, { label: e.target.value })}
            onBlur={() => commit(f)}
            placeholder="例：ご希望の日時"
            className="vid-input"
            style={{ ...input, height: 32 }}
          />
          <select
            value={f.kind}
            onChange={(e) => { patch(f.id, { kind: e.target.value }); commit({ ...f, kind: e.target.value }); }}
            className="vid-input"
            style={{ ...input, height: 32 }}
          >
            {FIELD_KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
          <button onClick={() => remove(f.id)} aria-label="削除" style={{ width: 32, height: 32, cursor: "pointer", color: "var(--color-neutral-500)", background: "transparent", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}>
            <Trash size={13} />
          </button>
        </div>
      ))}
      <button onClick={add} style={{ alignSelf: "flex-start", ...smallBtn, height: 30 }}>
        ＋項目を追加
      </button>
    </div>
  );
}

const AGREEMENT_KINDS: { value: AgreementKind; label: string }[] = [
  { value: "contract", label: "業務委託契約" },
  { value: "employment_part", label: "雇用契約（パート）" },
  { value: "employment_full", label: "雇用契約（フルタイム）" },
  { value: "nda", label: "秘密保持契約（NDA）" },
  { value: "consent", label: "同意書" },
];

const PAY_MODES: { value: PayMode; label: string }[] = [
  { value: "hourly", label: "時給" },
  { value: "daily", label: "日給" },
  { value: "monthly", label: "月給" },
  { value: "menu", label: "メニューごとの単価" },
  { value: "share", label: "請求額シェア（%）" },
  { value: "none", label: "報酬なし" },
];

function AgreementsCard({ orgId, initialAgreements }: { orgId: string; initialAgreements: Agreement[] }) {
  const [agreements, setAgreements] = useState(initialAgreements);
  const [openId, setOpenId] = useState<string | null>(null);

  async function handleAdd() {
    const id = await createAgreement(orgId);
    setAgreements((a) => [
      ...a,
      {
        id,
        org_id: orgId,
        label: "新しいテンプレート",
        kind: "contract",
        scope: null,
        pay_mode: "hourly",
        pay_fixed: null,
        pay_pct: null,
        close_day: "月末",
        pay_day: "翌月15日",
        pay_method: "振込",
        open_term: true,
        body_text: null,
        agreement_extras: [],
      },
    ]);
    setOpenId(id);
  }

  async function handleDelete(id: string) {
    if (!confirm("このテンプレートを削除しますか？")) return;
    await deleteAgreement(id);
    setAgreements((a) => a.filter((x) => x.id !== id));
  }

  function patchLocal(id: string, patch: Partial<Agreement>) {
    setAgreements((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function commit(a: Agreement) {
    await updateAgreement(a.id, {
      label: a.label,
      kind: a.kind,
      scope: a.scope ?? "",
      pay_mode: a.pay_mode,
      pay_fixed: a.pay_fixed,
      pay_pct: a.pay_pct,
      close_day: a.close_day ?? "",
      pay_day: a.pay_day ?? "",
      pay_method: a.pay_method ?? "",
      open_term: a.open_term,
      body_text: a.body_text ?? "",
    });
  }

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div style={{ flex: 1, fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 15 }}>契約書テンプレート</div>
        <button onClick={handleAdd} style={smallBtn}>
          <Plus size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
          テンプレートを追加
        </button>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--color-neutral-500)", lineHeight: 1.6 }}>ここでは雛形を用意するだけです。スタッフへの送付・署名の管理は、スタッフ機能を作るときにあわせて対応します。</div>

      {agreements.length === 0 && <div style={{ fontSize: 12.5, color: "var(--color-neutral-500)" }}>まだテンプレートがありません。</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {agreements.map((a) => {
          const open = openId === a.id;
          return (
            <div key={a.id} style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--color-divider)", overflow: "hidden" }}>
              <button
                onClick={() => setOpenId(open ? null : a.id)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", cursor: "pointer", background: "var(--color-bg)", border: "none", textAlign: "left", color: "var(--color-text)" }}
              >
                {open ? <CaretDown size={13} /> : <CaretRight size={13} />}
                <span style={{ flex: 1, fontSize: 13.5 }}>{a.label || "（無題）"}</span>
                <span style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>{AGREEMENT_KINDS.find((k) => k.value === a.kind)?.label ?? a.kind}</span>
              </button>
              {open && (
                <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      <span style={label}>テンプレート名</span>
                      <input value={a.label} onChange={(e) => patchLocal(a.id, { label: e.target.value })} onBlur={() => commit(a)} className="vid-input" style={input} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      <span style={label}>種別</span>
                      <select
                        value={a.kind}
                        onChange={(e) => { const kind = e.target.value as AgreementKind; patchLocal(a.id, { kind }); commit({ ...a, kind }); }}
                        className="vid-input"
                        style={input}
                      >
                        {AGREEMENT_KINDS.map((k) => (
                          <option key={k.value} value={k.value}>{k.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <span style={label}>業務範囲・対象</span>
                    <input
                      value={a.scope ?? ""}
                      onChange={(e) => patchLocal(a.id, { scope: e.target.value })}
                      onBlur={() => commit(a)}
                      placeholder="例：動画編集業務全般"
                      className="vid-input"
                      style={input}
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      <span style={label}>報酬の形</span>
                      <select
                        value={a.pay_mode}
                        onChange={(e) => { const pay_mode = e.target.value as PayMode; patchLocal(a.id, { pay_mode }); commit({ ...a, pay_mode }); }}
                        className="vid-input"
                        style={input}
                      >
                        {PAY_MODES.map((m) => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>
                    </div>
                    {(a.pay_mode === "hourly" || a.pay_mode === "daily" || a.pay_mode === "monthly") && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        <span style={label}>金額（円）</span>
                        <input
                          type="number"
                          value={a.pay_fixed ?? 0}
                          onChange={(e) => patchLocal(a.id, { pay_fixed: Number(e.target.value) })}
                          onBlur={() => commit(a)}
                          className="vid-input"
                          style={input}
                        />
                      </div>
                    )}
                    {a.pay_mode === "share" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        <span style={label}>シェア（%）</span>
                        <input
                          type="number"
                          value={a.pay_pct ?? 0}
                          onChange={(e) => patchLocal(a.id, { pay_pct: Number(e.target.value) })}
                          onBlur={() => commit(a)}
                          className="vid-input"
                          style={input}
                        />
                      </div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      <span style={label}>支払方法</span>
                      <input
                        value={a.pay_method ?? ""}
                        onChange={(e) => patchLocal(a.id, { pay_method: e.target.value })}
                        onBlur={() => commit(a)}
                        className="vid-input"
                        style={input}
                      />
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      <span style={label}>締め日</span>
                      <input
                        value={a.close_day ?? ""}
                        onChange={(e) => patchLocal(a.id, { close_day: e.target.value })}
                        onBlur={() => commit(a)}
                        className="vid-input"
                        style={input}
                      />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      <span style={label}>支払日</span>
                      <input
                        value={a.pay_day ?? ""}
                        onChange={(e) => patchLocal(a.id, { pay_day: e.target.value })}
                        onBlur={() => commit(a)}
                        className="vid-input"
                        style={input}
                      />
                    </div>
                  </div>

                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-neutral-400)" }}>
                    <input
                      type="checkbox"
                      checked={a.open_term}
                      onChange={(e) => { patchLocal(a.id, { open_term: e.target.checked }); commit({ ...a, open_term: e.target.checked }); }}
                    />
                    期間の定めなし
                  </label>

                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <span style={label}>契約書の本文（雛形として使う条文）</span>
                    <textarea
                      value={a.body_text ?? ""}
                      onChange={(e) => patchLocal(a.id, { body_text: e.target.value })}
                      onBlur={() => commit(a)}
                      rows={5}
                      className="vid-input"
                      style={{ ...input, height: "auto", padding: "8px 10px", resize: "vertical" }}
                    />
                  </div>

                  <AgreementExtrasEditor agreementId={a.id} extras={a.agreement_extras} onChange={(extras) => patchLocal(a.id, { agreement_extras: extras })} />

                  <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 6, borderTop: "1px solid var(--color-divider)" }}>
                    <button onClick={() => handleDelete(a.id)} style={{ ...smallBtn, color: "var(--color-accent-200)", borderColor: "var(--color-divider)" }}>
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

function AgreementExtrasEditor({ agreementId, extras, onChange }: { agreementId: string; extras: AgreementExtra[]; onChange: (e: AgreementExtra[]) => void }) {
  async function add() {
    const clause = "新しい条項";
    await addAgreementExtra(agreementId, clause);
    onChange([...extras, { clause }]);
  }
  async function commit(oldClause: string, newClause: string) {
    if (oldClause === newClause) return;
    await updateAgreementExtra(agreementId, oldClause, newClause);
  }
  function patch(index: number, value: string) {
    onChange(extras.map((x, i) => (i === index ? { clause: value } : x)));
  }
  async function remove(clause: string) {
    await removeAgreementExtra(agreementId, clause);
    onChange(extras.filter((x) => x.clause !== clause));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={label}>追加の条項</span>
      {extras.map((x, i) => {
        const original = x.clause;
        return (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <textarea
              value={x.clause}
              onChange={(e) => patch(i, e.target.value)}
              onBlur={(e) => commit(original, e.target.value)}
              rows={2}
              className="vid-input"
              style={{ ...input, flex: 1, height: "auto", padding: "6px 8px", resize: "vertical" }}
            />
            <button onClick={() => remove(original)} aria-label="削除" style={{ flex: "none", width: 32, height: 32, cursor: "pointer", color: "var(--color-neutral-500)", background: "transparent", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}>
              <Trash size={13} />
            </button>
          </div>
        );
      })}
      <button onClick={add} style={{ alignSelf: "flex-start", ...smallBtn, height: 30 }}>
        ＋条項を追加
      </button>
    </div>
  );
}

const REFUND_STAGES: { key: RefundStage; label: string; when: string }[] = [
  { key: "prequote", label: "見積提示前のキャンセル", when: "見積を出す前の相談段階" },
  { key: "accepted", label: "見積承諾後・着手前", when: "承諾はあったが、まだ「着手する」を押していない" },
  { key: "started", label: "着手後のキャンセル", when: "「着手する」を押した後・完了報告の前" },
  { key: "delivered", label: "完了後の返金", when: "完了報告のあと。品質不備などがあれば受付が判断" },
  { key: "terminate", label: "大幅な遅延・担当終了", when: "対応の目安を過ぎても未完了の場合、依頼主を保護" },
];

const REFUND_MODES: { value: RefundMode; label: string }[] = [
  { value: "nocharge", label: "請求なし" },
  { value: "full", label: "全額返金" },
  { value: "partial", label: "部分返金" },
  { value: "none", label: "返金なし" },
];

function RefundPolicyCard({ orgId, initialPolicy }: { orgId: string; initialPolicy: RefundPolicyRow[] }) {
  const [rows, setRows] = useState(() =>
    REFUND_STAGES.map((s) => {
      const found = initialPolicy.find((p) => p.stage === s.key);
      return { ...s, mode: found?.mode ?? ("none" as RefundMode), pct: found?.pct ?? 0 };
    }),
  );

  function patch(i: number, p: Partial<{ mode: RefundMode; pct: number }>) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...p } : row)));
  }

  async function commit(row: (typeof rows)[number]) {
    await updateRefundPolicy(orgId, row.key, row.mode, row.pct);
  }

  return (
    <div style={card}>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 15 }}>キャンセル・返金ポリシー</div>
      <div style={{ fontSize: 11.5, color: "var(--color-neutral-500)", lineHeight: 1.6 }}>段階は依頼の進み方で決まるため固定です。受付が決めるのは、それぞれの段階の返金の扱いと割合だけです。</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((r, i) => (
          <div key={r.key} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--color-bg)", border: "1px solid var(--color-divider)" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 12.5 }}>{r.label}</span>
              <span style={{ fontSize: 10.5, color: "var(--color-neutral-500)" }}>{r.when}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <select
                value={r.mode}
                onChange={(e) => { const mode = e.target.value as RefundMode; patch(i, { mode }); commit({ ...r, mode }); }}
                className="vid-input"
                style={{ ...input, width: 130, height: 32 }}
              >
                {REFUND_MODES.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              {r.mode === "partial" && (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input
                    type="number"
                    value={r.pct}
                    onChange={(e) => patch(i, { pct: Number(e.target.value) })}
                    onBlur={() => commit(rows[i])}
                    className="vid-input"
                    style={{ ...input, width: 60, height: 32 }}
                  />
                  <span style={{ fontSize: 11.5, color: "var(--color-neutral-500)" }}>%</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 9, padding: "11px 13px", borderRadius: "var(--radius-md)", background: "var(--color-bg)", border: "1px solid var(--color-accent-800)" }}>
        <div style={{ minWidth: 0, fontSize: 11.5, color: "var(--color-neutral-400)", lineHeight: 1.6 }}>
          「着手」の定義：受付が対象の案件で「着手する」を押した時点です。押していなければ未着手として扱われ、キャンセル時は原則全額返金になります。
        </div>
      </div>
    </div>
  );
}
