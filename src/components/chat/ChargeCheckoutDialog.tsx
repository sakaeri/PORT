"use client";

import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { X } from "@phosphor-icons/react";
import { headingWeight } from "@/lib/style";

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = PUBLISHABLE_KEY ? loadStripe(PUBLISHABLE_KEY) : null;

const scrim: React.CSSProperties = { position: "fixed", inset: 0, background: "var(--stb-scrim)", zIndex: 80 };
const dialogBox: React.CSSProperties = {
  width: "min(480px, 100%)",
  maxHeight: "calc(100vh - 32px)",
  overflowY: "auto",
  position: "relative",
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: 20,
  borderRadius: "var(--radius-lg)",
  background: "var(--color-surface)",
  boxShadow: "var(--shadow-lg)",
};

// Stripeのホスト型Checkoutページへ飛ばすのではなく、埋め込み型（ui_mode:
// "embedded"）をアプリ内のダイアログに表示する。支払い完了の検知自体は
// Webhook側（checkout.session.completed）で残高に反映するので、ここでの
// onComplete は「画面を閉じて残高を再取得する」という表示上の後始末だけ。
export default function ChargeCheckoutDialog({ clientSecret, title = "お支払い", onClose, onComplete }: { clientSecret: string; title?: string; onClose: () => void; onComplete: () => void }) {
  return (
    <div style={{ ...scrim, display: "grid", placeItems: "center", padding: "var(--space-4)" }} onClick={onClose}>
      <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={dialogBox}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 18 }}>{title}</div>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} aria-label="閉じる" style={{ display: "flex", cursor: "pointer", color: "var(--color-neutral-400)", background: "transparent", border: "none" }}>
            <X size={18} />
          </button>
        </div>
        {!stripePromise ? (
          <div style={{ fontSize: 13, color: "var(--color-neutral-500)" }}>決済機能は準備中です。しばらくしてから再度お試しください。</div>
        ) : (
          <EmbeddedCheckoutProvider stripe={stripePromise} options={{ clientSecret, onComplete }}>
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        )}
      </div>
    </div>
  );
}
