// 通知メールの共通レイアウト。依頼主アプリ・本部アプリの両方で同じ見た目にする
// （staff/src/lib/email-layout.ts と同じ内容。片方を変えたらもう片方も揃えること）。
// Supabaseのログイン系メール（supabase/templates/*.html）も同じデザインに合わせてある。
//
// 件名は必ず「【事業所名】…」、ボタンの文言は「確認する」に統一する。
// メールクライアントでの崩れを避けるため、装飾はテーブル＋インラインstyleだけで組む。

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function emailSubject(orgName: string, title: string): string {
  return orgName ? `【${orgName}】${title}` : title;
}

// lines は本文の段落（プレーンテキスト。HTMLはエスケープされる）。
export function renderEmail({ orgName, lines, url }: { orgName: string; lines: string[]; url?: string | null }): string {
  const body = lines.map((l) => `<p style="margin:0 0 12px;font-size:14px;line-height:1.8;color:#333333;">${esc(l)}</p>`).join("");
  const button = url
    ? `<p style="margin:20px 0 4px;"><a href="${esc(url)}" style="display:inline-block;padding:11px 28px;border-radius:6px;background:#1f3b2d;color:#ffffff;font-size:14px;text-decoration:none;">確認する</a></p>`
    : "";
  return `<!doctype html><html lang="ja"><body style="margin:0;padding:0;background:#f4f2ec;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2ec;padding:24px 12px;font-family:'Hiragino Sans','Yu Gothic',Meiryo,sans-serif;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:10px;overflow:hidden;">
<tr><td style="padding:18px 24px;background:#1f3b2d;color:#ffffff;font-size:15px;font-weight:bold;">${esc(orgName || "PORT")}</td></tr>
<tr><td style="padding:24px;">${body}${button}</td></tr>
<tr><td style="padding:14px 24px;border-top:1px solid #eeeeee;font-size:11px;line-height:1.7;color:#999999;">このメールは送信専用です。ご返信いただいてもお答えできませんので、ご用件はトーク画面からお送りください。</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}
