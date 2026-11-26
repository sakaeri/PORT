import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/data";
import { headingWeight } from "@/lib/style";
import PrintButton from "@/components/PrintButton";
import TodayTodoList, { type TodayTodo } from "@/components/TodayTodoList";
import { jstTodayDate } from "@/lib/due-date";

function jstTodayLabel(): string {
  const parts = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric", weekday: "short" }).formatToParts(new Date());
  return parts.map((p) => p.value).join("");
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const card: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 14px",
  borderRadius: "var(--radius-md)",
  background: "var(--color-surface)",
  border: "1px solid var(--color-divider)",
  textDecoration: "none",
  color: "inherit",
};

const sectionHeader: React.CSSProperties = {
  fontFamily: "var(--font-heading)",
  fontWeight: headingWeight,
  fontSize: 12.5,
  color: "var(--color-accent-100)",
  background: "var(--color-accent-900)",
  padding: "6px 12px",
  borderRadius: "var(--radius-md)",
};

type CustomerRef = { id: string; name: string; staff_label: string | null };
function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

// 今日やること：返信待ちのトーク（最後のメッセージが依頼主から）と、トークから手で入れた「やること」。
// 見える範囲は RLS に任せる（担当者は自分の担当窓口のトークだけ）。
export default async function TodayPage() {
  const ctx = await getStaffContext();
  if (!ctx) return null;
  const supabase = await createClient();
  const today = jstTodayDate();

  const [{ data: summaries }, { data: threads }, { data: todoRows }] = await Promise.all([
    supabase.rpc("customer_thread_summaries", { p_org_id: ctx.orgId }),
    supabase.from("threads").select("id, last_msg_at, customers(id, name, staff_label)").eq("org_id", ctx.orgId).eq("kind", "customer"),
    supabase
      .from("todos")
      .select("id, title, due_date, done_at, threads(customers(id, name, staff_label))")
      .eq("org_id", ctx.orgId)
      .is("done_at", null)
      .order("due_date", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  const threadById = new Map((threads ?? []).map((t) => [t.id, { lastMsgAt: t.last_msg_at as string | null, customer: one(t.customers as CustomerRef | CustomerRef[] | null) }]));
  // 返信待ち：最後のメッセージが依頼主から（読んだかどうかに関係なく、まだ返していないもの）。待っている時間が長い順。
  const waiting = (summaries ?? [])
    .filter((s) => !s.archived && s.last_message_sender_role === "client")
    .map((s) => {
      const t = threadById.get(s.thread_id);
      return t?.customer ? { customerId: t.customer.id, name: t.customer.staff_label ?? t.customer.name, lastMsgAt: t.lastMsgAt, unread: s.unread } : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => (a.lastMsgAt ?? "").localeCompare(b.lastMsgAt ?? ""));

  const todos: TodayTodo[] = (todoRows ?? []).map((r) => {
    const customer = one(one(r.threads as { customers: CustomerRef | CustomerRef[] | null } | { customers: CustomerRef | CustomerRef[] | null }[] | null)?.customers);
    return { id: r.id, title: r.title, due_date: r.due_date, done_at: r.done_at, customerId: customer?.id ?? null, customerName: customer ? (customer.staff_label ?? customer.name) : "" };
  });
  const dueTodos = todos.filter((t) => t.due_date <= today);
  const laterTodos = todos.filter((t) => t.due_date > today);

  return (
    <div style={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: 16, maxWidth: 700, width: "100%", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 22 }}>今日やること</div>
          <div style={{ fontSize: 12, color: "var(--color-neutral-500)" }}>{jstTodayLabel()}</div>
        </div>
        <PrintButton />
      </div>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={sectionHeader}>返信待ちのトーク</div>
        {waiting.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "var(--color-neutral-500)" }}>ありません。</div>
        ) : (
          waiting.map((w) => (
            <Link key={w.customerId} href={`/customers/${w.customerId}`} style={card}>
              <span className="print-checkbox">☐</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.name}</span>
              {w.unread && <span style={{ flex: "none", width: 8, height: 8, borderRadius: "50%", background: "var(--color-accent)" }} aria-label="未読" />}
              {w.lastMsgAt && <span style={{ flex: "none", fontSize: 11.5, color: "var(--color-neutral-500)" }}>{fmtTime(w.lastMsgAt)}</span>}
            </Link>
          ))
        )}
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={sectionHeader}>やること（今日まで）</div>
        <TodayTodoList initialTodos={dueTodos} emptyText="ありません。トークの入力欄の横のボタンから追加できます。" />
      </section>

      {laterTodos.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={sectionHeader}>これからのやること</div>
          <TodayTodoList initialTodos={laterTodos} emptyText="" />
        </section>
      )}
    </div>
  );
}
