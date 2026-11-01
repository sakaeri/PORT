import webpush from "web-push";
import type { createServiceRoleClient } from "@/lib/supabase/server";

type Admin = ReturnType<typeof createServiceRoleClient>;

let configured: boolean | null = null;
function configure(): boolean {
  if (configured !== null) return configured;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  configured = !!(publicKey && privateKey);
  if (configured) webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:hello.stb.app@gmail.com", publicKey!, privateKey!);
  return configured;
}

// 指定した人たちの、通知を許可した全端末へプッシュ通知を送る。鍵が未設定なら何もしない。
// 端末側で通知をやめた（期限切れ・解除済み）宛先は、送った時点で消しておく。
// 失敗しても呼び出し元の処理は止めない。
export async function sendPush(admin: Admin, userIds: string[], payload: { title: string; body: string; url: string }) {
  try {
    if (!userIds.length || !configure()) return;
    const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").in("user_id", userIds);
    const body = JSON.stringify(payload);
    await Promise.all(
      (subs ?? []).map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 60 * 60 * 24 });
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) await admin.from("push_subscriptions").delete().eq("id", s.id);
          else console.error("sendPush failed", status);
        }
      }),
    );
  } catch (e) {
    console.error("sendPush failed", e);
  }
}
