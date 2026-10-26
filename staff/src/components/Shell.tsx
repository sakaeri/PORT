"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Users, ChatsCircle, ChartBar, UsersThree, GearSix, Sun, MoonStars, SignOut, List, X, PencilSimple, ListChecks } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import { useIsMobile } from "@/lib/useIsMobile";
import { headingWeight } from "@/lib/style";
import Modal from "@/components/Modal";
import AccountSettingsPanel from "@/components/AccountSettingsPanel";
import Avatar, { avatarInitial } from "@/components/Avatar";
import { signOutStaff } from "@/lib/signOutStaff";
import type { StaffContext } from "@/lib/data";

// dept_leader（表示名「スタッフ」）は依頼主とは直接やり取りしない役割なので、
// 依頼主一覧・売上実績・メニュー管理は隠す。案件トークと、本部との連絡用の
// スタッフ画面はそのまま使える。
const NAV = [
  { href: "/today", label: "今日やること", icon: ListChecks },
  { href: "/customers", label: "依頼主", icon: Users, hideWhenStaff: true },
  { href: "/cases", label: "案件トーク", icon: ChatsCircle },
  { href: "/staff", label: "スタッフ", icon: UsersThree },
  // 売上・実績とメニュー管理は本部（オーナー）だけ。秘書・スタッフには出さない。
  { href: "/stats", label: "売上・実績", icon: ChartBar, ownerOnly: true },
  { href: "/menu", label: "メニュー管理", icon: GearSix, ownerOnly: true },
];

