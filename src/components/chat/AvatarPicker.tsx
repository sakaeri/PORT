"use client";

import { useRef, useState } from "react";
import { UserCircle, CircleNotch } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import { updateAvatar, removeAvatar } from "@/app/actions";

const NAME_PLACEHOLDER = "未登録の依頼主";

const menuItemStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "9px 14px",
  fontSize: 12.5,
  whiteSpace: "nowrap",
  cursor: "pointer",
  color: "var(--color-text)",
  background: "transparent",
  border: "none",
};

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
// 画像そのものをタップするとメニューが開く方式（外に変更/削除ボタンを常設しない）。
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
  const [menuOpen, setMenuOpen] = useState(false);
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
    setMenuOpen(false);
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
    <div style={{ position: "relative", flex: "none" }}>
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePick} style={{ display: "none" }} />
      <button
        onClick={() => setMenuOpen((v) => !v)}
        disabled={uploading}
        aria-label="プロフィール画像を変更"
        style={{ position: "relative", padding: 0, border: "none", background: "transparent", borderRadius: "50%", cursor: uploading ? "wait" : "pointer" }}
      >
        <Avatar url={avatarUrl} initial={avatarInitial(customerName)} size={52} />
        {uploading && (
          <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)", borderRadius: "50%" }}>
            <CircleNotch size={18} color="#fff" style={{ animation: "vid-spin 0.7s linear infinite" }} />
          </span>
        )}
      </button>

      {menuOpen && (
        <>
          <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 1 }} />
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              marginTop: 6,
              zIndex: 2,
              display: "flex",
              flexDirection: "column",
              borderRadius: "var(--radius-md)",
              background: "var(--color-surface)",
              border: "1px solid var(--color-divider)",
              boxShadow: "var(--shadow-lg)",
              overflow: "hidden",
            }}
          >
            <button
              onClick={() => {
                setMenuOpen(false);
                fileInputRef.current?.click();
              }}
              style={menuItemStyle}
            >
              {avatarUrl ? "画像を変更" : "画像を選ぶ"}
            </button>
            {avatarUrl && (
              <button onClick={handleRemove} style={{ ...menuItemStyle, color: "var(--color-accent-200)" }}>
                画像を削除
              </button>
            )}
          </div>
        </>
      )}

      {error && (
        <span style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, fontSize: 10.5, whiteSpace: "nowrap", color: "var(--color-accent-200)" }}>{error}</span>
      )}
    </div>
  );
}
