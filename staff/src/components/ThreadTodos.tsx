"use client";

import { useState } from "react";
import { Trash } from "@phosphor-icons/react";
import { addTodo, deleteTodo, setTodoDone } from "@/app/actions";
import { errorMessage, unwrap } from "@/lib/errors";
import { headingWeight } from "@/lib/style";
import Modal from "@/components/Modal";

export type TodoItem = { id: string; title: string; due_date: string; done_at: string | null };

const JST_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" });
export function todayJst(): string {
  return JST_DATE.format(new Date());
}

// 例：11/25（火）
export function shortDateLabel(date: string): string {
  const d = new Date(`${date}T12:00:00+09:00`);
  const weekday = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", weekday: "short" }).format(d);
  const [, month, day] = date.split("-").map(Number);
  return `${month}/${day}（${weekday}）`;
}

const input: React.CSSProperties = {
  width: "100%",
  height: 38,
  padding: "0 10px",
  fontSize: 13.5,
  color: "var(--color-text)",
  background: "var(--color-surface)",
  border: "1px solid var(--color-divider)",
  borderRadius: "var(--radius-md)",
  outline: "none",
};

// トークの入力欄の横の「やることに追加」から開く。
export function TodoAddDialog({ threadId, onClose, onAdded }: { threadId: string; onClose: () => void; onAdded: (todo: TodoItem) => void }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayJst());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!title.trim()) {
      setError("やることを入力してください");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const r = unwrap(await addTodo(threadId, title, date));
      if (r.data) onAdded(r.data);
      onClose();
    } catch (e) {
      setError(errorMessage(e, "追加できませんでした"));
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} maxWidth={380}>
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 16 }}>やることに追加</div>
        <textarea
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例：見積もりを送る"
          rows={3}
          autoFocus
          className="vid-input"
          style={{ ...input, height: "auto", padding: "8px 10px", lineHeight: 1.6, resize: "vertical" }}
        />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="vid-input" style={input} />
        {error && <span style={{ fontSize: 11.5, color: "var(--color-accent-200)" }}>{error}</span>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ height: 36, padding: "0 14px", cursor: "pointer", fontSize: 13, color: "var(--color-neutral-400)", background: "transparent", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}>
            やめる
          </button>
          <button
            onClick={save}
            disabled={saving}
            style={{ height: 36, padding: "0 16px", cursor: "pointer", fontSize: 13, color: "var(--color-bg)", background: "var(--color-accent)", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)", opacity: saving ? 0.6 : 1 }}
          >
            {saving ? "追加中…" : "追加する"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// チェックボックス付きの1行。完了・未完了の切り替えと削除ができる。
export function TodoRow({ todo, onChange, onDelete, extra }: { todo: TodoItem; onChange: (todo: TodoItem) => void; onDelete?: (id: string) => void; extra?: React.ReactNode }) {
  const [busy, setBusy] = useState(false);
  const today = todayJst();
  const done = !!todo.done_at;
  const overdue = !done && todo.due_date < today;

  async function toggle() {
    setBusy(true);
    try {
      unwrap(await setTodoDone(todo.id, !done));
      onChange({ ...todo, done_at: done ? null : new Date().toISOString() });
    } catch (e) {
      window.alert(errorMessage(e, "更新できませんでした"));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("このやることを削除しますか？")) return;
    setBusy(true);
    try {
      unwrap(await deleteTodo(todo.id));
      onDelete?.(todo.id);
    } catch (e) {
      window.alert(errorMessage(e, "削除できませんでした"));
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, opacity: busy ? 0.6 : 1 }}>
      <input type="checkbox" checked={done} onChange={toggle} disabled={busy} aria-label="完了にする" style={{ flex: "none", width: 17, height: 17, marginTop: 2, accentColor: "var(--color-accent)", cursor: "pointer" }} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere", textDecoration: done ? "line-through" : "none", color: done ? "var(--color-neutral-500)" : "var(--color-text)" }}>{todo.title}</span>
        <span style={{ fontSize: 11, color: overdue ? "var(--color-accent-200)" : "var(--color-neutral-500)" }}>
          {todo.due_date === today ? "今日" : shortDateLabel(todo.due_date)}
          {overdue && "・期限切れ"}
          {extra}
        </span>
      </div>
      {onDelete && (
        <button onClick={remove} disabled={busy} aria-label="削除" style={{ flex: "none", display: "flex", cursor: "pointer", color: "var(--color-neutral-500)", background: "transparent", border: "none", padding: 2 }}>
          <Trash size={14} />
        </button>
      )}
    </div>
  );
}

// トーク右側の情報パネルに出す、このトークのやること（未完了だけ）。
export function ThreadTodos({ todos, setTodos, onAdd }: { todos: TodoItem[]; setTodos: (fn: (prev: TodoItem[]) => TodoItem[]) => void; onAdd: () => void }) {
  const open = todos.filter((t) => !t.done_at).sort((a, b) => a.due_date.localeCompare(b.due_date));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 600, letterSpacing: "0.05em", color: "var(--color-neutral-400)" }}>やること</span>
        <button onClick={onAdd} style={{ flex: "none", fontSize: 12, color: "var(--color-accent)", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
          ＋ 追加
        </button>
      </div>
      {open.length === 0 ? (
        <span style={{ fontSize: 12, color: "var(--color-neutral-500)" }}>ありません</span>
      ) : (
        open.map((t) => (
          <TodoRow
            key={t.id}
            todo={t}
            onChange={(next) => setTodos((prev) => prev.map((x) => (x.id === next.id ? next : x)))}
            onDelete={(id) => setTodos((prev) => prev.filter((x) => x.id !== id))}
          />
        ))
      )}
    </div>
  );
}
