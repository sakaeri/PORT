"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Script from "next/script";
import { headingWeight } from "@/lib/style";
import { signUpSelfServe } from "@/app/actions";
import { EMPTY_ORG_FORM, OrgAccountFields, slugify, type OrgAccountFormState } from "@/components/OrgAccountFields";

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: { sitekey: string; callback: (token: string) => void }) => string;
    };
  }
}

const card: React.CSSProperties = {
  padding: 20,
  borderRadius: "var(--radius-md)",
  background: "var(--color-surface)",
  border: "1px solid var(--color-divider)",
  boxShadow: "var(--shadow-sm)",
  display: "flex",
  flexDirection: "column",
  gap: 14,
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

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export default function SignupForm({ refUserId }: { refUserId: string | null }) {
  const [form, setForm] = useState<OrgAccountFormState>(EMPTY_ORG_FORM);
  const [slugTouched, setSlugTouched] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const renderedRef = useRef(false);

  function set<K extends keyof OrgAccountFormState>(key: K, value: string) {
    setForm((f) => {
      const next = { ...f, [key]: value };
      if (key === "display_name" && !slugTouched) next.slug = slugify(value);
      if (key === "slug") setSlugTouched(true);
      return next;
    });
  }

  function handleTurnstileLoaded() {
    if (renderedRef.current || !TURNSTILE_SITE_KEY || !turnstileRef.current || !window.turnstile) return;
    renderedRef.current = true;
    window.turnstile.render(turnstileRef.current, { sitekey: TURNSTILE_SITE_KEY, callback: setTurnstileToken });
  }

  async function submit() {
    if (submitting) return;
    setError("");
    setSubmitting(true);
    try {
      await signUpSelfServe(form, refUserId, turnstileToken);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "登録できませんでした");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div style={card}>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 18 }}>アカウントを作成しました</div>
        <div style={{ fontSize: 13, lineHeight: 1.7 }}>
          入力いただいたメールアドレスとパスワードでログインできます。{refUserId && "紹介経由のため、トライアル期間は90日間になります。"}
        </div>
        <Link href="/login" style={{ ...primaryBtn, display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none", alignSelf: "flex-start" }}>
          ログインへ進む
        </Link>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 24 }}>PORTを始める</div>
        <div style={{ fontSize: 12.5, color: "var(--color-neutral-500)", marginTop: 4 }}>
          30日間無料でお試しいただけます。{refUserId && "紹介リンク経由のため、トライアル期間は90日間になります。"}
        </div>
      </div>

      <div style={card}>
        <OrgAccountFields form={form} set={set} />

        {TURNSTILE_SITE_KEY && (
          <>
            <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" onLoad={handleTurnstileLoaded} />
            <div ref={turnstileRef} />
          </>
        )}

        {error && <span style={{ fontSize: 11.5, color: "var(--color-accent-200)" }}>{error}</span>}

        <button onClick={submit} disabled={submitting} style={{ ...primaryBtn, alignSelf: "flex-start" }}>
          {submitting ? "作成中…" : "無料で始める"}
        </button>
      </div>
    </div>
  );
}
