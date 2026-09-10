// サーバー（Vercel、UTC）とブラウザ（利用者、日本時間）でローカルタイムゾーンが違うため、
// d.getHours() 等をそのまま使うとSSRとハイドレーションで表示文字列が一致せず
// React のハイドレーションエラーになる。常に Asia/Tokyo 固定で計算する。
const TIME_ZONE = "Asia/Tokyo";

function tokyoParts(iso: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

export function yen(n: number): string {
  return "¥" + Math.round(n).toLocaleString("ja-JP");
}

export function timeLabel(iso: string): string {
  const { hour, minute } = tokyoParts(iso);
  return `${Number(hour)}:${minute}`; // hourは環境によって "09" のようにゼロ埋めされることがあるため揃える
}

export function dateLabel(iso: string): string {
  const { month, day } = tokyoParts(iso);
  return `${Number(month)}/${Number(day)}`;
}

export function monthKey(iso: string): string {
  const { year, month } = tokyoParts(iso);
  return `${year}年${Number(month)}月`;
}

const DOW = ["日", "月", "火", "水", "木", "金", "土"];

export function dowLabel(dayIndex: number): string {
  return DOW[dayIndex] ?? "";
}
