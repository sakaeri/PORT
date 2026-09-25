export interface PreviewMessage {
  kind: string;
  body: string | null;
  payload: unknown;
  deleted_at?: string | null;
}

// 依頼主一覧では「誰の発言か」を一覧だけで分かるように、本文の前に
// 「依頼主：」「担当者：」を付ける。依頼主名・担当者名までは付けない
// （一覧の行ラベル側に両方すでに出ているため）。
export function senderPrefix(role: string | null): string | undefined {
  if (role == null) return undefined;
  return role === "client" ? "依頼主" : "担当者";
}

// 依頼主一覧の2行目用の軽量プレビュー。CustomerThread.tsx の summarize() と
// 見た目を揃えているが、添付ファイルの件数までは一覧クエリでは持たないため
// files は件数なしの表記にしている。
export function previewMessage(m: PreviewMessage, prefix?: string): string {
  const body = previewBody(m);
  return prefix ? `${prefix}：${body}` : body;
}

function previewBody(m: PreviewMessage): string {
  if (m.deleted_at) return "削除されました";
  const p = m.payload as { title?: string; menuLabel?: string; total?: number; summary?: string; formLabel?: string };
  switch (m.kind) {
    case "text":
      return m.body ?? "";
    case "files":
      return "［添付ファイル］";
    case "quote":
      return `［見積もり］${p.title ?? ""}${p.total != null ? ` ¥${Number(p.total).toLocaleString("ja-JP")}` : ""}`;
    case "menu_pick":
      return `［メニュー選択］${p.menuLabel ?? ""}`;
    case "report":
      return `［完了報告］${p.summary ?? ""}`;
    case "rating":
      return "［評価］";
    case "notice":
      return `［お知らせ］${m.body ?? ""}`;
    case "off_choice":
      return `［選択］${m.body ?? ""}`;
    case "intake_request":
      return `［確認事項］${p.formLabel ?? m.body ?? ""}`;
    case "intake_answer":
      return `［確認事項への回答］${p.formLabel ?? ""}`;
    case "system":
      return m.body ?? "［システム］";
    default:
      return m.body ?? `［${m.kind}］`;
  }
}
