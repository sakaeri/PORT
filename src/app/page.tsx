import type { Metadata } from "next";
import { getCustomerContext, getMenus, getMyCompanies, getReferralSignupUrl, getRefundPolicies, getThreadMessages, getVaultItems, hasAuthSession } from "@/lib/data";
import ChatScreen from "@/components/chat/ChatScreen";
import VerifyGate from "@/components/chat/VerifyGate";

export async function generateMetadata(): Promise<Metadata> {
  const ctx = await getCustomerContext();
  return { title: ctx?.orgDisplayName ?? "動画制作の窓口" };
}

export default async function Home() {
  // 初回訪問はまだ匿名セッションが存在しない（proxy.tsはもう自動でサイン
  // インしない）。これは想定内の状態なので、VerifyGateで見えない認証を
  // 済ませてから完了させる。以下の「読み込みに失敗しました」は、認証済み
  // なのにctxが取れない、本当の異常時だけに出す。
  if (!(await hasAuthSession())) {
    return <VerifyGate />;
  }

  const ctx = await getCustomerContext();

  if (!ctx) {
    // 認証は済んでいるのにここに来た＝env設定漏れやDB側のトリガー未適用など
    // の異常。
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

  const [{ messages, hasMoreOlder }, menus, refundPolicies, vault, companies, referralSignupUrl] = await Promise.all([
    getThreadMessages(ctx.threadId),
    getMenus(ctx.orgId),
    getRefundPolicies(ctx.orgId),
    getVaultItems(ctx.customerId),
    ctx.isAnonymous ? Promise.resolve([]) : getMyCompanies(),
    getReferralSignupUrl(ctx.orgId),
  ]);

  return (
    <ChatScreen
      ctx={ctx}
      initialMessages={messages}
      initialHasMoreOlder={hasMoreOlder}
      menus={menus}
      refundPolicies={refundPolicies}
      initialVault={vault}
      companies={companies}
      referralSignupUrl={referralSignupUrl}
    />
  );
}
