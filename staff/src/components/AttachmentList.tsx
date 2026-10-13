"use client";

import { useEffect, useState } from "react";
import { FilePdf, Paperclip } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";

// 依頼主トークの添付ファイル（kind="files"）の表示。画像はサムネイル、それ以外は
// ファイル名のチップで出し、押すと署名付きURLで別タブに開く（attachments
// バケットは非公開なので、そのままのパスでは表示できない）。
export interface AttachmentItem {
  id: string;
  file_path: string;
  file_name: string;
  mime: string | null;
}

function isImage(a: AttachmentItem): boolean {
  return (a.mime ?? "").startsWith("image/") || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(a.file_name);
}

export default function AttachmentList({ attachments, orgId }: { attachments: AttachmentItem[]; orgId: string }) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const imagePaths = attachments.filter(isImage).map((a) => a.file_path);
  const imageKey = imagePaths.join("|");

  useEffect(() => {
    if (!imageKey) return;
    let cancelled = false;
    createClient(orgId)
      .storage.from("attachments")
      .createSignedUrls(imageKey.split("|"), 60 * 60)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const next: Record<string, string> = {};
        for (const d of data) if (d.path && d.signedUrl) next[d.path] = d.signedUrl;
        setThumbs(next);
      });
    return () => {
      cancelled = true;
    };
  }, [imageKey, orgId]);

  async function open(a: AttachmentItem) {
    setError("");
    const { data, error: e } = await createClient(orgId).storage.from("attachments").createSignedUrl(a.file_path, 60);
    if (e || !data?.signedUrl) {
      setError("ファイルを開けませんでした");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: "100%" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {attachments.map((a) =>
          isImage(a) ? (
            <button
              key={a.id}
              onClick={() => open(a)}
              aria-label={a.file_name}
              style={{ width: 120, height: 120, padding: 0, cursor: "pointer", overflow: "hidden", borderRadius: "var(--radius-md)", border: "1px solid var(--color-divider)", background: "var(--color-surface)" }}
            >
              {thumbs[a.file_path] && (
                // eslint-disable-next-line @next/next/no-img-element -- 署名付きURLの外部ストレージ画像のため plain img
                <img src={thumbs[a.file_path]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              )}
            </button>
          ) : (
            <button
              key={a.id}
              onClick={() => open(a)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, maxWidth: 240, height: 34, padding: "0 10px", cursor: "pointer", fontSize: 12, color: "var(--color-text)", background: "var(--color-surface)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}
            >
              {/\.pdf$/i.test(a.file_name) ? <FilePdf size={15} color="var(--color-accent)" /> : <Paperclip size={15} color="var(--color-accent)" />}
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.file_name}</span>
            </button>
          ),
        )}
      </div>
      {error && <span style={{ fontSize: 11, color: "var(--color-accent-200)" }}>{error}</span>}
    </div>
  );
}
