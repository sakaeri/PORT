export interface PreviewMessage {
  kind: string;
  body: string | null;
  payload: unknown;
  deleted_at?: string | null;
}

// 依頼主一覧の2行目用の軽量プレビュー。CustomerThread.tsx の summarize() と
// 見た目を揃えているが、添付ファイルの件数までは一覧クエリでは持たないため
// files は件数なしの表記にしている。
export function previewMessage(m: PreviewMessage): string {
  if (m.deleted_at) return "削除されました";
  const p = m.payload as { title?: string; menuLabel?: string; total?: number; summary?: string };
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
      return `［確認事項］${m.body ?? ""}`;
    case "system":
      return m.body ?? "［システム］";
    default:
      return m.body ?? `［${m.kind}］`;
  }
}
