import type { Metadata } from "next";
import { getCustomerContext, getMenus, getMyCompanies, getRefundPolicies, getThreadMessages, getVaultItems } from "@/lib/data";
import ChatScreen from "@/components/chat/ChatScreen";

export async function generateMetadata(): Promise<Metadata> {
  const ctx = await getCustomerContext();
  return { title: ctx?.orgDisplayName ?? "動画制作の窓口" };
}

export default async function Home() {
  const ctx = await getCustomerContext();

  if (!ctx) {
    // proxy.ts should have signed the visitor in anonymously before this
    // renders; getting here means that failed (e.g. Supabase env vars are
    // missing) or the DB bootstrap trigger hasn't run yet.
    return (
      <main
        style={{
          height: "100vh",
          display: "grid",
          placeItems: "center",
          background: "var(--color-bg)",
          color: "var(--color-text)",
          fontFamily: "var(--font-body)",
          padding: 24,
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 360, fontSize: 13.5, lineHeight: 1.7, opacity: 0.85 }}>
          読み込みに失敗しました。しばらくして再度お試しください。
          <br />
          （開発者向け: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY が設定され、
          supabase/migrations が適用されているか確認してください）
        </div>
      </main>
    );
  }

  const [messages, menus, refundPolicies, vault, companies] = await Promise.all([
    getThreadMessages(ctx.threadId),
    getMenus(ctx.orgId),
    getRefundPolicies(ctx.orgId),
    getVaultItems(ctx.customerId),
    ctx.isAnonymous ? Promise.resolve([]) : getMyCompanies(),
  ]);

  return (
    <ChatScreen
      ctx={ctx}
      initialMessages={messages}
      menus={menus}
      refundPolicies={refundPolicies}
      initialVault={vault}
      companies={companies}
    />
  );
}
