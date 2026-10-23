import type { MetadataRoute } from "next";

// ホーム画面に追加したとき、アドレスバーのない全画面でアプリのように開くための設定。
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "中央秘書事務所 本部",
    short_name: "中央秘書 本部",
    description: "中央秘書事務所の本部・秘書用の画面",
    start_url: "/",
    display: "standalone",
    background_color: "#16281f",
    theme_color: "#16281f",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
