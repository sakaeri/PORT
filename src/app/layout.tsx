import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_JP } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const notoSansJp = Noto_Sans_JP({
  variable: "--font-noto-jp",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "PORT",
  description: "秘書とのやり取り画面",
  // iPhone の「ホーム画面に追加」で、アプリのように全画面で開く。
  appleWebApp: { capable: true, title: "中央秘書 窓口", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#16281f",
  // ホーム画面から開いたとき、画面下のホームバーの分の余白（safe-area）を測れるようにする。
  viewportFit: "cover",
};

// Runs before paint so the persisted theme choice applies with no flash of
// the wrong theme (mirrors the prototype's _initTheme(), default dark).
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
    <html lang="ja" className={`${inter.variable} ${notoSansJp.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
