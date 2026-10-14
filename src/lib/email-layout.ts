// 通知メールの共通レイアウト。依頼主アプリ・本部アプリの両方で同じ見た目にする
// （staff/src/lib/email-layout.ts と同じ内容。片方を変えたらもう片方も揃えること）。
// デザインは Supabase の管理画面に設定済みのログイン系メール
// （supabase/templates/email_change.html）に合わせてある：
// ベージュのカード → 小さな事業所名 → 太字の見出し → 本文 → 用途ごとのボタン → 末尾の一言。

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function emailSubject(orgName: string, title: string): string {
  return orgName ? `【${orgName}】${title}` : title;
}

// lines は本文の段落（プレーンテキスト。HTMLはエスケープされる）。
export function renderEmail({
  orgName,
  heading,
  lines,
  url,
  buttonLabel,
}: {
  orgName: string;
  heading: string;
  lines: string[];
  url?: string | null;
  buttonLabel?: string;
}): string {
  const org = esc(orgName || "PORT");
  const body = lines.map((l) => `<p style="font-size: 14px; line-height: 1.8; color: #4a4a4a; margin: 0 0 12px;">${esc(l)}</p>`).join("");
  const button =
    url && buttonLabel
      ? `<p style="margin: 12px 0 24px;"><a href="${esc(url)}" style="display: inline-block; padding: 14px 32px; background-color: #2f4f3f; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600;">${esc(buttonLabel)}</a></p>`
      : `<div style="height: 12px;"></div>`;
  return `<div style="font-family: 'Hiragino Sans', 'Yu Gothic', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background-color: #faf8f3; border-radius: 12px;">
  <p style="font-size: 12px; letter-spacing: 0.1em; color: #8a7d5c; text-transform: uppercase; margin: 0 0 8px;">${org}</p>
  <h2 style="font-size: 20px; color: #2b2b2b; margin: 0 0 16px; font-weight: 600;">${esc(heading)}</h2>
  ${body}
  ${button}
  <p style="font-size: 12px; line-height: 1.7; color: #9a9a9a; margin: 0;">
    このメールは送信専用です。ご用件はトーク画面からお送りください。<br>
    ちょっとした頼みごとも、まずはこちらから。${org}
  </p>
</div>`;
}
