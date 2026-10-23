"use client";

import { useRef, useState } from "react";
import { ArrowUUpLeft, X, PaperPlaneTilt, CircleNotch } from "@phosphor-icons/react";

// 案件トーク・スタッフ⇄本部トーク・依頼主トークで見た目と操作感を統一する
// ための共通入力欄。自動で高さが伸びる（自動改行）、元に戻す（↩）・
// 消す（✕）が入力中に出る、Enterで送信・Shift+Enterで改行——という
// クライアント側チャット(src/components/chat/Composer.tsx)と同じ振る舞い。
// 添付ボタンなど入力欄の左に置くものは leftButton で呼び出し側から渡す。
export default function TextComposer({
  value,
  onChange,
  onSend,
  sending,
  disabled,
  placeholder,
  leftButton,
  above,
  hasAttachments,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  sending: boolean;
  disabled?: boolean;
  placeholder: string;
  leftButton?: React.ReactNode;
  // 送る前の添付ファイルの一覧など、入力欄の上に出すもの。
  above?: React.ReactNode;
  // 添付ファイルがあれば、文章が空でも送信できる。
  hasAttachments?: boolean;
}) {
  const [history, setHistory] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function autoGrow(reset = false) {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "40px";
    if (!reset) el.style.height = Math.min(Math.max(el.scrollHeight, 40), 170) + "px";
  }

  function handleChange(next: string) {
    setHistory((h) => [...h, value]);
    onChange(next);
    autoGrow();
  }

  function clearDraft() {
    setHistory((h) => [...h, value]);
    onChange("");
    requestAnimationFrame(() => autoGrow(true));
  }

  function undo() {
    setHistory((h) => {
      if (!h.length) return h;
      const next = h.slice();
      const prev = next.pop()!;
      onChange(prev);
      requestAnimationFrame(() => autoGrow());
      return next;
    });
  }

  function handleSend() {
    if (sending || disabled || (!value.trim() && !hasAttachments)) return;
    onSend();
    setHistory([]);
    requestAnimationFrame(() => autoGrow(true));
  }

  const sendDisabled = sending || disabled || (!value.trim() && !hasAttachments);

  return (
    <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: 8, padding: "12px 18px", paddingBottom: "calc(12px + env(safe-area-inset-bottom))", borderTop: "1px solid var(--color-divider)" }}>
    {above}
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
      {leftButton}
      <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={placeholder}
          rows={1}
          className="vid-textarea"
          style={{
            // textareaは既定でインライン要素なので、行の下に数pxの余白ができて
            // 送信・添付ボタンと高さがずれる。blockにして揃える。
            display: "block",
            width: "100%",
            resize: "none",
            maxHeight: 170,
            minHeight: 40,
            height: 40,
            padding: value || history.length > 0 ? "9px 64px 9px 12px" : "9px 12px",
            font: "inherit",
            fontSize: 13.5,
            color: "var(--color-text)",
            background: "var(--color-surface)",
            border: "1px solid var(--color-divider)",
            borderRadius: "var(--radius-md)",
            overflowY: "auto",
            outline: "none",
          }}
        />
        {(!!value || history.length > 0) && (
          <div style={{ position: "absolute", top: 5, right: 5, display: "flex", gap: 2, width: 62, height: 30 }}>
            <button
              onClick={undo}
              disabled={!history.length}
              aria-label="元に戻す"
              style={{ width: 30, height: 30, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: history.length ? "pointer" : "default", opacity: history.length ? 1 : 0.4, color: "var(--color-neutral-600)", background: "transparent", border: "none", borderRadius: "var(--radius-md)" }}
            >
              <ArrowUUpLeft size={15} />
            </button>
            <button
              onClick={clearDraft}
              disabled={!value}
              aria-label="入力を消す"
              style={{ width: 30, height: 30, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: value ? "pointer" : "default", opacity: value ? 1 : 0.4, color: "var(--color-neutral-600)", background: "transparent", border: "none", borderRadius: "var(--radius-md)" }}
            >
              <X size={15} />
            </button>
          </div>
        )}
      </div>
      <button
        onClick={handleSend}
        disabled={sendDisabled}
        aria-label="送信"
        aria-busy={sending}
        style={{ flex: "none", width: 40, height: 40, display: "grid", placeItems: "center", cursor: sendDisabled ? "default" : "pointer", opacity: sendDisabled ? 0.5 : 1, color: "var(--color-accent)", background: "transparent", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)" }}
      >
        {sending ? <CircleNotch size={16} style={{ animation: "vid-spin 0.7s linear infinite" }} /> : <PaperPlaneTilt size={16} />}
      </button>
    </div>
    </div>
  );
}
