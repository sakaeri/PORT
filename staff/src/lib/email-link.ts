import { createHmac, timingSafeEqual } from "node:crypto";

// 通知メールのボタン用のリンク。メールのアプリから開くと、ホーム画面のアプリとは
// 別のブラウザ（ログインしていない）で開くことが多く、毎回ログインを求められていた。
// そこで「誰あての・どの画面を開くリンクか」を署名して URL に入れ、/auth/open で
// 確かめてから、その人としてログインした状態で画面を開く。
// 依頼主アプリと本部アプリの両方で同じものを使う（どちらも同じ鍵から作るので、
// 片方で作ったリンクをもう片方で確かめられる）。

const VALID_DAYS = 7;

function key(): Buffer {
  return createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").update("port-email-open-link-v1").digest();
}

function sign(payload: string): string {
  return createHmac("sha256", key()).update(payload).digest("base64url");
}

// appUrl: 開く側のアプリ（https://port.s-stylegolf.com など）。path: そのアプリ内の画面（/ 始まり）。
export function emailOpenUrl(appUrl: string, userId: string | null | undefined, path: string): string {
  if (!appUrl) return "";
  if (!userId || !process.env.SUPABASE_SERVICE_ROLE_KEY) return `${appUrl}${path === "/" ? "" : path}`;
  const payload = Buffer.from(JSON.stringify({ u: userId, p: path, e: Date.now() + VALID_DAYS * 86400_000 })).toString("base64url");
  return `${appUrl}/auth/open?t=${payload}.${sign(payload)}`;
}

export function safePath(raw: unknown): string {
  return typeof raw === "string" && /^\/(?![\/\\])[^\\]*$/.test(raw) ? raw : "/";
}

// 署名が正しく期限内なら、あて先の人と開く画面を返す。
export function readEmailOpenToken(token: string | null): { userId: string; path: string; expired: boolean } | null {
  if (!token || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { u?: unknown; p?: unknown; e?: unknown };
    if (typeof data.u !== "string" || typeof data.e !== "number") return null;
    return { userId: data.u, path: safePath(data.p), expired: Date.now() > data.e };
  } catch {
    return null;
  }
}
