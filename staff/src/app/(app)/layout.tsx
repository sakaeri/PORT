import { getStaffContext } from "@/lib/data";
import Shell from "@/components/Shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getStaffContext();

  if (!ctx) {
    // proxy.ts already sends anyone with no session at all to /login, so
    // reaching this with ctx === null means: logged in, but not an
    // owner/reception profile (e.g. a creator-role account — that role
    // belongs to the separate, not-yet-built production-staff app).
    return (
      <div style={{ height: "100vh", display: "grid", placeItems: "center", background: "var(--color-bg)", color: "var(--color-text)", fontFamily: "var(--font-body)", padding: 24, textAlign: "center" }}>
        <div style={{ maxWidth: 360, fontSize: 13.5, lineHeight: 1.7 }}>
          このアカウントには受付画面の権限がありません。
          <br />
          心当たりがない場合は運営にご連絡ください。
        </div>
      </div>
    );
  }

  return <Shell ctx={ctx}>{children}</Shell>;
}

export async function generateMetadata() {
  const ctx = await getStaffContext();
  return { title: ctx ? `${ctx.orgDisplayName} - PORT 受付` : "PORT 受付" };
}
