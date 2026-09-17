import { getStaffContext } from "@/lib/data";
import { headingWeight } from "@/lib/style";
import BillingSetup from "@/components/BillingSetup";

const PLAN_LABEL: Record<string, string> = {
  trial: "トライアル中",
  active: "契約中",
  past_due: "支払い遅延",
  paused: "一時停止",
  cancelled: "解約済み",
};

export default async function BillingPage() {
  const ctx = await getStaffContext();
  if (!ctx) return null;

  return (
    <div style={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: 20, maxWidth: 560, width: "100%", margin: "0 auto" }}>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 22 }}>お支払い設定</div>
      <div style={{ fontSize: 13, color: "var(--color-neutral-500)" }}>
        現在の状態：{PLAN_LABEL[ctx.planStatus] ?? ctx.planStatus}
        {ctx.planStatus === "trial" && ctx.trialEndsOn && `（トライアル終了日：${ctx.trialEndsOn}）`}
      </div>
      {ctx.planStatus === "active" ? (
        <div style={{ fontSize: 13, color: "var(--color-accent-300)" }}>お支払い設定は完了しています。</div>
      ) : ctx.role === "owner" ? (
        <BillingSetup />
      ) : (
        <div style={{ fontSize: 13, color: "var(--color-neutral-500)" }}>お支払い設定の変更はオーナーのみ行えます。</div>
      )}
    </div>
  );
}
