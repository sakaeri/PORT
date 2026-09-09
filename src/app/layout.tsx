import type { Metadata } from "next";
import { Inter, Noto_Sans_JP } from "next/font/google";
import "@phosphor-icons/web/regular";
import "@phosphor-icons/web/fill";
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
  title: "動画制作の窓口",
  description: "依頼主向けトーク画面",
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
