import { getInvitePreview } from "@/app/actions";
import JoinForm from "@/components/JoinForm";

export default async function JoinPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invite = await getInvitePreview(id);

  return (
    <div style={{ minHeight: "100vh", display: "flex", justifyContent: "center", background: "var(--color-bg)", color: "var(--color-text)", fontFamily: "var(--font-body)", padding: "var(--space-6) var(--space-4)" }}>
      <div style={{ width: "min(420px, 100%)" }}>
        <JoinForm inviteId={id} invite={invite} />
      </div>
    </div>
  );
}
