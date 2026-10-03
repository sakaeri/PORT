"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Headset, Users, ChatsCircle, ChatTeardropText, ChartBar, UsersThree, GearSix, Buildings, Sun, MoonStars, SignOut, List, X, PencilSimple } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import { useIsMobile } from "@/lib/useIsMobile";
import { headingWeight } from "@/lib/style";
import OrgSwitcher from "@/components/OrgSwitcher";
import BillingModal from "@/components/BillingModal";
import Modal from "@/components/Modal";
import AccountSettingsPanel from "@/components/AccountSettingsPanel";
import { signOutStaff } from "@/lib/signOutStaff";
import type { StaffContext } from "@/lib/data";

// dept_leader（表示名「スタッフ」）は依頼主とは直接やり取りしない役割なので、
// 依頼主一覧・売上実績・メニュー管理は隠す。案件トークと、本部との連絡用の
// スタッフ画面はそのまま使える。
const NAV = [
  { href: "/customers", label: "依頼主", icon: Users, hideWhenStaff: true },
  { href: "/cases", label: "案件トーク", icon: ChatsCircle },
  { href: "/staff", label: "スタッフ", icon: UsersThree },
  { href: "/stats", label: "売上・実績", icon: ChartBar, hideWhenStaff: true },
  { href: "/menu", label: "メニュー管理", icon: GearSix, hideWhenStaff: true },
  // 依頼主→本部の直接のご意見・ご要望（担当マネージャーには見えない）。
  { href: "/hq", label: "ご意見・ご要望", icon: ChatTeardropText, ownerOnly: true },
  { href: "/orgs", label: "事業者管理", icon: Buildings, hqOnly: true },
];