export default function Shell({ ctx, children }: { ctx: StaffContext; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [myName, setMyName] = useState(ctx.displayName);
  const [myAvatarUrl, setMyAvatarUrl] = useState(ctx.avatarUrl);
  const [showMyName, setShowMyName] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  useEffect(() => {
    const supabase = createClient(ctx.orgId);
    let cancelled = false;
    async function refreshUnread() {
      const { data } = await supabase.rpc("unread_customer_count", { p_org_id: ctx.orgId });
      if (!cancelled) setUnreadCount(typeof data === "number" ? data : 0);
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

  // 「案件トーク」ナビの赤丸：未着手（支払い済み・未着手）／着手後で報告の
  // 目安時間まで残り15分以内（経過済みも含む）、のいずれかに当たる案件の件数。
  // is_office()のRLS（case_visible）に任せているので、マネージャーは自分の
  // 窓口、スタッフは自分の担当案件だけの件数になる。
  const [attentionCount, setAttentionCount] = useState(0);
  useEffect(() => {
    const supabase = createClient(ctx.orgId);
    let cancelled = false;
    async function refreshAttention() {
      const soon = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from("requests")
        .select("id", { count: "exact", head: true })
        .eq("org_id", ctx.orgId)
        .or(`phase.eq.preparing,and(phase.eq.started,due_at.lte.${soon})`);
      if (!cancelled) setAttentionCount(count ?? 0);
    }
    void refreshAttention();
    const channel = supabase
      .channel(`attention-${ctx.orgId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "requests", filter: `org_id=eq.${ctx.orgId}` }, refreshAttention)
      .subscribe();
    const interval = setInterval(refreshAttention, 60000);
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [ctx.orgId]);

  // ページ遷移したら開きっぱなしのドロワーを閉じる。
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting UI state on route change (external navigation event), not state derived from props/state
    setDrawerOpen(false);
  }, [pathname]);

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
    await signOutStaff();
    router.push("/login");
    router.refresh();
  }

  const isOwner = ctx.role === "owner" || ctx.role === "reception";
  const navItems = NAV.filter((n) => !("hideWhenStaff" in n && n.hideWhenStaff && ctx.role === "dept_leader") && !("ownerOnly" in n && n.ownerOnly && !isOwner));

  const sidebarBody = (
    <>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "6px 4px 4px" }}>
        <div style={{ width: 30, height: 30, flex: "none", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- 固定サイズの静的アセットのため plain img */}
          <img src="/logo.png" alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ padding: "8px 0 6px", fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 15, color: "var(--color-nav-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ctx.orgDisplayName}</div>
        </div>
      </div>

      {navItems.map((n) => {
        const active = pathname === n.href || pathname.startsWith(n.href + "/");
        const Icon = n.icon;
        const badgeCount = n.href === "/customers" ? unreadCount : n.href === "/cases" ? attentionCount : 0;
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
              borderLeft: active ? "3px solid var(--color-nav-accent)" : "3px solid transparent",
              fontSize: 13.5,
              fontWeight: active ? 600 : 400,
              textDecoration: "none",
              color: active ? "var(--color-nav-accent)" : "var(--color-nav-text)",
              background: active ? "var(--color-nav-active-bg)" : "transparent",
            }}
          >
            <Icon size={16} />
            {n.label}
            {badgeCount > 0 && (
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
                  color: "var(--color-nav-bg)",
                  background: "var(--color-nav-accent)",
                  borderRadius: 9,
                }}
              >
                {badgeCount > 99 ? "99+" : badgeCount}
              </span>
            )}
          </Link>
        );
      })}

      <div style={{ flex: 1 }} />

      <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingTop: 10, borderTop: "1px solid var(--color-nav-border)" }}>
        <button
          onClick={() => setShowMyName(true)}
          aria-label="アカウント設定"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 4px 8px",
            cursor: "pointer",
            fontSize: 11.5,
            color: "var(--color-nav-text-muted)",
            background: "transparent",
            border: "none",
          }}
        >
          <Avatar url={myAvatarUrl} initial={avatarInitial(myName)} size={24} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{myName}</span>
          <PencilSimple size={11} style={{ flex: "none" }} />
        </button>
        <button
          onClick={toggleTheme}
          style={{ display: "flex", alignItems: "center", gap: 10, height: 34, padding: "0 10px", cursor: "pointer", fontSize: 12.5, color: "var(--color-nav-text-muted)", background: "transparent", border: "none", borderRadius: "var(--radius-md)" }}
        >
          {isDark ? <Sun size={15} /> : <MoonStars size={15} />}
          {isDark ? "ライトに切替" : "ダークに切替"}
        </button>
        <button
          onClick={handleSignOut}
          style={{ display: "flex", alignItems: "center", gap: 10, height: 34, padding: "0 10px", cursor: "pointer", fontSize: 12.5, color: "var(--color-nav-text-muted)", background: "transparent", border: "none", borderRadius: "var(--radius-md)" }}
        >
          <SignOut size={15} />
          ログアウト
        </button>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <div style={{ height: "100dvh", display: "flex", flexDirection: "column", background: "var(--color-bg)", color: "var(--color-text)", fontFamily: "var(--font-body)" }}>
        <div className="app-shell-chrome" style={{ flex: "none", display: "flex", alignItems: "center", gap: 10, height: 52, padding: "0 var(--space-4)", background: "var(--color-nav-bg)", borderBottom: "1px solid var(--color-nav-border)" }}>
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="メニューを開く"
            style={{ flex: "none", display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, cursor: "pointer", color: "var(--color-nav-text)", background: "transparent", border: "none" }}
          >
            <List size={22} />
          </button>
          <div style={{ minWidth: 0, flex: 1, fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 15, color: "var(--color-nav-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ctx.orgDisplayName}</div>
          {unreadCount > 0 && (
            <span
              style={{ flex: "none", height: 20, padding: "0 8px", display: "grid", placeItems: "center", fontSize: 10.5, fontWeight: 700, whiteSpace: "nowrap", color: "var(--color-nav-bg)", background: "var(--color-nav-accent)", borderRadius: 10 }}
            >
              未読{unreadCount > 99 ? "99+" : unreadCount}件
            </span>
          )}
        </div>

        {drawerOpen && (
          <>
            <div onClick={() => setDrawerOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 69, background: "color-mix(in srgb, var(--color-bg) 55%, transparent)" }} />
            <aside
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                bottom: 0,
                width: "min(260px, 82vw)",
                zIndex: 70,
                display: "flex",
                flexDirection: "column",
                gap: 4,
                padding: "var(--space-4)",
                paddingBottom: "calc(var(--space-4) + env(safe-area-inset-bottom))",
                background: "var(--color-nav-bg)",
                borderRight: "1px solid var(--color-nav-border)",
                overflowY: "auto",
              }}
            >
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label="閉じる"
                style={{ alignSelf: "flex-end", display: "flex", cursor: "pointer", color: "var(--color-nav-text-muted)", background: "transparent", border: "none", padding: 4, marginBottom: 4 }}
              >
                <X size={18} />
              </button>
              {sidebarBody}
            </aside>
          </>
        )}

        <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>{children}</div>
        </main>
        {showMyName && (
          <Modal onClose={() => setShowMyName(false)} maxWidth={440}>
            <AccountSettingsPanel
              currentName={myName}
              orgDisplayName={ctx.orgDisplayName}
              loginEmail={ctx.email}
              isOwner={ctx.role === "owner"}
              userId={ctx.userId}
              orgId={ctx.orgId}
              avatarUrl={myAvatarUrl}
              onNameSaved={setMyName}
              onAvatarSaved={setMyAvatarUrl}
              onClose={() => setShowMyName(false)}
            />
          </Modal>
        )}
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", display: "flex", background: "var(--color-bg)", color: "var(--color-text)", fontFamily: "var(--font-body)" }}>
      <aside
        className="app-shell-chrome"
        style={{
          flex: "none",
          width: 220,
          display: "flex",
          flexDirection: "column",
          gap: 4,
          padding: "var(--space-4)",
          background: "var(--color-nav-bg)",
          borderRight: "1px solid var(--color-nav-border)",
        }}
      >
        {sidebarBody}
      </aside>

      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>{children}</div>
      </main>
      {showMyName && (
        <Modal onClose={() => setShowMyName(false)} maxWidth={440}>
          <AccountSettingsPanel
            currentName={myName}
            orgDisplayName={ctx.orgDisplayName}
            loginEmail={ctx.email}
            isOwner={ctx.role === "owner"}
            userId={ctx.userId}
            orgId={ctx.orgId}
            avatarUrl={myAvatarUrl}
            onNameSaved={setMyName}
            onAvatarSaved={setMyAvatarUrl}
            onClose={() => setShowMyName(false)}
          />
        </Modal>
      )}
    </div>
  );
}
