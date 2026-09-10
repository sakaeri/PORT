"use client";

import { useRef, useState } from "react";
import { ListDashes, Paperclip, ArrowUUpLeft, X, PaperPlaneTilt, CircleNotch } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";

export interface PendingAttachment {
  path: string;
  name: string;
  mime: string;
  bytes: number;
}

interface Props {
  threadId: string;
  onSend: (text: string, attachments: PendingAttachment[]) => Promise<void>;
  onOpenMenuSheet: () => void;
}

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20MB。Supabase側の上限に確実に収まるよう、送信前にここで弾く

function fileIconClass(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "heic"].includes(ext)) return "ph ph-image";
  return "ph ph-paperclip";
}

export default function Composer({ threadId, onSend, onOpenMenuSheet }: Props) {
  const [draft, setDraft] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function autoGrow(reset = false) {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "38px";
    if (!reset) el.style.height = Math.min(Math.max(el.scrollHeight, 38), 170) + "px";
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

  async function handlePickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setUploading(true);
    setUploadError("");
    const failed: string[] = [];
    const supabase = createClient();
    try {
      for (const file of files) {
        if (file.size > MAX_ATTACHMENT_BYTES) {
          failed.push(`${file.name}（20MBを超えています）`);
          continue;
        }
        const path = `${threadId}/${crypto.randomUUID()}-${file.name}`;
        const { error } = await supabase.storage.from("attachments").upload(path, file, { contentType: file.type });
        if (error) {
          failed.push(`${file.name}（${error.message}）`);
          continue;
        }
        setAttachments((a) => [...a, { path, name: file.name, mime: file.type, bytes: file.size }]);
      }
      if (failed.length) setUploadError(`送信できなかったファイルがあります: ${failed.join("、")}`);
    } finally {
      setUploading(false);
    }
  }

  function removeAttachment(path: string) {
    setAttachments((a) => a.filter((x) => x.path !== path));
  }

  async function handleSend() {
    if (sending) return;
    const text = draft.trim();
    if (!text && attachments.length === 0) return;
    setSending(true);
    try {
      await onSend(text, attachments);
      setDraft("");
      setAttachments([]);
      setHistory([]);
      setUploadError("");
      requestAnimationFrame(() => autoGrow(true));
    } finally {
      setSending(false);
    }
  }

  const sendDisabled = sending || (!draft.trim() && attachments.length === 0);

  return (
    <div style={{ flex: "none", borderTop: "1px solid var(--color-divider)", padding: "var(--space-4)" }}>
      {attachments.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {attachments.map((f) => (
            <span
              key={f.path}
              style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 28, maxWidth: 200, padding: "0 6px 0 10px", borderRadius: 20, fontSize: 11, color: "var(--color-accent-200)", background: "var(--color-accent-800)" }}
            >
              <i className={fileIconClass(f.name)} style={{ flex: "none", fontSize: 13 }} />
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
              <button onClick={() => removeAttachment(f.path)} aria-label="添付を外す" style={{ width: 18, height: 18, flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--color-neutral-400)", background: "transparent", border: "none", borderRadius: "50%" }}>
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      {uploadError && (
        <div style={{ fontSize: 11.5, color: "var(--color-accent-200)", marginBottom: 8, lineHeight: 1.5 }}>{uploadError}</div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <button onClick={onOpenMenuSheet} aria-label="メニューから問い合わせる" title="メニューから問い合わせる" style={{ flex: "none", width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--color-accent)", background: "transparent", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)" }}>
          <ListDashes size={17} />
        </button>
        <input ref={fileInputRef} type="file" multiple accept="image/*" onChange={handlePickFiles} style={{ display: "none" }} />
        <button
          onClick={() => fileInputRef.current?.click()}
          aria-label="ファイルを添付"
          disabled={uploading}
          style={{ flex: "none", width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", cursor: uploading ? "wait" : "pointer", color: "var(--color-neutral-400)", background: "transparent", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}
        >
          <Paperclip size={17} />
        </button>
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
            style={{ width: "100%", resize: "none", maxHeight: 170, minHeight: 38, padding: draft || history.length > 0 ? "8px 64px 8px 10px" : "8px 10px", font: "inherit", fontSize: 14, color: "var(--color-text)", background: "var(--color-surface)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)", overflowY: "auto", outline: "none" }}
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
