"use client";

import { useState } from "react";
import { X, Check, Copy } from "@phosphor-icons/react";
import { headingWeight } from "@/lib/style";
import { errorMessage } from "@/lib/errors";
import { createStaffInvite } from "@/app/actions";
import InfoTooltip from "@/components/InfoTooltip";

// 窓口（department）はマネージャー1人につき1つ自動でできるもの（本部が
// 作成・命名する対象ではなくなった）。この型は、窓口を一覧・選択肢として
// 使う側（依頼主一覧の絞り込み、案件の担当窓口切替、スタッフの所属窓口選択
// など）でまだ参照している。
export interface Department {
  id: string;
  name: string;
}

const primaryBtn: React.CSSProperties = {
  height: 40,
  padding: "0 18px",
  cursor: "pointer",
  fontSize: 13.5,
  color: "var(--color-accent-100)",
  background: "var(--color-accent-900)",
  border: "1px solid var(--color-accent)",
  borderRadius: "var(--radius-md)",
};

function ModalHeader({ title, onClose }: { title: string; onClose?: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 22 }}>{title}</div>
      <div style={{ flex: 1 }} />
      {onClose && (
        <button onClick={onClose} aria-label="閉じる" style={{ display: "flex", cursor: "pointer", color: "var(--color-neutral-400)", background: "transparent", border: "none" }}>
          <X size={18} />
        </button>
      )}
    </div>
  );
}

export function InviteAdmin({ onClose }: { onClose?: () => void }) {
  return (
    <div style={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: 20, maxWidth: 520, width: "100%", margin: "0 auto" }}>
      <ModalHeader title="スタッフを招待" onClose={onClose} />
      <InviteLinkCard />
    </div>
  );
}

function InviteLinkCard() {
  const [creating, setCreating] = useState(false);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function create() {
    if (creating) return;
    setError("");
    setCreating(true);
    try {
      const id = await createStaffInvite();
      setCreatedUrl(`${window.location.origin}/join/${id}`);
      setCopied(false);
    } catch (e) {
      setError(errorMessage(e, "作成できませんでした"));
    } finally {
      setCreating(false);
    }
  }

  async function copy(url: string) {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: "var(--radius-md)", background: "var(--color-surface)", border: "1px solid var(--color-divider)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, flex: 1 }}>
          <span style={{ fontSize: 12.5, color: "var(--color-text)" }}>リンクを発行してURLを本人に送ってください。</span>
          <InfoTooltip text="ログイン情報は本人が自分で設定します。役職はあとから何度でも変更できるので、まずは一番権限の小さい「スタッフ」として参加してもらい、必要になったらチャット画面から権限を上げてください。窓口（担当マネージャー）が未設定の間は何も見えない状態になるので安全です。参加すると、そのままスタッフ一覧に表示されます。" />
        </div>
        <button onClick={create} disabled={creating} style={{ ...primaryBtn, flex: "none" }}>
          {creating ? "作成中…" : "招待リンクを作成"}
        </button>
      </div>

      {error && <span style={{ fontSize: 11.5, color: "var(--color-accent-200)" }}>{error}</span>}

      {createdUrl && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--color-surface)", border: "1px solid var(--color-accent-800)" }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{createdUrl}</span>
          <button
            onClick={() => copy(createdUrl)}
            aria-label="コピー"
            style={{
              flex: "none",
              display: "flex",
              alignItems: "center",
              gap: 5,
              height: 30,
              padding: copied ? "0 10px" : 0,
              width: copied ? undefined : 30,
              justifyContent: "center",
              cursor: "pointer",
              fontSize: 11.5,
              color: copied ? "var(--color-accent-100)" : "var(--color-accent)",
              background: copied ? "var(--color-accent-900)" : "transparent",
              border: `1px solid var(--color-accent)`,
              borderRadius: "var(--radius-md)",
            }}
          >
            {copied ? (
              <>
                <Check size={13} weight="bold" />
                コピーしました
              </>
            ) : (
              <Copy size={13} />
            )}
          </button>
        </div>
      )}
    </div>
  );
}
