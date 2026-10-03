"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, PaperPlaneTilt, Paperclip, Buildings, ArrowSquareOut, Trash, ChatCircleText, Star, SidebarSimple, X, CaretDown, CaretRight, Plus } from "@phosphor-icons/react";
import { headingWeight } from "@/lib/style";
import { errorMessage } from "@/lib/errors";
import { useIsMobile } from "@/lib/useIsMobile";
import { createClient } from "@/lib/supabase/client";
import {
  sendStaffMessage,
  deleteMessage,
  markThreadRead,
  convertCustomerToOrg,
  createCaseRequest,
  sendTemplateMessage,
  reassignThreadDepartment,
  createIntakeForm,
  updateIntakeForm,
  deleteIntakeForm,
  addIntakeField,
  updateIntakeField,
  deleteIntakeField,
  adjustCustomerBalance,
  updateCustomerStaffLabel,
} from "@/app/actions";
import { EMPTY_ORG_FORM, OrgAccountFields, slugify, type OrgAccountFormState } from "@/components/OrgAccountFields";
import WorkMemos, { type WorkMemo } from "@/components/WorkMemos";
import TextComposer from "@/components/TextComposer";
import Modal from "@/components/Modal";
import InfoTooltip from "@/components/InfoTooltip";
import { PHASE_LABEL } from "@/lib/stage";
import type { AppRole, RequestPhase, SubscriptionCadence } from "@/lib/supabase/types";

export interface ThreadAttachment {
  id: string;
  file_name: string;
  mime: string | null;
  bytes: number | null;
}

export interface ThreadReport {
  summary: string;
  details: { label: string; value: string }[];
  noteToCustomer: string | null;
}

export interface ThreadMessage {
  id: string;
  sender_id: string | null;
  sender_role: AppRole | null;
  kind: string;
  body: string | null;
  payload: unknown;
  sent_at: string;
  deleted_at: string | null;
  attachments: ThreadAttachment[];
  requestPhase?: RequestPhase | null;
  requestAmount?: number | null;
  report?: ThreadReport | null;
}

type Message = ThreadMessage;

// 会話が長くなっても初回表示・ポーリングが遅くならないよう、一度に読み込むメッセージ件数を絞る。
export const MESSAGE_PAGE_SIZE = 60;

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

interface TemplateField {
  id: string;
  label: string;
  kind: string;
  required: boolean;
}

interface TemplateInfo {
  id: string;
  label: string;
  note: string | null;
  fields: TemplateField[];
}

const FIELD_KINDS = [
  { value: "text", label: "テキスト" },
  { value: "tel", label: "電話番号" },
  { value: "email", label: "メールアドレス" },
  { value: "date", label: "日付" },
  { value: "textarea", label: "長文" },
];

function TemplatesModal({
  templates,
  setTemplates,
  orgId,
  busy,
  onClose,
  onSendForm,
  onUseText,
}: {
  templates: TemplateInfo[];
  setTemplates: React.Dispatch<React.SetStateAction<TemplateInfo[]>>;
  orgId: string;
  busy: boolean;
  onClose: () => void;
  onSendForm: (id: string) => void;
  onUseText: (text: string) => void;
}) {
  const forms = templates.filter((t) => t.fields.length > 0);
  const plain = templates.filter((t) => t.fields.length === 0);
  const [creating, setCreating] = useState(false);
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);

  async function handleAdd() {
    if (creating) return;
    setCreating(true);
    try {
      const id = await createIntakeForm(orgId);
      setTemplates((ts) => [...ts, { id, label: "新しいテンプレ", note: null, fields: [] }]);
      setJustCreatedId(id);
    } finally {
      setCreating(false);
    }
  }

  function patchLocal(id: string, patch: Partial<TemplateInfo>) {
    setTemplates((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  async function commit(t: TemplateInfo) {
    await updateIntakeForm(t.id, { label: t.label, note: t.note ?? "" });
  }

  async function handleDelete(id: string) {
    if (!confirm("このテンプレを削除しますか？")) return;
    await deleteIntakeForm(id);
    setTemplates((ts) => ts.filter((t) => t.id !== id));
  }

  async function handleAddField(templateId: string) {
    const t = templates.find((x) => x.id === templateId);
    const created = await addIntakeField(templateId, t?.fields.length ?? 0);
    setTemplates((ts) => ts.map((x) => (x.id === templateId ? { ...x, fields: [...x.fields, { id: created.id, label: "", kind: "text", required: false }] } : x)));
  }

  function patchFieldLocal(templateId: string, fieldId: string, patch: Partial<TemplateField>) {
    setTemplates((ts) => ts.map((t) => (t.id === templateId ? { ...t, fields: t.fields.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)) } : t)));
  }

  async function commitField(f: TemplateField) {
    await updateIntakeField(f.id, { label: f.label, kind: f.kind });
  }

  async function handleDeleteField(templateId: string, fieldId: string) {
    await deleteIntakeField(fieldId);
    setTemplates((ts) => ts.map((t) => (t.id === templateId ? { ...t, fields: t.fields.filter((f) => f.id !== fieldId) } : t)));
  }

  return (
    <Modal onClose={onClose} maxWidth={460}>
      <div style={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 20 }}>返信テンプレから送る</div>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} aria-label="閉じる" style={{ display: "flex", cursor: "pointer", color: "var(--color-neutral-400)", background: "transparent", border: "none" }}>
            <X size={18} />
          </button>
        </div>
        {forms.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ ...templateSectionLabel, color: "var(--color-accent-300)" }}>入力してもらう</span>
            {forms.map((t) => (
              <TemplateRow
                key={t.id}
                template={t}
                isForm
                busy={busy}
                onSend={() => onSendForm(t.id)}
                onUse={() => onUseText(t.note ?? t.label)}
                onPatch={(patch) => patchLocal(t.id, patch)}
                onCommit={() => commit(t)}
                onDelete={() => handleDelete(t.id)}
                onAddField={() => handleAddField(t.id)}
                onPatchField={(fieldId, patch) => patchFieldLocal(t.id, fieldId, patch)}
                onCommitField={commitField}
                onDeleteField={(fieldId) => handleDeleteField(t.id, fieldId)}
              />
            ))}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ ...templateSectionLabel, color: "var(--stb-seal-ink)" }}>送るだけ</span>
          {plain.length === 0 && <div style={{ fontSize: 12, color: "var(--color-neutral-500)" }}>まだテンプレがありません。</div>}
          {plain.map((t) => (
            <TemplateRow
              key={t.id}
              template={t}
              isForm={false}
              busy={busy}
              initialOpen={t.id === justCreatedId}
              onSend={() => onSendForm(t.id)}
              onUse={() => onUseText(t.note ?? t.label)}
              onPatch={(patch) => patchLocal(t.id, patch)}
              onCommit={() => commit(t)}
              onDelete={() => handleDelete(t.id)}
              onAddField={() => handleAddField(t.id)}
              onPatchField={(fieldId, patch) => patchFieldLocal(t.id, fieldId, patch)}
              onCommitField={commitField}
              onDeleteField={(fieldId) => handleDeleteField(t.id, fieldId)}
            />
          ))}
          <button onClick={handleAdd} disabled={creating} style={templateAddBtn}>
            <Plus size={13} /> 新しいテンプレを作る
          </button>
        </div>
      </div>
    </Modal>
  );
}

