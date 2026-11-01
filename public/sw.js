// プッシュ通知を受け取って表示し、タップされたらその画面を開くだけのサービスワーカー。
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  // ホーム画面のアイコンの数字。件数が分かればその数、分からなければ印だけ付ける。
  const badge =
    "setAppBadge" in self.navigator
      ? (typeof data.badge === "number" && data.badge > 0 ? self.navigator.setAppBadge(data.badge) : self.navigator.setAppBadge()).catch(() => {})
      : Promise.resolve();
  event.waitUntil(
    Promise.all([
      badge,
      self.registration.showNotification(data.title || "中央秘書事務所", {
        body: data.body || "",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: { url: data.url || "/" },
      }),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin);
  const url = target.href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        // 同じアプリの画面が開いていれば、そこで開く（もう一方のアプリの通知なら新しく開く）。
        if (target.origin === self.location.origin && client.url.startsWith(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
