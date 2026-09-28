import { createClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/data";
import { headingWeight } from "@/lib/style";
import { previewMessage, senderPrefix } from "@/lib/message-preview";
import { PHASE_LABEL } from "@/lib/stage";
import CustomersList from "@/components/CustomersList";
import type { RequestPhase } from "@/lib/supabase/types";

const ACTIVE_PHASES: RequestPhase[] = ["draft", "quoted", "preparing", "started"];
const VOID_PHASES: RequestPhase[] = ["cancelled", "declined"];

export default async function CustomersPage() {
  const ctx = await getStaffContext();
  if (!ctx) return null; // layout already handles the access-denied state
  // スタッフ（dept_leader）は依頼主とは直接やり取りしない役割。直接URLで
  // 来ても弾く（RLSでも結局0件になるが、空欄より明示的な方がわかりやすい）。
  if (ctx.role === "dept_leader") return null;

  const supabase = await createClient();
  // 依存のないクエリは並列で投げる。依頼主一覧に必要な「各依頼主の最新メッセージ・未読」は、
  // 案件トークまで巻き込む二重ネストの embed ではなく、確実に正しい専用RPCでまとめて取る。
  const [{ data: customers, error }, { data: summaries, error: summariesError }, { data: departments }, { data: requests }, { data: menus }] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, member_no, active, converted_org_id, converted_org:organizations!customers_converted_org_id_fkey(display_name, slug)")
      .eq("org_id", ctx.orgId)
      .order("created_at", { ascending: false }),
    supabase.rpc("customer_thread_summaries", { p_org_id: ctx.orgId }),
    supabase.from("departments").select("id, name").eq("org_id", ctx.orgId).order("created_at", { ascending: true }),
    supabase
      .from("requests")
      .select("id, customer_id, title, amount, phase, created_at")
      .eq("org_id", ctx.orgId)
      .order("created_at", { ascending: false }),
    supabase.from("menus").select("id, label, department_id").eq("org_id", ctx.orgId).order("sort", { ascending: true }),
  ]);
  if (error) console.error("customers select failed:", error);
  if (summariesError) console.error("customer_thread_summaries failed:", summariesError);

  const summaryByCustomerId = new Map((summaries ?? []).map((s) => [s.customer_id, s]));

  // 依頼主ごとの件数・累計額・進行中案件（一番新しいもの）をまとめる。
  // requests は created_at 降順で取っているので、最初に出てきたものが最新。
  const requestsByCustomerId = new Map<string, NonNullable<typeof requests>>();
  for (const r of requests ?? []) {
    const list = requestsByCustomerId.get(r.customer_id) ?? [];
    list.push(r);
    requestsByCustomerId.set(r.customer_id, list);
  }

  const rows = (customers ?? [])
    .map((c) => {
      const convertedOrg = Array.isArray(c.converted_org) ? c.converted_org[0] : c.converted_org;
      const summary = summaryByCustomerId.get(c.id) ?? null;
      // customer_thread_summaries はスレッドさえあればメッセージが0件でも行を返す
      // （LEFT JOIN LATERAL のため）。last_message_kind が無ければ「やり取りなし」。
      const lastMessagePreview =
        summary && summary.last_message_kind != null
          ? previewMessage(
              { kind: summary.last_message_kind, body: summary.last_message_body, payload: summary.last_message_payload, deleted_at: summary.last_message_deleted_at },
              senderPrefix(summary.last_message_sender_role),
            )
          : null;

      const customerRequests = requestsByCustomerId.get(c.id) ?? [];
      const billable = customerRequests.filter((r) => !VOID_PHASES.includes(r.phase));
      const requestCount = billable.length;
      const lifetimeTotal = billable.reduce((sum, r) => sum + r.amount, 0);
      const activeRequest = customerRequests.find((r) => ACTIVE_PHASES.includes(r.phase)) ?? null;
      const activeCase = activeRequest ? { title: activeRequest.title, phaseLabel: PHASE_LABEL[activeRequest.phase] } : null;

      return {
        id: c.id,
        name: c.name,
        memberNo: c.member_no,
        active: c.active,
        convertedOrg: convertedOrg ? { displayName: convertedOrg.display_name, slug: convertedOrg.slug } : null,
        thread: summary ? { id: summary.thread_id, archived: summary.archived } : null,
        departmentId: summary?.department_id ?? null,
        lastMessagePreview,
        unread: summary?.unread ?? false,
        requestCount,
        lifetimeTotal,
        activeCase,
      };
    })
    // やり取りが一度もない依頼主（ページを開いただけ）は一覧に一切出さない
    .filter((r) => r.lastMessagePreview !== null);

  return (
    <div style={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: 16, maxWidth: 900, width: "100%", margin: "0 auto" }}>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 22 }}>依頼主</div>

      {(error || summariesError) && <div style={{ fontSize: 13, color: "var(--color-accent-200)" }}>読み込みに失敗しました。</div>}

      {!error && !summariesError && rows.length === 0 && (
        <div style={{ fontSize: 13.5, color: "var(--color-neutral-500)", lineHeight: 1.7 }}>
          まだ依頼主がいません。依頼主用のチャット画面にアクセスがあると、ここに一覧が表示されます。
        </div>
      )}

      <CustomersList
        rows={rows}
        isHq={ctx.isHq}
        orgId={ctx.orgId}
        currentRole={ctx.role}
        departments={(departments ?? []).map((d) => ({ id: d.id, name: d.name }))}
        menus={(menus ?? []).map((m) => ({ id: m.id, label: m.label, departmentId: m.department_id }))}
      />
    </div>
  );
}
