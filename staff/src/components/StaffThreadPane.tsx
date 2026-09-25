"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Trash, GearSix, Check, ChatCircleDots } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import { ensureStaffThread, sendInternalMessage, deleteMessage, markThreadRead, updateStaffMember, removeStaffMember } from "@/app/actions";
import { errorMessage } from "@/lib/errors";
import { headingWeight } from "@/lib/style";
import { ROLE_LABEL, INVITE_ROLES, isDeptScoped, staffSenderLabel } from "@/lib/roles";
import RoleTags from "@/components/RoleTags";
import TextComposer from "@/components/TextComposer";
import Modal from "@/components/Modal";
import type { AppRole, StaffRole } from "@/lib/supabase/types";
import type { Department } from "@/components/StaffAdmin";

interface EditableStaffProps {
  displayName: string;
  role: StaffRole;
  departmentIds: string[];
  departments: Department[];
  canDelete: boolean;
  onSaved: (patch: { displayName: string; role: StaffRole; departmentIds: string[] }) => void;
  onRemoved: () => void;
}

interface InternalMessage {
  id: string;
  sender_id: string | null;
  sender_role: AppRole | null;
  kind: string;
  body: string | null;
  sent_at: string;
  deleted_at: string | null;
}

export default function StaffThreadPane({
  staffProfileId,
  title,
  currentUserId,
  orgId,
  onBack,
  editable,
}: {
  staffProfileId: string;
  title: string;
  currentUserId: string;
  orgId: string;
  onBack?: () => void;
  editable?: EditableStaffProps;
}) {
  const [showEdit, setShowEdit] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<InternalMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(
    async (id: string) => {
      const supabase = createClient(orgId);
      const { data } = await supabase
        .from("messages")
        .select("id, sender_id, sender_role, kind, body, sent_at, deleted_at")
        .eq("thread_id", id)
        .order("sent_at", { ascending: true });
      if (data) setMessages(data);
    },
    [orgId],
  );

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting the pane when the selected staff member changes, not state derived from props/state
    setThreadId(null);
    setMessages([]);
    setError("");
    setShowEdit(false);
    (async () => {
      try {
        const id = await ensureStaffThread(staffProfileId);
        if (cancelled) return;
        setThreadId(id);
        await refresh(id);
        await markThreadRead(id);
      } catch (e) {
        if (!cancelled) setError(errorMessage(e, "読み込みに失敗しました"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [staffProfileId, refresh]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    if (!threadId) return;
    const supabase = createClient(orgId);
    const channel = supabase
      .channel(`staff-thread-${threadId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `thread_id=eq.${threadId}` }, () => refresh(threadId))
      .subscribe();
    const interval = setInterval(() => refresh(threadId), 4000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [threadId, orgId, refresh]);

  async function send() {
    if (sending || !draft.trim() || !threadId) return;
    setSending(true);
    const body = draft.trim();
    try {
      await sendInternalMessage(threadId, body);
      setMessages((m) => [
        ...m,
        { id: `temp-${Date.now()}`, sender_id: currentUserId, sender_role: null, kind: "text", body, sent_at: new Date().toISOString(), deleted_at: null },
      ]);
      setDraft("");
    } catch (e) {
      setError(errorMessage(e, "送信できませんでした"));
    } finally {
      setSending(false);
    }
  }

  async function handleDelete(m: InternalMessage) {
    if (busy) return;
    if (!confirm("このメッセージを削除します。よろしいですか？")) return;
    setBusy(true);
    try {
      await deleteMessage(m.id);
      setMessages((rows) => rows.map((r) => (r.id === m.id ? { ...r, deleted_at: new Date().toISOString() } : r)));
    } catch (e) {
      setError(errorMessage(e, "削除できませんでした"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid var(--color-divider)" }}>
        {onBack && (
          <button onClick={onBack} aria-label="一覧に戻る" style={{ display: "flex", cursor: "pointer", color: "var(--color-neutral-400)", background: "transparent", border: "none" }}>
            <ArrowLeft size={17} />
          </button>
        )}
        <div style={{ flex: "none", width: 32, height: 32, display: "grid", placeItems: "center", fontSize: 13, fontWeight: 700, color: "var(--color-accent-100)", background: "var(--color-accent-900)", borderRadius: "50%" }}>
          {title.slice(0, 1)}
        </div>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 16 }}>{title}</div>
        <div style={{ flex: 1 }} />
        {editable && (
          <button
            onClick={() => setShowEdit(true)}
            aria-label="設定"
            style={{ display: "flex", cursor: "pointer", color: "var(--color-neutral-400)", background: "transparent", border: "none" }}
          >
            <GearSix size={18} />
          </button>
        )}
      </div>

      {showEdit && editable && (
        <Modal onClose={() => setShowEdit(false)} maxWidth={480}>
          <StaffEditPanel
            staffProfileId={staffProfileId}
            editable={editable}
            onClose={() => setShowEdit(false)}
          />
        </Modal>
      )}

      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, padding: "var(--space-4)" }}>
        {error && <div style={{ fontSize: 12.5, color: "var(--color-accent-200)" }}>{error}</div>}
        {threadId && messages.length === 0 && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: "var(--color-neutral-500)" }}>
            <ChatCircleDots size={28} />
            <span style={{ fontSize: 12.5 }}>まだやり取りがありません</span>
          </div>
        )}
        {messages.map((m) => {
          const isOwn = m.sender_id === currentUserId;
          return (
            <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: isOwn ? "flex-end" : "flex-start" }}>
              {m.deleted_at ? (
                <div style={{ fontSize: 12, fontStyle: "italic", color: "var(--color-neutral-500)" }}>削除されました</div>
              ) : (
                <div
                  style={{
                    maxWidth: "85%",
                    padding: "8px 12px",
                    borderRadius: "var(--radius-md)",
                    fontSize: 13.5,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    background: isOwn ? "var(--color-bubble-self-bg)" : "var(--color-bubble-other-bg)",
                    color: isOwn ? "var(--color-bubble-self-text)" : "var(--color-bubble-other-text)",
                    border: isOwn ? "none" : "1px solid var(--color-divider)",
                  }}
                >
                  {m.body}
                </div>
              )}
              {!m.deleted_at && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 10, color: "var(--color-neutral-600)" }}>
                    {isOwn ? "自分" : staffSenderLabel(m.sender_role)}・
                    {new Date(m.sent_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {isOwn && (
                    <button onClick={() => handleDelete(m)} disabled={busy} aria-label="削除" style={{ display: "flex", cursor: "pointer", color: "var(--color-neutral-500)", background: "transparent", border: "none" }}>
                      <Trash size={12} />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <TextComposer value={draft} onChange={setDraft} onSend={send} sending={sending} disabled={!threadId} placeholder="メッセージを入力…" />
    </div>
  );
}

const editInput: React.CSSProperties = {
  width: "100%",
  height: 34,
  padding: "0 10px",
  fontSize: 13,
  color: "var(--color-text)",
  background: "var(--color-bg)",
  border: "1px solid var(--color-divider)",
  borderRadius: "var(--radius-md)",
  outline: "none",
};
const editLabel: React.CSSProperties = { fontSize: 11.5, color: "var(--color-neutral-500)" };

function StaffEditPanel({
  staffProfileId,
  editable,
  onClose,
}: {
  staffProfileId: string;
  editable: EditableStaffProps;
  onClose: () => void;
}) {
  const [displayName, setDisplayName] = useState(editable.displayName);
  const [role, setRole] = useState(editable.role);
  const [departmentIds, setDepartmentIds] = useState(editable.departmentIds);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");

  function toggleDept(id: string) {
    setDepartmentIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  async function save() {
    if (saving) return;
    if (!displayName.trim()) {
      setError("表示名を入力してください");
      return;
    }
    if (isDeptScoped(role) && departmentIds.length === 0) {
      setError("担当する窓口を1つ以上選んでください");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const resolved = isDeptScoped(role) ? departmentIds : [];
      const trimmedName = displayName.trim();
      await updateStaffMember(staffProfileId, role, resolved, trimmedName);
      editable.onSaved({ displayName: trimmedName, role, departmentIds: resolved });
      onClose();
    } catch (e) {
      setError(errorMessage(e, "変更できませんでした"));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (removing || !confirm("このスタッフを削除します。ログインもできなくなります。よろしいですか？")) return;
    setRemoving(true);
    setError("");
    try {
      await removeStaffMember(staffProfileId);
      editable.onRemoved();
    } catch (e) {
      setError(errorMessage(e, "削除できませんでした"));
      setRemoving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "var(--space-6)" }}>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 20 }}>スタッフ設定</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={editLabel}>表示名</span>
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="vid-input" style={{ ...editInput, maxWidth: 260 }} />
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={editLabel}>役職</span>
          <select value={role} onChange={(e) => setRole(e.target.value as StaffRole)} className="vid-input" style={{ ...editInput, width: 170 }}>
            {INVITE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
        {isDeptScoped(role) && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={editLabel}>担当窓口（複数選択可）</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxWidth: 320 }}>
              {editable.departments.map((d) => {
                const on = departmentIds.includes(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => toggleDept(d.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      height: 28,
                      padding: "0 10px",
                      cursor: "pointer",
                      fontSize: 11.5,
                      color: on ? "var(--color-accent-100)" : "var(--color-neutral-400)",
                      background: on ? "var(--color-accent-900)" : "transparent",
                      border: `1px solid ${on ? "var(--color-accent)" : "var(--color-divider)"}`,
                      borderRadius: "var(--radius-md)",
                    }}
                  >
                    {on && <Check size={11} weight="bold" />}
                    {d.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <RoleTags role={role} />

      {error && <span style={{ fontSize: 11.5, color: "var(--color-accent-200)" }}>{error}</span>}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={save}
          disabled={saving}
          style={{ height: 32, padding: "0 12px", cursor: "pointer", fontSize: 12.5, color: "var(--color-accent)", background: "transparent", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)" }}
        >
          {saving ? "保存中…" : "保存"}
        </button>
        {editable.canDelete && (
          <button
            onClick={remove}
            disabled={removing}
            style={{ height: 32, padding: "0 12px", cursor: "pointer", fontSize: 12.5, color: "var(--color-neutral-400)", background: "transparent", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}
          >
            <Trash size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
            削除
          </button>
        )}
      </div>
    </div>
  );
}
