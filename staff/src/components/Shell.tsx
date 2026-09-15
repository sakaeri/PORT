"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Headset, Users, ChatsCircle, ChartBar, UsersThree, GearSix, Buildings, Sun, MoonStars, SignOut } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import OrgSwitcher from "@/components/OrgSwitcher";
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
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const supabase = createClient(ctx.orgId);
    let cancelled = false;
    async function refreshUnread() {
      const { data } = await supabase.rpc("unread_customer_count");
      if (!cancelled && typeof data === "number") setUnreadCount(data);
    }
    void refreshUnread();
    const channel = supabase
      .channel(`unread-${ctx.orgId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, refreshUnread)
      .on("postgres_changes", { event: "*", schema: "public", table: "threads" }, refreshUnread)
      .subscribe();
    const interval = setInterval(refreshUnread, 4000);
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
    // pathname included so navigating away from a thread (which marks it read) re-checks the count
  }, [ctx.orgId, pathname]);
  // Always start matching the server's render (dark) — the inline script in
  // layout.tsx already set the real data-vid-theme attribute on <html>
  // before hydration, so reading it here in the initializer would make the
  // client's first render diverge from the server's and produce a hydration
  // mismatch whenever the visitor had actually chosen light mode before.
  // Syncing in an effect (client-only, runs after hydration) avoids that.
  const [isDark, setIsDark] = useState(true);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from the DOM (set by an inline script outside React), not state derived from props/state
    setIsDark(document.documentElement.getAttribute("data-vid-theme") !== "light");
  }, []);

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
          background: "var(--color-surface)",
          borderRight: "1px solid var(--color-divider)",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "6px 4px 4px" }}>
          <div style={{ width: 30, height: 30, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "var(--radius-md)", border: "1px solid var(--color-accent)" }}>
            <Headset size={16} color="var(--color-accent)" />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <OrgSwitcher orgId={ctx.orgId} orgDisplayName={ctx.orgDisplayName} role={ctx.role} orgs={ctx.orgs} />
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
                borderLeft: active ? "3px solid var(--color-accent)" : "3px solid transparent",
                fontSize: 13.5,
                fontWeight: active ? 600 : 400,
                textDecoration: "none",
                color: active ? "var(--color-accent)" : "var(--color-text)",
                background: active ? "color-mix(in srgb, var(--color-accent) 14%, transparent)" : "transparent",
              }}
            >
              <Icon size={16} />
              {n.label}
              {n.href === "/customers" && unreadCount > 0 && (
                <span
                  style={{
                    marginLeft: "auto",
                    minWidth: 18,
                    height: 18,
                    padding: "0 5px",
                    display: "grid",
                    placeItems: "center",
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: "var(--color-bg)",
                    background: "var(--color-accent-200)",
                    borderRadius: 9,
                  }}
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
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
