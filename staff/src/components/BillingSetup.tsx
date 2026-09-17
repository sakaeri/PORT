"use client";

import { useEffect, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { startSubscriptionSetup } from "@/app/actions";

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = PUBLISHABLE_KEY ? loadStripe(PUBLISHABLE_KEY) : null;

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

export default function BillingSetup() {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    startSubscriptionSetup()
      .then(setClientSecret)
      .catch((e) => setError(e instanceof Error ? e.message : "準備に失敗しました"));
  }, []);

  if (!stripePromise) {
    return <div style={{ fontSize: 13, color: "var(--color-neutral-500)" }}>決済機能は準備中です。しばらくしてから再度お試しください。</div>;
  }
  if (error) return <div style={{ fontSize: 13, color: "var(--color-accent-200)" }}>{error}</div>;
  if (!clientSecret) return <div style={{ fontSize: 13, color: "var(--color-neutral-500)" }}>読み込み中…</div>;

  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <PaymentForm />
    </Elements>
  );
}

function PaymentForm() {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!stripe || !elements || submitting) return;
    setSubmitting(true);
    setError("");
    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/billing?done=1` },
    });
    if (confirmError) {
      setError(confirmError.message ?? "決済に失敗しました");
      setSubmitting(false);
    }
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
