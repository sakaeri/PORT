import type { StaffRole } from "@/lib/supabase/types";

type Tag = "閲覧" | "対応" | "設定" | "削除";

// 4種類のできることを、色分けした小さなタグで示す。新しい色相を増やさず、
// 既存のアクセント（緑）と警告色（seal-ink）の濃淡だけで区別する。
const TAG_STYLE: Record<Tag, React.CSSProperties> = {
  閲覧: { color: "var(--color-neutral-400)", borderColor: "var(--color-divider)", background: "transparent" },
  対応: { color: "var(--color-accent-100)", borderColor: "var(--color-accent)", background: "var(--color-accent-900)" },
  設定: { color: "var(--color-accent)", borderColor: "var(--color-accent)", background: "transparent" },
  削除: { color: "var(--stb-seal-ink)", borderColor: "var(--stb-seal-ink)", background: "transparent" },
};

const ROLE_PERMISSIONS: Record<StaffRole, { scope: string; tags: Tag[] }> = {
  owner: { scope: "全ての窓口", tags: ["閲覧", "対応", "設定", "削除"] },
  supervisor: { scope: "全ての窓口", tags: ["閲覧", "対応", "設定"] },
  dept_manager: { scope: "担当する窓口", tags: ["閲覧", "対応", "削除"] },
  dept_leader: { scope: "担当する窓口", tags: ["閲覧", "対応"] },
};

export default function RoleTags({ role }: { role: StaffRole }) {
  const perm = ROLE_PERMISSIONS[role];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <span style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>{perm.scope}の</span>
      {perm.tags.map((t) => (
        <span
          key={t}
          style={{
            ...TAG_STYLE[t],
            display: "inline-flex",
            alignItems: "center",
            height: 20,
            padding: "0 7px",
            fontSize: 10.5,
            borderRadius: 999,
            border: "1px solid",
          }}
        >
          {t}
        </span>
      ))}
      <span style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>が可能</span>
    </div>
  );
}
