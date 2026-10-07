"use client";

import { UserCircle } from "@phosphor-icons/react";

// どのチャットでも「相手」の吹き出しの横に出す小さい丸アイコン。画像があれば
// それを、なければ頭文字、どちらもなければ人型アイコンを表示する
// （依頼主側アプリの AvatarPicker.tsx の Avatar と同じ考え方）。
export function avatarInitial(name: string | null | undefined): string {
  return name ? name.trim().charAt(0) : "";
}

export default function Avatar({ url, initial, size = 28 }: { url: string | null | undefined; initial?: string; size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        flex: "none",
        borderRadius: "50%",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: url ? "transparent" : "var(--color-accent)",
        border: "1px solid var(--color-divider)",
      }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- 任意サイズの外部ストレージ画像のため plain img
        <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : initial ? (
        <span style={{ fontFamily: "var(--font-heading)", fontSize: size * 0.42, color: "#fff" }}>{initial}</span>
      ) : (
        <UserCircle size={size * 0.6} color="#fff" />
      )}
    </div>
  );
}
