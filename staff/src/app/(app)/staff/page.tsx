import { headingWeight } from "@/lib/style";

export default function StaffPage() {
  return (
    <div style={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 22 }}>スタッフ</div>
      <div style={{ fontSize: 13.5, color: "var(--color-neutral-500)", lineHeight: 1.7 }}>準備中です。次のフェーズで実装します。</div>
    </div>
  );
}
