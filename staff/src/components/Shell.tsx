"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Headset, Users, ChatsCircle, ChartBar, UsersThree, GearSix, Buildings, Sun, MoonStars, SignOut } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import { headingWeight } from "@/lib/style";
import type { StaffContext } from "@/lib/data";

const NAV = [
  { href: "/customers", label: "依頼主", icon: Users },
  { href: "/cases", label: "案件トーク", icon: ChatsCircle },
  { href: "/stats", label: "売上・実績", icon: ChartBar },
  { href: "/staff", label: "スタッフ", icon: UsersThree, hideWhenSolo: true },
  { href: "/menu", label: "メニュー管理", icon: GearSix },
  { href: "/orgs", label: "事業者管理", icon: Buildings, hqOnly: true },
];

export default function Shell({ ctx, children }: { ctx: StaffContext; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isDark, setIsDark] = useState(() => (typeof document === "undefined" ? true : document.documentElement.getAttribute("data-vid-theme") !== "light"));

  function toggleTheme() {
    const next = isDark ? "light" : "dark";
    document.documentElement.setAttribute("data-vid-theme", next);
    try {
      localStorage.setItem("VID_theme", next);
    } catch {
      /* ignore */
    }
    setIsDark(!isDark);
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div style={{ height: "100vh", display: "flex", background: "var(--color-bg)", color: "var(--color-text)", fontFamily: "var(--font-body)" }}>
      <aside
        style={{
          flex: "none",
          width: 220,
          display: "flex",
          flexDirection: "column",
          gap: 4,
          padding: "var(--space-4)",
          borderRight: "1px solid var(--color-divider)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 4px 18px" }}>
          <div style={{ width: 30, height: 30, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "var(--radius-md)", border: "1px solid var(--color-accent)" }}>
            <Headset size={16} color="var(--color-accent)" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ctx.orgDisplayName}</div>
            <div style={{ fontSize: 10.5, color: "var(--color-neutral-500)" }}>受付画面</div>
          </div>
        </div>

        {NAV.filter((n) => !(n.hideWhenSolo && ctx.solo) && !(n.hqOnly && !ctx.isHq)).map((n) => {
          const active = pathname === n.href || pathname.startsWith(n.href + "/");
          const Icon = n.icon;
          return (
            <Link
              key={n.href}
              href={n.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                height: 38,
                padding: "0 10px",
                borderRadius: "var(--radius-md)",
                fontSize: 13.5,
                textDecoration: "none",
                color: active ? "var(--color-accent-100)" : "var(--color-text)",
                background: active ? "var(--color-accent-900)" : "transparent",
              }}
            >
              <Icon size={16} />
              {n.label}
            </Link>
          );
        })}

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingTop: 10, borderTop: "1px solid var(--color-divider)" }}>
          <div style={{ padding: "4px 4px 8px", fontSize: 11.5, color: "var(--color-neutral-500)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ctx.displayName}</div>
          <button
            onClick={toggleTheme}
            style={{ display: "flex", alignItems: "center", gap: 10, height: 34, padding: "0 10px", cursor: "pointer", fontSize: 12.5, color: "var(--color-neutral-400)", background: "transparent", border: "none", borderRadius: "var(--radius-md)" }}
          >
            {isDark ? <Sun size={15} /> : <MoonStars size={15} />}
            {isDark ? "ライトに切替" : "ダークに切替"}
          </button>
          <button
            onClick={handleSignOut}
            style={{ display: "flex", alignItems: "center", gap: 10, height: 34, padding: "0 10px", cursor: "pointer", fontSize: 12.5, color: "var(--color-neutral-400)", background: "transparent", border: "none", borderRadius: "var(--radius-md)" }}
          >
            <SignOut size={15} />
            ログアウト
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>{children}</main>
    </div>
  );
}
