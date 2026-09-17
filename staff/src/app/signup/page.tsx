import SignupForm from "@/components/SignupForm";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  return (
    <div style={{ minHeight: "100vh", display: "flex", justifyContent: "center", background: "var(--color-bg)", color: "var(--color-text)", fontFamily: "var(--font-body)", padding: "var(--space-6) var(--space-4)" }}>
      <div style={{ width: "min(560px, 100%)" }}>
        <SignupForm refUserId={ref ?? null} />
      </div>
    </div>
  );
}
