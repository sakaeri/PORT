"use client";

import { useEffect, useState } from "react";
import { BellRinging, X } from "@phosphor-icons/react";
import { savePushSubscription } from "@/app/actions";
import InfoTooltip from "@/components/InfoTooltip";

// プッシュ通知の許可と端末の登録。画面の上に出す案内（PushBanner）と、設定画面の行（PushSettingRow）。
// iPhone はホーム画面に追加したアプリでしか通知を受け取れない（ブラウザでは使えないので案内も出さない）。

const DISMISS_KEY = "vid_push_dismissed";
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function pushSupported() {
  return typeof window !== "undefined" && !!VAPID_PUBLIC_KEY && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

// 許可を求め（済みなら聞かずに）、この端末を通知の宛先として登録する。
async function enablePush(): Promise<NotificationPermission> {
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return permission;
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) }));
  const json = sub.toJSON();
  await savePushSubscription({ endpoint: json.endpoint ?? "", p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" });
  return permission;
}

export default function PushBanner() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pushSupported()) return;
    if (Notification.permission === "granted") {
      // 許可済みなら、ログインし直した人の宛先として黙って登録し直す。
      enablePush().catch(() => {});
      return;
    }
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of browser state after mount
    if (Notification.permission === "default" && !dismissed) setShow(true);
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
    setShow(false);
  }

  async function turnOn() {
    setBusy(true);
    try {
      await enablePush();
    } catch {}
    setBusy(false);
    setShow(false);
  }

  if (!show) return null;
  return (
    <div className="no-print" style={{ flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "var(--color-accent-900)", borderBottom: "1px solid var(--color-divider)" }}>
      <BellRinging size={16} color="var(--color-accent)" style={{ flex: "none" }} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: "var(--color-text)" }}>新しいメッセージを通知でお知らせします</span>
      <button onClick={turnOn} disabled={busy} style={{ flex: "none", height: 30, padding: "0 12px", cursor: "pointer", fontSize: 12, whiteSpace: "nowrap", color: "var(--color-bg)", background: "var(--color-accent)", border: "none", borderRadius: "var(--radius-md)", opacity: busy ? 0.6 : 1 }}>
        オンにする
      </button>
      <button onClick={dismiss} aria-label="閉じる" style={{ flex: "none", display: "flex", padding: 4, cursor: "pointer", color: "var(--color-neutral-500)", background: "transparent", border: "none" }}>
        <X size={14} />
      </button>
    </div>
  );
}

// 設定画面の「通知」の行。案内を閉じた人も、ここからオンにできる。
export function PushSettingRow({ rowStyle, buttonStyle }: { rowStyle: React.CSSProperties; buttonStyle: React.CSSProperties }) {
  const [state, setState] = useState<"unsupported" | NotificationPermission>("unsupported");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of browser state after mount
    setState(pushSupported() ? Notification.permission : "unsupported");
  }, []);

  async function turnOn() {
    setBusy(true);
    try {
      setState(await enablePush());
    } catch {}
    setBusy(false);
  }

  return (
    <div style={rowStyle}>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, display: "inline-flex", alignItems: "center", gap: 4 }}>
        通知
        <InfoTooltip text="新しいメッセージなどを、スマホやパソコンの通知でお知らせします。iPhoneは「ホーム画面に追加」したアプリで開いたときに使えます。オフにするときは、端末の設定から通知を止めてください。" />
      </span>
      {state === "granted" && <span style={{ fontSize: 12, color: "var(--color-accent)" }}>オン</span>}
      {state === "denied" && <span style={{ fontSize: 11.5, color: "var(--color-neutral-500)" }}>端末の設定で止まっています</span>}
      {state === "unsupported" && <span style={{ fontSize: 11.5, color: "var(--color-neutral-500)" }}>この画面では使えません</span>}
      {state === "default" && (
        <button onClick={turnOn} disabled={busy} style={buttonStyle}>
          オンにする
        </button>
      )}
    </div>
  );
}
