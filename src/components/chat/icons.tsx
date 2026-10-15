"use client";

import { Image as ImageIcon, FilePdf, FileXls, FileDoc, FileZip, FileVideo, Paperclip, XCircle, CheckCircle, CircleDashed, Circle } from "@phosphor-icons/react";

// 以前はアイコンフォント（@phosphor-icons/web）のクラス名で出していたが、
// そのスタイルシートを全画面で読み込む分だけページが重くなるため、
// ほかの画面と同じ React のアイコン部品にそろえた。

export function FileIcon({ name, size, color }: { name: string; size: number; color?: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const props = { size, color, style: { flex: "none" as const } };
  if (["png", "jpg", "jpeg", "gif", "webp", "heic"].includes(ext)) return <ImageIcon {...props} />;
  if (ext === "pdf") return <FilePdf {...props} />;
  if (["xls", "xlsx", "csv"].includes(ext)) return <FileXls {...props} />;
  if (["doc", "docx"].includes(ext)) return <FileDoc {...props} />;
  if (["zip", "rar", "7z"].includes(ext)) return <FileZip {...props} />;
  if (["mp4", "mov", "avi"].includes(ext)) return <FileVideo {...props} />;
  return <Paperclip {...props} />;
}

// 進捗の各段階のアイコン。済み（見送り・キャンセルなら×）／今ここ／まだ。
export function StepIcon({ state, stopped, size }: { state: string; stopped: boolean; size: number }) {
  const style = { flex: "none" as const };
  if (state === "done" || state === "muted") return stopped ? <XCircle size={size} weight="fill" style={style} /> : <CheckCircle size={size} weight="fill" style={style} />;
  if (state === "current") return <CircleDashed size={size} style={style} />;
  return <Circle size={size} style={style} />;
}