const templateSectionLabel: React.CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: "0.05em" };
const templateRowHeader: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, padding: "10px 12px" };
const templateCaretBtn: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0, cursor: "pointer", background: "transparent", border: "none", textAlign: "left", color: "var(--color-text)" };
const templateCountBadge: React.CSSProperties = { flex: "none", fontSize: 10.5 };
const templateSendBtn: React.CSSProperties = { flex: "none", width: 28, height: 28, display: "grid", placeItems: "center", cursor: "pointer", color: "var(--color-accent-100)", background: "var(--color-accent-900)", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)" };
const templateSendBtnText: React.CSSProperties = { flex: "none", width: 28, height: 28, display: "grid", placeItems: "center", cursor: "pointer", color: "var(--stb-seal-ink)", background: "transparent", border: "1px solid var(--stb-seal-ink)", borderRadius: "var(--radius-md)" };
const templateDeleteBtn: React.CSSProperties = { alignSelf: "flex-end", display: "flex", alignItems: "center", gap: 4, marginTop: 4, cursor: "pointer", fontSize: 11, color: "var(--stb-seal-ink)", background: "transparent", border: "none" };
const templateAddBtn: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, height: 34, cursor: "pointer", fontSize: 12.5, color: "var(--stb-seal-ink)", background: "transparent", border: "1px dashed var(--stb-seal-ink)", borderRadius: "var(--radius-md)" };
const templateEditInput: React.CSSProperties = { height: 32, padding: "0 10px", fontSize: 12.5, color: "var(--color-text)", background: "var(--color-bg)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)", outline: "none" };
const templateAddFieldBtn: React.CSSProperties = { alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 4, height: 28, padding: "0 10px", cursor: "pointer", fontSize: 11.5, color: "var(--color-accent)", background: "transparent", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)" };
const templateFieldDeleteBtn: React.CSSProperties = { width: 28, height: 28, display: "grid", placeItems: "center", cursor: "pointer", color: "var(--color-neutral-500)", background: "transparent", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" };

function TemplateRow({
  template,
  isForm,
  busy,
  initialOpen,
  onSend,
  onUse,
  onPatch,
  onCommit,
  onDelete,
  onAddField,
  onPatchField,
  onCommitField,
  onDeleteField,
}: {
  template: TemplateInfo;
  isForm: boolean;
  busy: boolean;
  initialOpen?: boolean;
  onSend: () => void;
  onUse: () => void;
  onPatch: (patch: Partial<TemplateInfo>) => void;
  onCommit: () => void;
  onDelete: () => void;
  onAddField: () => void;
  onPatchField: (fieldId: string, patch: Partial<TemplateField>) => void;
  onCommitField: (field: TemplateField) => void;
  onDeleteField: (fieldId: string) => void;
}) {
  const [open, setOpen] = useState(!!initialOpen);
  const accentColor = isForm ? "var(--color-accent)" : "var(--stb-seal-ink)";
  const text = template.note ?? template.label;
  const lineCount = text.split("\n").length;
  return (
    <div style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--color-divider)", borderLeft: `3px solid ${accentColor}`, background: "var(--color-surface)", overflow: "hidden" }}>
      <div style={templateRowHeader}>
        <button onClick={() => setOpen((v) => !v)} style={templateCaretBtn}>
          {open ? <CaretDown size={13} color="var(--color-neutral-500)" /> : <CaretRight size={13} color="var(--color-neutral-500)" />}
          <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{template.label || "（無題）"}</span>
        </button>
        <span style={{ ...templateCountBadge, color: accentColor }}>{isForm ? `${template.fields.length}項目` : `${lineCount}行`}</span>
        <button
          onClick={isForm ? onSend : onUse}
          disabled={isForm && busy}
          aria-label={isForm ? "この内容で送信" : "この内容を入力欄にセット"}
          style={isForm ? templateSendBtn : templateSendBtnText}
        >
          <PaperPlaneTilt size={13} />
        </button>
      </div>
      {open && (
        <div style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          <input value={template.label} onChange={(e) => onPatch({ label: e.target.value })} onBlur={onCommit} placeholder="テンプレ名" className="vid-input" style={templateEditInput} />
          <textarea
            value={template.note ?? ""}
            onChange={(e) => onPatch({ note: e.target.value })}
            onBlur={onCommit}
            rows={3}
            placeholder={isForm ? "項目の前に添える案内文（空でも可）" : "送信する文章"}
            className="vid-input"
            style={{ ...templateEditInput, height: "auto", padding: "8px 10px", resize: "vertical" }}
          />
          {template.fields.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {template.fields.map((f, i) => (
                <div key={f.id} style={{ display: "grid", gridTemplateColumns: "16px minmax(0,1fr) 100px 28px", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>{i + 1}</span>
                  <input
                    value={f.label}
                    onChange={(e) => onPatchField(f.id, { label: e.target.value })}
                    onBlur={() => onCommitField(f)}
                    placeholder="項目名（例：ご希望の日時）"
                    className="vid-input"
                    style={{ ...templateEditInput, height: 30, fontSize: 12 }}
                  />
                  <select
                    value={f.kind}
                    onChange={(e) => {
                      onPatchField(f.id, { kind: e.target.value });
                      onCommitField({ ...f, kind: e.target.value });
                    }}
                    className="vid-input"
                    style={{ ...templateEditInput, height: 30, fontSize: 11.5, padding: "0 6px" }}
                  >
                    {FIELD_KINDS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                  <button onClick={() => onDeleteField(f.id)} aria-label="項目を削除" style={templateFieldDeleteBtn}>
                    <Trash size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button onClick={onAddField} style={templateAddFieldBtn}>
            <Plus size={11} /> 項目を追加
          </button>
          <button onClick={onDelete} style={templateDeleteBtn}>
            <Trash size={12} /> このテンプレを削除
          </button>
        </div>
      )}
    </div>
  );
}

function summarize(m: Message): string {
  const p = m.payload as { title?: string; menuLabel?: string; total?: number; summary?: string; formLabel?: string };
  switch (m.kind) {
    case "text":
      return m.body ?? "";
    case "files":
      return m.attachments.length ? `［添付ファイル］${m.attachments.map((a) => a.file_name).join("・")}` : "［添付ファイル］";
    case "quote":
      return `［見積もり］${p.title ?? ""}${p.total != null ? ` ¥${Number(p.total).toLocaleString("ja-JP")}` : ""}`;
    case "menu_pick":
      return `［メニュー選択］${p.menuLabel ?? ""}`;
    case "report":
      return `［完了報告］${p.summary ?? ""}`;
    case "rating":
      return "［評価］";
    case "notice":
      return `［お知らせ］${m.body ?? ""}`;
    case "off_choice":
      return `［選択］${m.body ?? ""}`;
    case "intake_request":
      return `［確認事項］${p.formLabel ?? m.body ?? ""}`;
    case "intake_answer":
      return `［確認事項への回答］${p.formLabel ?? ""}`;
    case "system":
      return m.body ?? "［システム］";
    default:
      return m.body ?? `［${m.kind}］`;
  }
}

const PHASE_BADGE_COLOR: Partial<Record<RequestPhase, { color: string; border: string }>> = {
  quoted: { color: "var(--color-neutral-400)", border: "var(--color-divider)" },
  preparing: { color: "var(--color-accent-300)", border: "var(--color-accent-700)" },
  started: { color: "var(--color-accent-100)", border: "var(--color-accent-700)" },
  completed: { color: "var(--color-accent)", border: "var(--color-accent)" },
  cancelled: { color: "var(--color-neutral-400)", border: "var(--color-divider)" },
  declined: { color: "var(--color-neutral-400)", border: "var(--color-divider)" },
};

function QuoteBubble({ msg }: { msg: Message }) {
  const p = msg.payload as { title?: string; note?: string; due?: string };
  const phase = msg.requestPhase;
  const badge = phase ? (PHASE_BADGE_COLOR[phase] ?? PHASE_BADGE_COLOR.quoted) : null;

  return (
    <div style={{ width: "min(280px, 100%)", padding: "11px 13px", borderRadius: "var(--radius-lg)", background: "var(--color-surface)", border: "1.5px solid var(--color-accent)", boxShadow: "var(--shadow-sm)", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ flex: "none", fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", color: "var(--color-bg)", background: "var(--color-accent)", padding: "2px 8px", borderRadius: 6 }}>見積もり</span>
        {phase && badge && (
          <span style={{ marginLeft: "auto", flex: "none", fontSize: 10, padding: "2px 8px", borderRadius: 6, border: `1px solid ${badge.border}`, color: badge.color, whiteSpace: "nowrap" }}>
            {PHASE_LABEL[phase]}
          </span>
        )}
      </div>
      <div style={{ fontSize: 14, fontFamily: "var(--font-heading)", fontWeight: headingWeight, lineHeight: 1.3 }}>{p.title}</div>
      {p.note && <div style={{ fontSize: 12, color: "var(--color-neutral-500)" }}>{p.note}</div>}
      {msg.requestAmount != null && <div style={{ fontSize: 17, fontFamily: "var(--font-heading)", fontWeight: 600 }}>¥{msg.requestAmount.toLocaleString("ja-JP")}</div>}
      {p.due && <div style={{ fontSize: 11.5, color: "var(--color-neutral-400)" }}>対応の目安：{p.due}</div>}

      {phase === "completed" && msg.report && (
        <div style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 10.5, color: "var(--color-accent)" }}>完了報告</div>
          <div style={{ fontSize: 12.5 }}>{msg.report.summary}</div>
          {msg.report.details.map((d, i) => (
            <div key={i} style={{ display: "flex", gap: 8, fontSize: 12 }}>
              <span style={{ width: 60, flex: "none", color: "var(--color-neutral-400)" }}>{d.label}</span>
              <span style={{ minWidth: 0, flex: 1 }}>{d.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MenuPickBubble({ msg }: { msg: Message }) {
  const p = msg.payload as { menuLabel?: string; rows?: { label: string; value: string }[]; note?: string };
  return (
    <div style={{ width: "min(280px, 100%)", padding: "11px 13px", borderRadius: "var(--radius-lg)", background: "var(--color-surface)", border: "1px solid var(--color-divider)", display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 10, letterSpacing: "0.05em", color: "var(--color-neutral-500)" }}>メニュー選択</span>
      <div style={{ fontSize: 14, fontFamily: "var(--font-heading)", fontWeight: headingWeight, lineHeight: 1.3 }}>{p.menuLabel}</div>
      {!!p.rows?.length && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingTop: 6, borderTop: "1px solid var(--color-divider)" }}>
          {p.rows.map((rw, i) => (
            <div key={i} style={{ display: "flex", gap: 8, fontSize: 12 }}>
              <span style={{ width: 88, flex: "none", color: "var(--color-neutral-500)" }}>{rw.label}</span>
              <span style={{ minWidth: 0, flex: 1 }}>{rw.value}</span>
            </div>
          ))}
        </div>
      )}
      {p.note && <div style={{ fontSize: 12.5, paddingTop: 6, borderTop: p.rows?.length ? "none" : "1px solid var(--color-divider)" }}>{p.note}</div>}
    </div>
  );
}

function IntakeAnswerBubble({ msg }: { msg: Message }) {
  const p = msg.payload as { formLabel?: string; rows?: { label: string; value: string }[] };
  return (
    <div style={{ width: "min(280px, 100%)", padding: "11px 13px", borderRadius: "var(--radius-lg)", background: "var(--color-surface)", border: "1px solid var(--color-divider)", display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 10, letterSpacing: "0.05em", color: "var(--color-neutral-500)" }}>{p.formLabel ?? "確認事項"}への回答</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {(p.rows ?? []).map((rw, i) => (
          <div key={i} style={{ display: "flex", gap: 8, fontSize: 12.5 }}>
            <span style={{ width: 88, flex: "none", color: "var(--color-neutral-500)" }}>{rw.label}</span>
            <span style={{ minWidth: 0, flex: 1 }}>{rw.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CustomerThread({
  customer,
  thread,
  departments,
  initialMessages,
  currentUserId,
  orgId,
  isHq,
  convertedOrg,
  templates: initialTemplates,
  menus,
  memos,
  ratings,
  latestRequest,
  initialHasMoreOlder,
}: {
  customer: { id: string; name: string; staffLabel: string | null; memberNo: string | null; balance: number };
  thread: { id: string; archived: boolean; departmentId: string | null } | null;
  departments: { id: string; name: string }[];
  initialMessages: Message[];
  initialHasMoreOlder?: boolean;
  currentUserId: string;
  orgId: string;
  isHq: boolean;
  convertedOrg: { displayName: string; slug: string | null } | null;
  templates: TemplateInfo[];
  menus: MenuOption[];
  memos: WorkMemo[];
  ratings: { average: number | null; count: number; items: { stars: number | null; comment: string | null }[] };
  latestRequest: { id: string; title: string; amount: number; phase: RequestPhase } | null;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [templates, setTemplates] = useState(initialTemplates);
  const [showTemplates, setShowTemplates] = useState(false);
  const isMobile = useIsMobile();
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [oldestLoadedAt, setOldestLoadedAt] = useState<string | null>(initialMessages[0]?.sent_at ?? null);
  const [hasMoreOlder, setHasMoreOlder] = useState(!!initialHasMoreOlder);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const skipAutoScrollRef = useRef(false);
  const [balance, setBalance] = useState(customer.balance);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [adjustSaving, setAdjustSaving] = useState(false);
  const [adjustError, setAdjustError] = useState("");

  const [staffLabel, setStaffLabel] = useState(customer.staffLabel);
  const [labelOpen, setLabelOpen] = useState(false);
  const [labelDraft, setLabelDraft] = useState(customer.staffLabel ?? "");
  const [labelSaving, setLabelSaving] = useState(false);
  const [labelError, setLabelError] = useState("");

  async function submitStaffLabel() {
    if (labelSaving) return;
    setLabelSaving(true);
    setLabelError("");
    try {
      await updateCustomerStaffLabel(customer.id, labelDraft);
      setStaffLabel(labelDraft.trim() || null);
      setLabelOpen(false);
    } catch (e) {
      setLabelError(errorMessage(e, "変更できませんでした"));
    } finally {
      setLabelSaving(false);
    }
  }

  async function submitAdjustment() {
    if (adjustSaving) return;
    const amount = Number(adjustAmount);
    if (!Number.isInteger(amount) || amount === 0) {
      setAdjustError("金額を入力してください（マイナスも可）");
      return;
    }
    setAdjustSaving(true);
    setAdjustError("");
    try {
      await adjustCustomerBalance(customer.id, amount, adjustNote);
      setBalance((b) => b + amount);
      setAdjustAmount("");
      setAdjustNote("");
      setAdjustOpen(false);
    } catch (e) {
      setAdjustError(errorMessage(e, "変更できませんでした"));
    } finally {
      setAdjustSaving(false);
    }
  }

  useEffect(() => {
    if (thread) void markThreadRead(thread.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread?.id]);

  useEffect(() => {
    if (skipAutoScrollRef.current) {
      skipAutoScrollRef.current = false;
      return;
    }
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const MESSAGE_SELECT = "*, message_attachments(*), requests(phase, amount, completion_reports(summary, details, note_to_customer))";

  // 開いている間に届いた新着分だけを取りに行く（既に読み込んだ最古の時点以降のみ）。
  // 会話全体を毎回取り直すと、履歴が長い依頼主ほどポーリングのたびに重くなるため。
  const refresh = useCallback(async () => {
    if (!thread) return;
    const supabase = createClient(orgId);
    const { data } = oldestLoadedAt
      ? await supabase.from("messages").select(MESSAGE_SELECT).eq("thread_id", thread.id).gte("sent_at", oldestLoadedAt).order("sent_at", { ascending: true })
      : await supabase.from("messages").select(MESSAGE_SELECT).eq("thread_id", thread.id).order("sent_at", { ascending: false }).limit(MESSAGE_PAGE_SIZE);
    if (data) {
      const rows = oldestLoadedAt ? data : data.slice().reverse();
      setMessages(
        rows.map((m) => {
          const req = Array.isArray(m.requests) ? m.requests[0] : m.requests;
          const reportRaw = req ? (Array.isArray(req.completion_reports) ? req.completion_reports[0] : req.completion_reports) : null;
          return {
            ...m,
            attachments: m.message_attachments ?? [],
            requestPhase: req?.phase ?? null,
            requestAmount: req?.amount ?? null,
            report: reportRaw ? { summary: reportRaw.summary, details: reportRaw.details ?? [], noteToCustomer: reportRaw.note_to_customer } : null,
          };
        }),
      );
      if (!oldestLoadedAt && rows.length > 0) setOldestLoadedAt(rows[0].sent_at);
    }
    // 開いている間に届いた分もその場で既読にする
    void markThreadRead(thread.id);
  }, [thread, orgId, oldestLoadedAt]);

  async function loadOlder() {
    if (!thread || loadingOlder || !hasMoreOlder || !oldestLoadedAt) return;
    setLoadingOlder(true);
    try {
      const supabase = createClient(orgId);
      const { data } = await supabase
        .from("messages")
        .select(MESSAGE_SELECT)
        .eq("thread_id", thread.id)
        .lt("sent_at", oldestLoadedAt)
        .order("sent_at", { ascending: false })
        .limit(MESSAGE_PAGE_SIZE);
      const rows = data ?? [];
      if (rows.length > 0) {
        const older = rows
          .slice()
          .reverse()
          .map((m) => {
            const req = Array.isArray(m.requests) ? m.requests[0] : m.requests;
            const reportRaw = req ? (Array.isArray(req.completion_reports) ? req.completion_reports[0] : req.completion_reports) : null;
            return {
              ...m,
              attachments: m.message_attachments ?? [],
              requestPhase: req?.phase ?? null,
              requestAmount: req?.amount ?? null,
              report: reportRaw ? { summary: reportRaw.summary, details: reportRaw.details ?? [], noteToCustomer: reportRaw.note_to_customer } : null,
            };
          });
        const container = scrollRef.current;
        const prevScrollHeight = container?.scrollHeight ?? 0;
        skipAutoScrollRef.current = true;
        setMessages((prev) => [...older, ...prev]);
        setOldestLoadedAt(older[0].sent_at);
        requestAnimationFrame(() => {
          if (container) container.scrollTop = container.scrollHeight - prevScrollHeight;
        });
      }
      setHasMoreOlder(rows.length === MESSAGE_PAGE_SIZE);
    } finally {
      setLoadingOlder(false);
    }
  }

  useEffect(() => {
    if (!thread) return;
    const supabase = createClient(orgId);
    const channel = supabase
      .channel(`staff-thread-${thread.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `thread_id=eq.${thread.id}` }, refresh)
      .subscribe();
    // WebSocket通知だけに頼らず、数秒おきのポーリングも保険として併用する
    // （接続直後の認証タイミング等でイベントを取りこぼしても、数秒以内に追いつく）。
    const interval = setInterval(refresh, 4000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [thread, orgId, refresh]);

  async function send() {
    if (!thread || sending || !draft.trim()) return;
    setSending(true);
    const body = draft.trim();
    try {
      await sendStaffMessage(thread.id, body);
      setDraft("");
      await refresh();
    } finally {
      setSending(false);
    }
  }

  async function handleDeleteMessage(m: Message) {
    if (busy) return;
    if (!confirm("このメッセージを削除します。よろしいですか？")) return;
    setBusy(true);
    try {
      await deleteMessage(m.id);
      setMessages((rows) => rows.map((r) => (r.id === m.id ? { ...r, deleted_at: new Date().toISOString() } : r)));
    } finally {
      setBusy(false);
    }
  }

  async function sendTemplateForm(templateId: string) {
    if (!thread || busy) return;
    setBusy(true);
    try {
      await sendTemplateMessage(thread.id, templateId);
      setShowTemplates(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", height: "100%" }}>
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 10, padding: "16px 20px", borderBottom: "1px solid var(--color-divider)" }}>
        <Link href="/customers" aria-label="依頼主一覧に戻る" style={{ display: "flex", color: "var(--color-neutral-400)" }}>
          <ArrowLeft size={17} />
        </Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{staffLabel ?? customer.name}</div>
          <div style={{ fontSize: 11, color: "var(--color-neutral-500)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {customer.memberNo ?? "—"}
            {staffLabel && `・本人の登録名：${customer.name}`}
          </div>
        </div>
        <button
          onClick={() => {
            setLabelDraft(staffLabel ?? "");
            setLabelOpen((v) => !v);
          }}
          style={{ flex: "none", fontSize: 11, color: "var(--color-neutral-400)", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
        >
          社内表示名
        </button>
        {thread && departments.length > 0 && (
          <ThreadDepartmentControl threadId={thread.id} departments={departments} initialDepartmentId={thread.departmentId} />
        )}
        {isMobile && (
          <button
            onClick={() => setShowInfoPanel(true)}
            aria-label="依頼主の情報を表示"
            style={{ flex: "none", display: "flex", cursor: "pointer", color: "var(--color-neutral-400)", background: "transparent", border: "none" }}
          >
            <SidebarSimple size={19} />
          </button>
        )}
      </div>

      {labelOpen && (
        <div style={{ margin: "14px 20px 0", display: "flex", flexDirection: "column", gap: 6, padding: 10, borderRadius: "var(--radius-md)", background: "var(--color-surface)", border: "1px solid var(--color-divider)" }}>
          <div style={{ fontSize: 10.5, color: "var(--color-neutral-600)", lineHeight: 1.6 }}>
            本部・マネージャーが社内向けに付ける呼び方です。依頼主本人が登録した名前とは別に持てます（未入力に戻すと本人の登録名を表示します）。
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              placeholder={customer.name}
              style={{ flex: 1, minWidth: 160, height: 32, padding: "4px 8px", fontSize: 12.5, color: "var(--color-text)", background: "var(--color-bg)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)", outline: "none" }}
            />
          </div>
          {labelError && <span style={{ fontSize: 11, color: "var(--color-accent-200)" }}>{labelError}</span>}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setLabelOpen(false)} style={{ height: 30, padding: "0 10px", cursor: "pointer", fontSize: 11.5, color: "var(--color-neutral-400)", background: "transparent", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}>
              閉じる
            </button>
            <button onClick={submitStaffLabel} disabled={labelSaving} style={{ height: 30, padding: "0 12px", cursor: "pointer", fontSize: 11.5, color: "var(--color-accent-100)", background: "var(--color-accent-900)", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)" }}>
              {labelSaving ? "処理中…" : "保存する"}
            </button>
          </div>
        </div>
      )}

      <div style={{ padding: "14px 20px 0", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11.5, color: "var(--color-neutral-500)" }}>残高</span>
          <span style={{ fontFamily: "var(--font-heading)", fontSize: 14 }}>¥{balance.toLocaleString("ja-JP")}</span>
          <button onClick={() => setAdjustOpen((v) => !v)} style={{ fontSize: 11, color: "var(--color-neutral-400)", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
            調整
          </button>
        </div>
        {adjustOpen && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: 10, borderRadius: "var(--radius-md)", background: "var(--color-surface)", border: "1px solid var(--color-divider)" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                placeholder="金額（例：-5000、+3000）"
                inputMode="numeric"
                style={{ width: 160, height: 32, padding: "4px 8px", fontSize: 12.5, color: "var(--color-text)", background: "var(--color-bg)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)", outline: "none" }}
              />
              <input
                value={adjustNote}
                onChange={(e) => setAdjustNote(e.target.value)}
                placeholder="理由（任意・依頼主にも通知されます）"
                style={{ flex: 1, minWidth: 160, height: 32, padding: "4px 8px", fontSize: 12.5, color: "var(--color-text)", background: "var(--color-bg)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)", outline: "none" }}
              />
            </div>
            {adjustError && <span style={{ fontSize: 11, color: "var(--color-accent-200)" }}>{adjustError}</span>}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setAdjustOpen(false)} style={{ height: 30, padding: "0 10px", cursor: "pointer", fontSize: 11.5, color: "var(--color-neutral-400)", background: "transparent", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}>
                閉じる
              </button>
              <button onClick={submitAdjustment} disabled={adjustSaving} style={{ height: 30, padding: "0 12px", cursor: "pointer", fontSize: 11.5, color: "var(--color-accent-100)", background: "var(--color-accent-900)", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)" }}>
                {adjustSaving ? "処理中…" : "反映する"}
              </button>
            </div>
          </div>
        )}
      </div>

      {isHq && (
        <div style={{ padding: "14px 20px 0" }}>
          {convertedOrg ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: "var(--color-accent-200)" }}>
              <Buildings size={14} />
              {convertedOrg.displayName} として登録済み
              {convertedOrg.slug && (
                <a href={`https://port.s-stylegolf.com/${convertedOrg.slug}`} target="_blank" rel="noreferrer" style={{ display: "flex", color: "var(--color-neutral-400)" }} aria-label="サイトを開く">
                  <ArrowSquareOut size={13} />
                </a>
              )}
            </div>
          ) : (
            <ConvertSection customerId={customer.id} customerName={customer.name} />
          )}
        </div>
      )}

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        {!thread && <div style={{ fontSize: 13, color: "var(--color-neutral-500)" }}>まだやり取りがありません。</div>}
        {hasMoreOlder && (
          <button
            onClick={loadOlder}
            disabled={loadingOlder}
            style={{ alignSelf: "center", height: 30, padding: "0 14px", cursor: "pointer", fontSize: 12, color: "var(--color-neutral-400)", background: "transparent", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}
          >
            {loadingOlder ? "読み込み中…" : "過去のメッセージを読み込む"}
          </button>
        )}
        {messages.map((m) => {
          const isStaff = m.sender_role !== "client" && m.sender_role !== "creator" && m.sender_role !== null;
          const isOwn = m.sender_id === currentUserId;
          return (
            <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: isStaff ? "flex-end" : "flex-start" }}>
              {m.deleted_at ? (
                <div style={{ maxWidth: "70%", padding: "9px 13px", fontSize: 12.5, fontStyle: "italic", color: "var(--color-neutral-500)" }}>
                  削除されました
                </div>
              ) : m.kind === "quote" ? (
                <QuoteBubble msg={m} />
              ) : m.kind === "menu_pick" ? (
                <MenuPickBubble msg={m} />
              ) : m.kind === "intake_answer" ? (
                <IntakeAnswerBubble msg={m} />
              ) : (
                <div
                  style={{
                    maxWidth: "70%",
                    padding: "9px 13px",
                    borderRadius: "var(--radius-lg)",
                    fontSize: 13.5,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    background: isStaff ? "var(--color-bubble-self-bg)" : "var(--color-bubble-other-bg)",
                    color: isStaff ? "var(--color-bubble-self-text)" : "var(--color-bubble-other-text)",
                    border: isStaff ? "none" : "1px solid var(--color-divider)",
                  }}
                >
                  {summarize(m)}
                </div>
              )}
              {!m.deleted_at && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 10, color: "var(--color-neutral-600)" }}>
                    {new Date(m.sent_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {isOwn && (
                    <button onClick={() => handleDeleteMessage(m)} disabled={busy} aria-label="削除" style={{ display: "flex", cursor: "pointer", color: "var(--color-neutral-500)", background: "transparent", border: "none" }}>
                      <Trash size={13} />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {thread && showTemplates && (
        <TemplatesModal
          templates={templates}
          setTemplates={setTemplates}
          orgId={orgId}
          busy={busy}
          onClose={() => setShowTemplates(false)}
          onSendForm={sendTemplateForm}
          onUseText={(text) => {
            setDraft(text);
            setShowTemplates(false);
          }}
        />
      )}
      {thread && (
        <TextComposer
          value={draft}
          onChange={setDraft}
          onSend={send}
          sending={sending}
          placeholder="返信を入力…"
          leftButton={
            <button
              onClick={() => setShowTemplates((v) => !v)}
              aria-label="テンプレを選ぶ"
              style={{ flex: "none", width: 40, height: 40, display: "grid", placeItems: "center", cursor: "pointer", color: "var(--color-neutral-400)", background: "transparent", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}
            >
              <ChatCircleText size={16} />
            </button>
          }
        />
      )}
      {thread && (
        <div style={{ flex: "none", padding: "0 20px 12px", fontSize: 10.5, color: "var(--color-neutral-600)", display: "flex", alignItems: "center", gap: 5 }}>
          <Paperclip size={11} />
          ファイルの添付は次のフェーズで対応します。
        </div>
      )}
    </div>

    {(!isMobile || showInfoPanel) && (
      <>
        {isMobile && <div onClick={() => setShowInfoPanel(false)} style={{ position: "fixed", inset: 0, zIndex: 69, background: "color-mix(in srgb, var(--color-bg) 55%, transparent)" }} />}
        <div
          style={
            isMobile
              ? { position: "fixed", top: 0, right: 0, bottom: 0, width: "min(320px, 88vw)", zIndex: 70, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 18, background: "var(--color-surface)", borderLeft: "1px solid var(--color-divider)" }
              : { flex: "none", width: 300, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 18, borderLeft: "1px solid var(--color-divider)" }
          }
        >
          {isMobile && (
            <button
              onClick={() => setShowInfoPanel(false)}
              aria-label="閉じる"
              style={{ alignSelf: "flex-end", display: "flex", cursor: "pointer", color: "var(--color-neutral-400)", background: "transparent", border: "none" }}
            >
              <X size={18} />
            </button>
          )}
          {!isHq && <RatingsSummary ratings={ratings} />}
          <WorkMemos customerId={customer.id} currentUserId={currentUserId} initialMemos={memos} />
          {!isHq && (
            <CaseSummarySection thread={thread} customerId={customer.id} menus={menus} latestRequest={latestRequest} />
          )}
        </div>
      </>
    )}
    </div>
  );
}

function RatingsSummary({ ratings }: { ratings: { average: number | null; count: number; items: { stars: number | null; comment: string | null }[] } }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={ratings.count === 0}
        style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--color-neutral-400)", background: "transparent", border: "none", cursor: ratings.count === 0 ? "default" : "pointer", padding: 0 }}
      >
        依頼主の評価{ratings.count > 0 ? `（平均★${ratings.average?.toFixed(1)}・${ratings.count}件）` : "（まだありません）"}
      </button>
      {open && ratings.items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10, borderRadius: "var(--radius-md)", background: "var(--color-surface)", border: "1px solid var(--color-divider)" }}>
          {ratings.items.map((r, i) => (
            <div key={i} style={{ fontSize: 12 }}>
              <div style={{ display: "flex", gap: 2 }}>
                {Array.from({ length: 5 }).map((_, j) => (
                  <Star key={j} size={12} weight={r.stars != null && j < r.stars ? "fill" : "regular"} color="var(--color-accent-300)" />
                ))}
              </div>
              {r.comment && <div style={{ marginTop: 2 }}>{r.comment}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CaseSummarySection({
  thread,
  customerId,
  menus,
  latestRequest,
}: {
  thread: { id: string; archived: boolean } | null;
  customerId: string;
  menus: MenuOption[];
  latestRequest: { id: string; title: string; amount: number; phase: RequestPhase } | null;
}) {
  const router = useRouter();
  const [showDialog, setShowDialog] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ flex: 1, fontSize: 11.5, color: "var(--color-neutral-400)" }}>このトークの依頼</span>
        {thread && (
          <button
            onClick={() => setShowDialog(true)}
            style={{ flex: "none", height: 24, padding: "0 10px", cursor: "pointer", fontSize: 11, color: "var(--color-accent)", background: "transparent", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-sm)" }}
          >
            見積もり
          </button>
        )}
      </div>
      {showDialog && thread && (
        <QuoteDialog
          threadId={thread.id}
          customerId={customerId}
          menus={menus}
          onClose={() => setShowDialog(false)}
          onCreated={(requestId) => {
            setShowDialog(false);
            router.push(`/cases/${requestId}`);
          }}
        />
      )}
      {latestRequest ? (
        <Link
          href={`/cases/${latestRequest.id}`}
          style={{ display: "flex", flexDirection: "column", gap: 4, padding: 10, borderRadius: "var(--radius-md)", border: "1px solid var(--color-divider)", background: "var(--color-surface)", textDecoration: "none", color: "inherit" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{latestRequest.title}</span>
            <span style={{ flex: "none", fontSize: 10, padding: "2px 8px", borderRadius: 6, border: "1px solid var(--color-divider)", color: "var(--color-neutral-400)" }}>{PHASE_LABEL[latestRequest.phase]}</span>
          </div>
          <div style={{ fontSize: 14, fontFamily: "var(--font-heading)", fontWeight: 600 }}>¥{latestRequest.amount.toLocaleString("ja-JP")}</div>
        </Link>
      ) : (
        <div style={{ fontSize: 12, color: "var(--color-neutral-500)", lineHeight: 1.6 }}>
          まだ依頼はありません。会話の内容が正式な依頼になったら見積もりを発行してください。
        </div>
      )}
    </div>
  );
}

// 話の内容が別の窓口の担当になったときに、受付側でその場で切り替える
// ためのコントロール。人間秘書の担当交代と同じ発想で、依頼主から見える
// 表示（「受付」）は変わらない。
function ThreadDepartmentControl({
  threadId,
  departments,
  initialDepartmentId,
}: {
  threadId: string;
  departments: { id: string; name: string }[];
  initialDepartmentId: string | null;
}) {
  const [departmentId, setDepartmentId] = useState(initialDepartmentId ?? "");
  const [saving, setSaving] = useState(false);

  async function change(next: string) {
    if (saving) return;
    const prev = departmentId;
    setDepartmentId(next);
    setSaving(true);
    try {
      await reassignThreadDepartment(threadId, next || null);
    } catch {
      setDepartmentId(prev);
    } finally {
      setSaving(false);
    }
  }

  return (
    <select
      value={departmentId}
      onChange={(e) => change(e.target.value)}
      disabled={saving}
      aria-label="担当窓口"
      className="vid-input"
      style={{
        flex: "none",
        height: 30,
        padding: "0 8px",
        fontSize: 11.5,
        color: "var(--color-text)",
        background: "var(--color-bg)",
        border: "1px solid var(--color-divider)",
        borderRadius: "var(--radius-md)",
        outline: "none",
      }}
    >
      <option value="">窓口未設定</option>
      {departments.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </select>
  );
}

function ConvertSection({ customerId, customerName }: { customerId: string; customerName: string }) {
  const [open, setOpen] = useState(false);
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
    } catch (e) {
      setError(errorMessage(e, "登録できませんでした"));
    } finally {
      setSaving(false);
    }
  }

  if (created) {
    return (
      <div style={{ ...card, border: "1px solid var(--color-accent-800)", background: "var(--color-accent-900)" }}>
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

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={smallBtn}>
        事業者として登録
      </button>
    );
  }

  return (
    <div style={card}>
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
        <button onClick={() => setOpen(false)} style={{ ...smallBtn, height: 36, color: "var(--color-neutral-400)", borderColor: "var(--color-divider)" }}>
          キャンセル
        </button>
      </div>
    </div>
  );
}

interface MenuOption {
  id: string;
  label: string;
  note: string | null;
  price: number | null;
  payout: number;
  leadHours: number;
}

interface CustomItem {
  label: string;
  price: number;
  qty: number;
  leadHours: number | null;
}

function hoursToDueLabel(hours: number): string {
  if (hours <= 24) return "24時間以内";
  return `${Math.ceil(hours / 24)}日後`;
}

function pillStyle(active: boolean): React.CSSProperties {
  return {
    height: 30,
    padding: "0 12px",
    cursor: "pointer",
    fontSize: 12,
    whiteSpace: "nowrap",
    color: active ? "var(--color-accent-100)" : "var(--color-neutral-400)",
    background: active ? "var(--color-accent-900)" : "transparent",
    border: "1px solid",
    borderColor: active ? "var(--color-accent-800)" : "var(--color-divider)",
    borderRadius: "var(--radius-md)",
  };
}

// 時間精算の単価は30分3,000円（＝時給6,000円）で固定。見積もり時は
// スタッフが目安時間を入れるだけで、上限額（これ以上は請求しない額）を
// 自動計算する。実際の請求額の計算（30分単位切り上げ・最低3,000円）は
// finalize_hourly_billing（DB関数）側で、ここと同じ単価を使って行う。
const HOURLY_BLOCK_MINUTES = 30;
const HOURLY_BLOCK_RATE = 3000;
const HOURLY_RATE_PER_HOUR = HOURLY_BLOCK_RATE * (60 / HOURLY_BLOCK_MINUTES);

function capFromEstimatedHours(hours: number): number {
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  const blocks = Math.ceil((hours * 60) / HOURLY_BLOCK_MINUTES);
  return blocks * HOURLY_BLOCK_RATE;
}


function QuoteDialog({
  threadId,
  customerId,
  menus,
  onClose,
  onCreated,
}: {
  threadId: string;
  customerId: string;
  menus: MenuOption[];
  onClose: () => void;
  onCreated: (requestId: string) => void;
}) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [customItems, setCustomItems] = useState<CustomItem[]>([]);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customLabel, setCustomLabel] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [customQty, setCustomQty] = useState("1");
  const [customLeadHours, setCustomLeadHours] = useState("");
  const [note, setNote] = useState("");
  const [saveAsMenu, setSaveAsMenu] = useState(false);
  const [isHourly, setIsHourly] = useState(false);
  const [cadence, setCadence] = useState<SubscriptionCadence | "">("");
  const [estimatedHours, setEstimatedHours] = useState("");
  const [hourlyLabel, setHourlyLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function bump(menuId: string, delta: number) {
    setQty((q) => ({ ...q, [menuId]: Math.max(0, (q[menuId] ?? 0) + delta) }));
  }

  function addCustomItem() {
    const price = Number(customPrice);
    const qty = Math.max(1, Math.round(Number(customQty) || 1));
    const leadHours = customLeadHours.trim() ? Math.max(1, Math.round(Number(customLeadHours))) : null;
    if (!customLabel.trim() || !Number.isFinite(price) || price < 0) return;
    setCustomItems((rows) => [...rows, { label: customLabel.trim(), price, qty, leadHours }]);
    setCustomLabel("");
    setCustomPrice("");
    setCustomQty("1");
    setCustomLeadHours("");
  }

  function bumpCustomQty(index: number, delta: number) {
    setCustomItems((rows) => rows.map((r, i) => (i === index ? { ...r, qty: Math.max(1, r.qty + delta) } : r)));
  }

  // 金額が未設定（相談項目としてだけ使う）受付メニューは見積もりの候補には出さない。
  const priceableMenus = menus.filter((m): m is MenuOption & { price: number } => m.price != null);
  const menuItems = priceableMenus.filter((m) => (qty[m.id] ?? 0) > 0).map((m) => ({ menuId: m.id as string | null, label: m.label, price: m.price, payout: m.payout, qty: qty[m.id], leadHours: m.leadHours as number | null }));
  const allItems = [
    ...menuItems,
    ...customItems.map((c) => ({ menuId: null as string | null, label: c.label, price: c.price, payout: 0, qty: c.qty, leadHours: c.leadHours })),
  ];
  const itemsTotal = allItems.reduce((sum, it) => sum + it.price * it.qty, 0);
  const hourlyCap = capFromEstimatedHours(Number(estimatedHours));
  const total = isHourly ? hourlyCap : itemsTotal;
  // 同じ項目を複数個頼むと、その分準備に時間がかかる想定で数量に比例させる
  // （項目ごとの目安時間 × 数量）。違う項目同士は並行して進む前提でmaxを取る。
  const knownLeadHours = allItems.map((it) => (it.leadHours != null ? it.leadHours * it.qty : null)).filter((h): h is number => h != null);
  const due = knownLeadHours.length > 0 ? hoursToDueLabel(Math.max(...knownLeadHours)) : "";
  const canSubmit = isHourly ? hourlyCap > 0 : allItems.length > 0;

  async function submit() {
    if (saving || !canSubmit) return;
    setError("");
    setSaving(true);
    try {
      const requestId = await createCaseRequest(threadId, customerId, {
        items: allItems,
        note,
        due,
        saveAsMenu,
        hourly: isHourly ? { rate: HOURLY_RATE_PER_HOUR, cap: hourlyCap, label: hourlyLabel } : undefined,
        cadence: !isHourly && cadence ? cadence : undefined,
      });
      onCreated(requestId);
    } catch (e) {
      setError(errorMessage(e, "作成できませんでした"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, display: "grid", placeItems: "center", padding: 20, background: "color-mix(in srgb, var(--color-bg) 72%, transparent)" }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(480px, 100%)", maxHeight: "85vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, padding: 20, borderRadius: "var(--radius-lg)", background: "var(--color-surface)", border: "1px solid var(--color-divider)", boxShadow: "var(--shadow-lg)" }}
      >
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 16 }}>見積もりを発行</div>
        <div style={{ fontSize: 11.5, color: "var(--color-neutral-500)", lineHeight: 1.6 }}>
          このトークの内容を正式な依頼にします。発行するとトークに見積もりカードが入ります。
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setIsHourly(false)} style={pillStyle(!isHourly)}>
            メニューから選ぶ
          </button>
          <button
            onClick={() => {
              setIsHourly(true);
              setCadence("");
            }}
            style={pillStyle(isHourly)}
          >
            時間精算（メニューに無い依頼）
          </button>
        </div>

        {isHourly ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontSize: 10.5, color: "var(--color-neutral-500)" }}>件名</span>
              <input value={hourlyLabel} onChange={(e) => setHourlyLabel(e.target.value)} placeholder="例：資料のフォーマット整え" className="vid-input" style={inputStyle} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 10.5, color: "var(--color-neutral-500)" }}>目安時間（時間）</span>
                <InfoTooltip
                  text={`時間単価は30分${HOURLY_BLOCK_RATE.toLocaleString("ja-JP")}円（時給${HOURLY_RATE_PER_HOUR.toLocaleString("ja-JP")}円）で固定です。目安時間から自動計算した上限額を依頼主に見積もりとして提示し、実際の請求額（着手〜完了報告の時間を30分単位で切り上げ・最低3,000円）がこれを超えることはありません。`}
                />

              </div>
              <input value={estimatedHours} onChange={(e) => setEstimatedHours(e.target.value)} type="number" min={0.5} step={0.5} placeholder="例：2" className="vid-input" style={{ ...inputStyle, maxWidth: 140 }} />
            </div>
            {hourlyCap > 0 && <div style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>上限額：¥{hourlyCap.toLocaleString("ja-JP")}</div>}
          </div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ flex: 1, fontSize: 11, color: "var(--color-neutral-500)" }}>受付メニュー</span>
                <button onClick={() => setShowCustomForm((v) => !v)} style={{ ...smallBtn, height: 26 }}>
                  ＋項目を追加
                </button>
              </div>
              {priceableMenus.length === 0 && <div style={{ fontSize: 11.5, color: "var(--color-neutral-500)" }}>金額の設定されたメニューがありません。</div>}
              {priceableMenus.map((m) => (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-divider)" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.label}</div>
                    <div style={{ fontSize: 10.5, color: "var(--color-neutral-500)" }}>
                      ¥{m.price.toLocaleString("ja-JP")}・納期{m.leadHours}時間
                    </div>
                  </div>
                  <button onClick={() => bump(m.id, -1)} disabled={!qty[m.id]} style={stepperBtn}>
                    −
                  </button>
                  <span style={{ width: 20, textAlign: "center", fontSize: 13 }}>{qty[m.id] ?? 0}</span>
                  <button onClick={() => bump(m.id, 1)} style={stepperBtn}>
                    ＋
                  </button>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {showCustomForm && (
                <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 10.5, color: "var(--color-neutral-500)" }}>件名</span>
                    <input value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} className="vid-input" style={inputStyle} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, width: 100 }}>
                    <span style={{ fontSize: 10.5, color: "var(--color-neutral-500)" }}>金額</span>
                    <input value={customPrice} onChange={(e) => setCustomPrice(e.target.value)} type="number" min={0} className="vid-input" style={inputStyle} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, width: 64 }}>
                    <span style={{ fontSize: 10.5, color: "var(--color-neutral-500)" }}>数量</span>
                    <input value={customQty} onChange={(e) => setCustomQty(e.target.value)} type="number" min={1} className="vid-input" style={inputStyle} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, width: 90 }}>
                    <span style={{ fontSize: 10.5, color: "var(--color-neutral-500)" }}>目安時間(h)・任意</span>
                    <input value={customLeadHours} onChange={(e) => setCustomLeadHours(e.target.value)} type="number" min={1} placeholder="なし" className="vid-input" style={inputStyle} />
                  </div>
                  <button onClick={addCustomItem} style={{ ...smallBtn, height: 36 }}>
                    追加
                  </button>
                </div>
              )}
              {customItems.map((c, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                  <span style={{ flex: 1, minWidth: 0 }}>{c.label}</span>
                  <span style={{ color: "var(--color-neutral-500)" }}>
                    ¥{c.price.toLocaleString("ja-JP")}
                    {c.leadHours != null && `・納期${c.leadHours}時間`}
                  </span>
                  <button onClick={() => bumpCustomQty(i, -1)} disabled={c.qty <= 1} style={stepperBtn}>
                    −
                  </button>
                  <span style={{ width: 20, textAlign: "center" }}>{c.qty}</span>
                  <button onClick={() => bumpCustomQty(i, 1)} style={stepperBtn}>
                    ＋
                  </button>
                  <button onClick={() => setCustomItems((rows) => rows.filter((_, j) => j !== i))} style={{ display: "flex", cursor: "pointer", color: "var(--color-neutral-500)", background: "transparent", border: "none" }}>
                    <Trash size={12} />
                  </button>
                </div>
              ))}
              {customItems.length > 0 && (
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--color-neutral-400)" }}>
                  <input type="checkbox" checked={saveAsMenu} onChange={(e) => setSaveAsMenu(e.target.checked)} />
                  この内容を受付メニューにも追加する
                </label>
              )}
            </div>
          </>
        )}

        {!isHourly && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 10, borderTop: "1px solid var(--color-divider)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>頻度</span>
              <InfoTooltip text="定期対応（毎週・毎月）はチャージ残高からのお支払いのみです。依頼主が初回を確定すると、以降は自動で案件が作られ、残高から引き落とされます（着手は毎回担当者が手動で行います）。" />
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setCadence("")} style={pillStyle(cadence === "")}>
                単発
              </button>
              <button onClick={() => setCadence("weekly")} style={pillStyle(cadence === "weekly")}>
                毎週
              </button>
              <button onClick={() => setCadence("monthly")} style={pillStyle(cadence === "monthly")}>
                毎月
              </button>
            </div>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 10, borderTop: "1px solid var(--color-divider)" }}>
          <span style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>支払い：残高から依頼主が確定</span>
          <InfoTooltip text="依頼主が見積もりカードから直接「残高から支払う」ことで確定します。支払いが確定すると「着手前」になり、着手はこの後、担当者が案件詳細の「着手する」を押して行います。" />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 10, borderTop: "1px solid var(--color-divider)" }}>
          {due && (
            <div style={{ fontSize: 12.5 }}>
              対応の目安：{due}
              <span style={{ marginLeft: 6, fontSize: 10.5, color: "var(--color-neutral-500)" }}>（選んだ項目の目安時間から自動計算）</span>
            </div>
          )}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="補足メモ（依頼主にも表示されます）任意"
            rows={2}
            className="vid-input"
            style={{ ...inputStyle, height: "auto", padding: "8px 10px", resize: "none" }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 8, borderTop: "1px solid var(--color-divider)" }}>
          <span style={{ fontSize: 12, color: "var(--color-neutral-500)" }}>{isHourly ? "上限額（依頼主に表示）" : "請求額（依頼主に表示）"}</span>
          <span style={{ fontSize: 18, fontFamily: "var(--font-heading)", fontWeight: 600 }}>¥{total.toLocaleString("ja-JP")}</span>
        </div>

        {error && <span style={{ fontSize: 11.5, color: "var(--color-accent-200)" }}>{error}</span>}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={submit} disabled={saving || !canSubmit} style={{ ...smallBtn, height: 36, color: "var(--color-accent-100)", background: "var(--color-accent-900)" }}>
            {saving ? "送信中…" : "見積もりを送る"}
          </button>
          <button onClick={onClose} style={{ ...smallBtn, height: 36, color: "var(--color-neutral-400)", borderColor: "var(--color-divider)" }}>
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}

const stepperBtn: React.CSSProperties = {
  flex: "none",
  width: 24,
  height: 24,
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  fontSize: 14,
  color: "var(--color-accent)",
  background: "transparent",
  border: "1px solid var(--color-divider)",
  borderRadius: "var(--radius-sm)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 36,
  padding: "0 10px",
  font: "inherit",
  fontSize: 13,
  color: "var(--color-text)",
  background: "var(--color-bg)",
  border: "1px solid var(--color-divider)",
  borderRadius: "var(--radius-md)",
  outline: "none",
};
