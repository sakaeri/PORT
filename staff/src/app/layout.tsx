import type { Metadata, Viewport } from "next";
// 書体ファイルとアイコンフォントは配らない（楽天モバイルの5Gなど、大きいファイルが
// 途中で止まりやすい回線で画面が出なくなるため）。アイコンは @phosphor-icons/react で描く。
import "./globals.css";

export const metadata: Metadata = {
  title: "中央秘書事務所 本部",
  description: "受付・スタッフ向け業務画面",
  // iPhone の「ホーム画面に追加」で、アプリのように全画面で開く。
  appleWebApp: { capable: true, title: "中央秘書 本部", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#16281f",
  // ホーム画面から開いたとき、画面下のホームバーの分の余白（safe-area）を測れるようにする。
  viewportFit: "cover",
};

// Runs before paint so the persisted theme choice applies with no flash of
// the wrong theme (mirrors the client app's approach, default dark).
const themeInitScript = `
(function () {
  try {
    var v = localStorage.getItem('VID_theme') === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-vid-theme', v);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // テーマの属性（data-vid-theme）は描画前のスクリプトで付けるので、そこだけの食い違いは警告しない。
    <html lang="ja" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
