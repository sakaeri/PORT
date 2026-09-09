export function yen(n: number): string {
  return "¥" + Math.round(n).toLocaleString("ja-JP");
}

export function timeLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function dateLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

const DOW = ["日", "月", "火", "水", "木", "金", "土"];

export function dowLabel(dayIndex: number): string {
  return DOW[dayIndex] ?? "";
}
