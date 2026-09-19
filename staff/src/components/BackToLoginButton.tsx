"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOutStaff } from "@/lib/signOutStaff";

export default function BackToLoginButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    if (pending) return;
    setPending(true);
    await signOutStaff();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      style={{
        marginTop: 16,
        height: 38,
        padding: "0 16px",
        cursor: pending ? "wait" : "pointer",
        fontSize: 13,
        color: "var(--color-accent-100)",
        background: "var(--color-accent-900)",
        border: "1px solid var(--color-accent)",
        borderRadius: "var(--radius-md)",
      }}
    >
      {pending ? "戻っています…" : "ログイン画面に戻る"}
    </button>
  );
}
