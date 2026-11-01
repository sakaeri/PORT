import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PORT",
  description: "秘書とのやり取り画面",
  // iPhone の「ホーム画面に追加」で、アプリのように全画面で開く。
  appleWebApp: { capable: true, title: "中央秘書 窓口", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#f3efe2",
  // ホーム画面から開いたとき、画面下のホームバーの分の余白（safe-area）を測れるようにする。
  viewportFit: "cover",
};

// Runs before paint so the persisted theme choice applies with no flash of
// the wrong theme. Default is light (easier to read for most people); dark only if chosen.
const themeInitScript = `
(function () {
  try {
    var v = localStorage.getItem('VID_theme') === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-vid-theme', v);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // テーマの属性（data-vid-theme）は描画前のスクリプトで付けるので、そこだけの食い違いは警告しない。
    <html lang="ja" data-vid-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
