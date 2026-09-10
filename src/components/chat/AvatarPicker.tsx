"use client";

import { useRef, useState } from "react";
import { UserCircle, CircleNotch } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import { updateAvatar, removeAvatar } from "@/app/actions";

const NAME_PLACEHOLDER = "未登録の依頼主";

export function avatarInitial(customerName: string): string {
  return customerName && customerName !== NAME_PLACEHOLDER ? customerName.trim().charAt(0) : "";
}

export function Avatar({ url, initial, size }: { url: string | null; initial: string; size: number }) {
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

// ログイン中であることが一目でわかるよう、プロフィール画像（なければ名前の頭文字）を
// ヘッダーのマイページボタンにも表示する。実際の画像はここから設定する。
export default function AvatarPicker({
  userId,
  customerName,
  avatarUrl,
  onChange,
}: {
  userId: string;
  customerName: string;
  avatarUrl: string | null;
  onChange: (url: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const supabase = createClient();
      const path = `${userId}/${crypto.randomUUID()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      await updateAvatar(data.publicUrl);
      onChange(data.publicUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "アップロードできませんでした");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    setUploading(true);
    setError("");
    try {
      await removeAvatar();
      onChange(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除できませんでした");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <Avatar url={avatarUrl} initial={avatarInitial(customerName)} size={52} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePick} style={{ display: "none" }} />
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 12px", cursor: "pointer", fontSize: 12, whiteSpace: "nowrap", color: "var(--color-accent)", background: "transparent", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)" }}
          >
            {uploading && <CircleNotch size={13} style={{ animation: "vid-spin 0.7s linear infinite" }} />}
            {avatarUrl ? "変更する" : "画像を選ぶ"}
          </button>
          {avatarUrl && (
            <button
              onClick={handleRemove}
              disabled={uploading}
              style={{ height: 32, padding: "0 12px", cursor: "pointer", fontSize: 12, whiteSpace: "nowrap", color: "var(--color-neutral-400)", background: "transparent", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}
            >
              削除
            </button>
          )}
        </div>
        {error && <span style={{ fontSize: 11, color: "var(--color-accent-200)" }}>{error}</span>}
      </div>
    </div>
  );
}
