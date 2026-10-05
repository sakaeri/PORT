"use client";

import { useRef, useState } from "react";
import { ArrowUUpLeft, X, PaperPlaneTilt, CircleNotch } from "@phosphor-icons/react";

interface Props {
  onSend: (text: string) => Promise<void>;
}

export default function Composer({ onSend }: Props) {
  const [draft, setDraft] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function autoGrow(reset = false) {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "40px";
    if (!reset) el.style.height = Math.min(Math.max(el.scrollHeight, 40), 170) + "px";
  }

  function pushHistory(prev: string) {
    setHistory((h) => [...h, prev]);
  }

  function clearDraft() {
    pushHistory(draft);
    setDraft("");
    requestAnimationFrame(() => autoGrow(true));
  }

  function undoClear() {
    setHistory((h) => {
      if (!h.length) return h;
      const next = h.slice();
      const prev = next.pop()!;
      setDraft(prev);
      requestAnimationFrame(() => autoGrow());
      return next;
    });
  }

  async function handleSend() {
    if (sending) return;
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    try {
      await onSend(text);
      setDraft("");
      setHistory([]);
      requestAnimationFrame(() => autoGrow(true));
    } finally {
      setSending(false);
    }
  }

  const sendDisabled = sending || !draft.trim();

  return (
    <div style={{ flex: "none", borderTop: "1px solid var(--color-divider)", padding: "var(--space-4)" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
          <textarea
            value={draft}
            onChange={(e) => {
              pushHistory(draft);
              setDraft(e.target.value);
              autoGrow();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            ref={textareaRef}
            placeholder="ご相談内容を入力…"
            rows={1}
            className="vid-textarea"
            style={{ width: "100%", resize: "none", maxHeight: 170, minHeight: 40, height: 40, padding: draft || history.length > 0 ? "9px 64px 9px 10px" : "9px 10px", font: "inherit", fontSize: 14, color: "var(--color-text)", background: "var(--color-surface)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)", overflowY: "auto", outline: "none" }}
          />
          {(!!draft || history.length > 0) && (
            <div style={{ position: "absolute", top: 5, right: 5, display: "flex", gap: 2, width: 79, height: 30 }}>
              <button onClick={undoClear} disabled={!history.length} aria-label="元に戻す" style={{ width: 30, height: 30, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: history.length ? "pointer" : "default", opacity: history.length ? 1 : 0.4, color: "var(--color-neutral-600)", background: "transparent", border: "none", borderRadius: "var(--radius-md)" }}>
                <ArrowUUpLeft size={16} />
              </button>
              <button onClick={clearDraft} disabled={!draft} aria-label="入力を消す" style={{ width: 30, height: 30, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: draft ? "pointer" : "default", opacity: draft ? 1 : 0.4, color: "var(--color-neutral-600)", background: "transparent", border: "none", borderRadius: "var(--radius-md)" }}>
                <X size={16} />
              </button>
            </div>
          )}
        </div>
        <button onClick={handleSend} disabled={sendDisabled} aria-label="送信" aria-busy={sending} style={{ width: 40, height: 40, flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: sendDisabled ? "default" : "pointer", opacity: sendDisabled ? 0.5 : 1, color: "var(--color-accent)", background: "transparent", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)" }}>
          {sending ? <CircleNotch size={16} style={{ animation: "vid-spin 0.7s linear infinite" }} /> : <PaperPlaneTilt size={16} />}
        </button>
      </div>
    </div>
  );
}