export default function Shell({ ctx, children }: { ctx: StaffContext; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [myName, setMyName] = useState(ctx.displayName);
  const [showMyName, setShowMyName] = useState(false);
  // 事業者ごとの未読件数。今開いている事業者だけでなく、リンクしている
  // 他の事業者の分もまとめて持っておき、事業者切替の▼に出す（is_staff_of()の
  // RLSにより、ヘッダーを切り替えなくても他の自分の事業者は読める）。
  const [orgUnreadCounts, setOrgUnreadCounts] = useState<Record<string, number>>({});
  const unreadCount = orgUnreadCounts[ctx.orgId] ?? 0;

  const prevOrgIdRef = useRef(ctx.orgId);
  useEffect(() => {
    // 事業者を切り替えた直後、前の事業者の件数が新しい件数を取得するまで
    // 一瞬残って見えてしまうのを防ぐ（切替時だけ一旦クリアする。同じ事業者内の
    // ページ遷移では毎回リセットしない — ちらつきの原因になるため）。
    if (prevOrgIdRef.current !== ctx.orgId) {
      prevOrgIdRef.current = ctx.orgId;
      setOrgUnreadCounts({});
    }
    const supabase = createClient(ctx.orgId);
    let cancelled = false;
    async function refreshUnread() {
      const results = await Promise.all(
        ctx.orgs.map(async (o) => {
          const { data } = await supabase.rpc("unread_customer_count", { p_org_id: o.orgId });
          return [o.orgId, typeof data === "number" ? data : 0] as const;
        }),
      );
      if (!cancelled) setOrgUnreadCounts(Object.fromEntries(results));
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
  }, [ctx.orgId, ctx.orgs, pathname]);

  // 「案件トーク」ナビの赤丸：未着手（支払い済み・未着手）／着手後で報告の
  // 目安時間まで残り15分以内（経過済みも含む）／キャンセル申請中、のいずれか
  // に当たる案件の件数。is_office()のRLS（case_visible）に任せているので、
  // マネージャーは自分の窓口、スタッフは自分の担当案件だけの件数になる。
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
        .or(`phase.eq.preparing,cancel_requested_at.not.is.null,and(phase.eq.started,due_at.lte.${soon})`);
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

  // 「ご意見・ご要望」ナビの赤丸：依頼主からの未読件数（本部メンバーのみ）。
  const [hqUnreadCount, setHqUnreadCount] = useState(0);
  useEffect(() => {
    if (ctx.role !== "owner") return;
    const supabase = createClient(ctx.orgId);
    let cancelled = false;
    async function refreshHqUnread() {
      const { data } = await supabase.rpc("hq_thread_summaries", { p_org_id: ctx.orgId });
      if (!cancelled) setHqUnreadCount((data ?? []).filter((r: { unread: boolean }) => r.unread).length);
    }
    void refreshHqUnread();
    const channel = supabase
      .channel(`hq-unread-${ctx.orgId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, refreshHqUnread)
      .on("postgres_changes", { event: "*", schema: "public", table: "threads" }, refreshHqUnread)
      .subscribe();
    const interval = setInterval(refreshHqUnread, 30000);
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [ctx.orgId, ctx.role]);

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

  const navItems = NAV.filter(
    (n) => !(n.hqOnly && !ctx.isHq) && !(n.hideWhenStaff && ctx.role === "dept_leader") && !(n.ownerOnly && ctx.role !== "owner"),
  );

  // Date.now() はレンダー中に直接呼べない（純粋関数のルール）ため、
  // マウント後にeffectで計算する。初回描画では null のままバナーを出さない。
  const [daysUntilTrialEnd, setDaysUntilTrialEnd] = useState<number | null>(null);
  useEffect(() => {
    if (!ctx.trialEndsOn) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from a prop-derived, clock-dependent value that can't be computed during render
      setDaysUntilTrialEnd(null);
      return;
    }
    setDaysUntilTrialEnd(Math.ceil((new Date(ctx.trialEndsOn).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
  }, [ctx.trialEndsOn]);
  const trialEndingSoon = !ctx.isHq && ctx.planStatus === "trial" && daysUntilTrialEnd != null && daysUntilTrialEnd >= 0 && daysUntilTrialEnd <= 5;

  const [showBillingModal, setShowBillingModal] = useState(false);
  const bannerBtnStyle: React.CSSProperties = { display: "block", width: "100%", padding: "9px var(--space-4)", cursor: "pointer", fontSize: 12.5, textAlign: "center", border: "none" };
  const billingBanner = ctx.isLocked ? (
    <button onClick={() => setShowBillingModal(true)} style={{ ...bannerBtnStyle, color: "var(--color-bg)", background: "var(--stb-seal-ink)" }}>
      お支払い状況の確認が必要です。新しいお問い合わせ・返信ができません。お支払い方法を登録してください →
    </button>
  ) : trialEndingSoon ? (
    <button onClick={() => setShowBillingModal(true)} style={{ ...bannerBtnStyle, color: "var(--color-accent-100)", background: "var(--color-accent-800)" }}>
      {daysUntilTrialEnd === 0 ? "本日" : `あと${daysUntilTrialEnd}日で`}トライアルが終了します。お支払い方法を登録してください →
    </button>
  ) : null;

  const sidebarBody = (
    <>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "6px 4px 4px" }}>
        <div style={{ width: 30, height: 30, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "var(--radius-md)", border: "1px solid var(--color-accent)" }}>
          <Headset size={16} color="var(--color-accent)" />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <OrgSwitcher orgId={ctx.orgId} orgDisplayName={ctx.orgDisplayName} role={ctx.role} orgs={ctx.orgs} unreadCounts={orgUnreadCounts} />
        </div>
      </div>

      {navItems.map((n) => {
        const active = pathname === n.href || pathname.startsWith(n.href + "/");
        const Icon = n.icon;
        const badgeCount = n.href === "/customers" ? unreadCount : n.href === "/cases" ? attentionCount : n.href === "/hq" ? hqUnreadCount : 0;
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
                  color: "var(--color-bg)",
                  background: "var(--color-accent-200)",
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

      <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingTop: 10, borderTop: "1px solid var(--color-divider)" }}>
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
            color: "var(--color-neutral-500)",
            background: "transparent",
            border: "none",
          }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{myName}</span>
          <PencilSimple size={11} style={{ flex: "none" }} />
        </button>
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
    </>
  );

  if (isMobile) {
    return (
      <div style={{ height: "100dvh", display: "flex", flexDirection: "column", background: "var(--color-bg)", color: "var(--color-text)", fontFamily: "var(--font-body)" }}>
        <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 10, height: 52, padding: "0 var(--space-4)", background: "var(--color-surface)", borderBottom: "1px solid var(--color-divider)" }}>
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="メニューを開く"
            style={{ flex: "none", display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, cursor: "pointer", color: "var(--color-text)", background: "transparent", border: "none" }}
          >
            <List size={22} />
          </button>
          <div style={{ minWidth: 0, flex: 1, fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ctx.orgDisplayName}</div>
          {unreadCount > 0 && (
            <span
              style={{ flex: "none", height: 20, padding: "0 8px", display: "grid", placeItems: "center", fontSize: 10.5, fontWeight: 700, whiteSpace: "nowrap", color: "var(--color-bg)", background: "var(--color-accent-200)", borderRadius: 10 }}
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
                background: "var(--color-surface)",
                borderRight: "1px solid var(--color-divider)",
                overflowY: "auto",
              }}
            >
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label="閉じる"
                style={{ alignSelf: "flex-end", display: "flex", cursor: "pointer", color: "var(--color-neutral-400)", background: "transparent", border: "none", padding: 4, marginBottom: 4 }}
              >
                <X size={18} />
              </button>
              {sidebarBody}
            </aside>
          </>
        )}

        <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {billingBanner}
          <div style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>{children}</div>
        </main>
        {showBillingModal && <BillingModal onClose={() => setShowBillingModal(false)} />}
        {showMyName && (
          <Modal onClose={() => setShowMyName(false)} maxWidth={440}>
            <AccountSettingsPanel
              currentName={myName}
              orgDisplayName={ctx.orgDisplayName}
              loginEmail={ctx.email}
              isOwner={ctx.role === "owner"}
              onNameSaved={setMyName}
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
        {sidebarBody}
      </aside>

      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {billingBanner}
        <div style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>{children}</div>
      </main>
      {showBillingModal && <BillingModal onClose={() => setShowBillingModal(false)} />}
      {showMyName && (
        <Modal onClose={() => setShowMyName(false)} maxWidth={440}>
          <AccountSettingsPanel
            currentName={myName}
            orgDisplayName={ctx.orgDisplayName}
            loginEmail={ctx.email}
            isOwner={ctx.role === "owner"}
            onNameSaved={setMyName}
            onClose={() => setShowMyName(false)}
          />
        </Modal>
      )}
    </div>
  );
}
