// 見積もりで決める「完了予定日」（日本時間の日付 YYYY-MM-DD）まわりの共通処理。

const JST_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" });

export function jstTodayDate(): string {
  return JST_DATE.format(new Date());
}

export function isDueDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00+09:00`).getTime());
}

// その日の終わり（日本時間 23:59）を期限として扱う。
export function dueDateEndISO(date: string): string {
  return new Date(`${date}T23:59:59+09:00`).toISOString();
}

// 例：11月3日（月）
export function dueDateLabel(date: string): string {
  const d = new Date(`${date}T12:00:00+09:00`);
  const weekday = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", weekday: "short" }).format(d);
  const [, month, day] = date.split("-").map(Number);
  return `${month}月${day}日（${weekday}）`;
}
