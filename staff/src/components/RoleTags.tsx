import type { StaffRole } from "@/lib/supabase/types";

type Tag = "閲覧" | "対応" | "設定" | "削除" | "案件作業";

// できることを、色分けした小さなタグで示す。新しい色相を増やさず、既存の
// アクセント（緑）と警告色（seal-ink）の濃淡だけで区別する。
const TAG_STYLE: Record<Tag, React.CSSProperties> = {
  閲覧: { color: "var(--color-neutral-400)", borderColor: "var(--color-divider)", background: "transparent" },
  対応: { color: "var(--color-accent-100)", borderColor: "var(--color-accent)", background: "var(--color-accent-900)" },
  設定: { color: "var(--color-accent)", borderColor: "var(--color-accent)", background: "transparent" },
  削除: { color: "var(--stb-seal-ink)", borderColor: "var(--stb-seal-ink)", background: "transparent" },
  案件作業: { color: "var(--color-accent-100)", borderColor: "var(--color-accent)", background: "var(--color-accent-900)" },
};

const ROLE_PERMISSIONS: Record<StaffRole, { scope: string; tags: Tag[]; note?: string }> = {
  owner: { scope: "全ての窓口", tags: ["閲覧", "対応", "設定", "削除"] },
  dept_manager: { scope: "担当する窓口", tags: ["閲覧", "対応", "削除"] },
  // dept_leader はDB上の名残の値。表示・実際の役割は「スタッフ」
  // （依頼主とは直接やり取りせず、案件の社内トークでの作業だけを行う）。
  dept_leader: { scope: "担当する窓口の案件について", tags: ["案件作業"], note: "依頼主とのやり取りはできません" },
};

function Tag({ tag }: { tag: Tag }) {
  return (
    <span
      style={{
        ...TAG_STYLE[tag],
        display: "inline-flex",
        alignItems: "center",
        height: 20,
        padding: "0 7px",
        fontSize: 10.5,
        borderRadius: 999,
        border: "1px solid",
      }}
    >
      {tag}
    </span>
  );
}

export default function RoleTags({ role }: { role: StaffRole }) {
  const perm = ROLE_PERMISSIONS[role];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <span style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>{perm.scope}の</span>
      {perm.tags.map((t) => (
        <Tag key={t} tag={t} />
      ))}
      <span style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>が可能</span>
      {perm.note && <span style={{ fontSize: 11, color: "var(--stb-seal-ink)" }}>（{perm.note}）</span>}
    </div>
  );
}
