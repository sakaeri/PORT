"use client";

import { useEffect, useState } from "react";
import { X } from "@phosphor-icons/react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { startSubscriptionSetup } from "@/app/actions";
import { headingWeight } from "@/lib/style";

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = PUBLISHABLE_KEY ? loadStripe(PUBLISHABLE_KEY) : null;

const scrim: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 80, background: "color-mix(in srgb, var(--color-bg) 55%, transparent)" };
const dialogBox: React.CSSProperties = {
  width: "min(420px, 100%)",
  maxHeight: "calc(100vh - 32px)",
  overflowY: "auto",
  position: "relative",
  display: "flex",
  flexDirection: "column",
  gap: 14,
  padding: 20,
  borderRadius: "var(--radius-lg)",
  background: "var(--color-surface)",
  boxShadow: "var(--shadow-lg)",
};
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

export default function BillingModal({ onClose }: { onClose: () => void }) {
  return (
    <div style={scrim} onClick={onClose}>
      <div style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", padding: "var(--space-4)" }} onClick={onClose}>
        <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={dialogBox}>
          <button
            onClick={onClose}
            aria-label="閉じる"
            style={{ position: "absolute", top: 14, right: 14, width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--color-neutral-500)", background: "transparent", border: "none" }}
          >
            <X size={16} />
          </button>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 18 }}>お支払い方法の登録</div>
          <BillingSetup onDone={onClose} />
        </div>
      </div>
    </div>
  );
}

function BillingSetup({ onDone }: { onDone: () => void }) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [alreadyActive, setAlreadyActive] = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    startSubscriptionSetup()
      .then((result) => {
        if (result.status === "active") setAlreadyActive(true);
        else setClientSecret(result.clientSecret);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "準備に失敗しました"));
  }, []);

  if (succeeded || alreadyActive) {
    return (
      <>
        <div style={{ fontSize: 13, color: "var(--color-accent-300)" }}>お支払い方法の登録が完了しました。反映まで数分かかる場合があります。</div>
        <button onClick={onDone} style={{ ...primaryBtn, alignSelf: "flex-start" }}>
          閉じる
        </button>
      </>
    );
  }

  if (!stripePromise) {
    return <div style={{ fontSize: 13, color: "var(--color-neutral-500)" }}>決済機能は準備中です。しばらくしてから再度お試しください。</div>;
  }
  if (error) return <div style={{ fontSize: 13, color: "var(--color-accent-200)" }}>{error}</div>;
  if (!clientSecret) return <div style={{ fontSize: 13, color: "var(--color-neutral-500)" }}>読み込み中…</div>;

  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <PaymentForm onSuccess={() => setSucceeded(true)} />
    </Elements>
  );
}

function PaymentForm({ onSuccess }: { onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!stripe || !elements || submitting) return;
    setSubmitting(true);
    setError("");
    // redirect: "if_required" にしないと、3D Secureなどが不要な普通のカードでも
    // 毎回 return_url に強制的に飛ばされてしまう。ポップアップなので、遷移先は
    // 開いていた元のページのURL（ここでは開いた瞬間のURL）にしておく
    // — 万一リダイレクトが必要な決済手段だった場合だけそこへ戻る。
    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: "if_required",
    });
    if (confirmError) {
      setError(confirmError.message ?? "決済に失敗しました");
      setSubmitting(false);
      return;
    }
    // 3D Secureなど、どうしてもリダイレクトが必要な決済手段だった場合は
    // ここに来る前にページ遷移している。ここに来た＝リダイレクト不要で完了。
    onSuccess();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <PaymentElement />
      {error && <span style={{ fontSize: 11.5, color: "var(--color-accent-200)" }}>{error}</span>}
      <button onClick={submit} disabled={!stripe || submitting} style={{ ...primaryBtn, alignSelf: "flex-start" }}>
        {submitting ? "処理中…" : "お支払い方法を登録する"}
      </button>
    </div>
  );
}
