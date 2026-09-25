"use client";

import { useRef, useState } from "react";
import { ArrowUUpLeft, X, PaperPlaneTilt, CircleNotch } from "@phosphor-icons/react";

// 案件トーク・スタッフ⇄本部トーク・依頼主トークで見た目と操作感を統一する
// ための共通入力欄。自動で高さが伸びる（自動改行）、元に戻す（↩）・
// 消す（✕）が入力中に出る、Enterで送信・Shift+Enterで改行——という
// クライアント側チャット(src/components/chat/Composer.tsx)と同じ振る舞い。
// 添付ファイルは受付側チャットではまだ対応していないため含めない。
export default function TextComposer({
  value,
  onChange,
  onSend,
  sending,
  disabled,
  placeholder,
  leftButton,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  sending: boolean;
  disabled?: boolean;
  placeholder: string;
  leftButton?: React.ReactNode;
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
    if (sending || disabled || !value.trim()) return;
    onSend();
    setHistory([]);
    requestAnimationFrame(() => autoGrow(true));
  }

  const sendDisabled = sending || disabled || !value.trim();

  return (
    <div style={{ flex: "none", display: "flex", gap: 8, alignItems: "flex-end", padding: "12px 18px", borderTop: "1px solid var(--color-divider)" }}>
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
  );
}
