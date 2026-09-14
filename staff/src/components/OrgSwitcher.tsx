"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "@phosphor-icons/react";
import { headingWeight } from "@/lib/style";
import { switchStaffOrg, createOrgForCurrentUser } from "@/app/actions";
import { EMPTY_ORG_FORM, OrgAccountFields, slugify, type OrgAccountFormState } from "@/components/OrgAccountFields";
import type { StaffOrgOption } from "@/lib/data";

export default function OrgSwitcher({
  orgId,
  orgDisplayName,
  role,
  orgs,
}: {
  orgId: string;
  orgDisplayName: string;
  role: "owner" | "reception";
  orgs: StaffOrgOption[];
}) {
  const router = useRouter();
  const [switching, setSwitching] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  async function handleSwitch(newOrgId: string) {
    if (newOrgId === orgId || switching) return;
    setSwitching(true);
    try {
      await switchStaffOrg(newOrgId);
      router.push("/customers");
      router.refresh();
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "6px 4px 14px" }}>
      {orgs.length > 1 ? (
        <select
          value={orgId}
          onChange={(e) => handleSwitch(e.target.value)}
          disabled={switching}
          style={{
            width: "100%",
            height: 34,
            padding: "0 8px",
            fontSize: 13,
            fontFamily: "var(--font-heading)",
            fontWeight: headingWeight,
            color: "var(--color-text)",
            background: "var(--color-surface)",
            border: "1px solid var(--color-divider)",
            borderRadius: "var(--radius-md)",
            cursor: "pointer",
          }}
        >
          {orgs.map((o) => (
            <option key={o.orgId} value={o.orgId}>
              {o.displayName}
            </option>
          ))}
        </select>
      ) : (
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{orgDisplayName}</div>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <span style={{ fontSize: 10.5, color: "var(--color-neutral-500)" }}>受付画面</span>
        {role === "owner" && (
          <button
            onClick={() => setShowAdd(true)}
            style={{ display: "flex", alignItems: "center", gap: 3, cursor: "pointer", fontSize: 10.5, color: "var(--color-accent)", background: "transparent", border: "none" }}
          >
            <Plus size={11} />
            窓口を追加
          </button>
        )}
      </div>
      {showAdd && <AddOrgDialog onClose={() => setShowAdd(false)} onCreated={handleSwitch} />}
    </div>
  );
}

function AddOrgDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (orgId: string) => void }) {
  const [form, setForm] = useState<OrgAccountFormState>(EMPTY_ORG_FORM);
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set<K extends keyof OrgAccountFormState>(key: K, value: string) {
    setForm((f) => {
      const next = { ...f, [key]: value };
      if (key === "display_name" && !slugTouched) next.slug = slugify(value);
      if (key === "slug") setSlugTouched(true);
      return next;
    });
  }

  async function submit() {
    if (saving) return;
    setError("");
    setSaving(true);
    try {
      const result = await createOrgForCurrentUser(form);
      // onClose unmounts this dialog, so it must run last — calling it
      // before onCreated (which navigates/refreshes) left this component's
      // own promise chain still running after it was torn down.
      await onCreated(result.orgId);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "作成できませんでした");
      setSaving(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 60, display: "grid", placeItems: "center", padding: 20, background: "color-mix(in srgb, var(--color-bg) 72%, transparent)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(480px, 100%)",
          maxHeight: "85vh",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          padding: 20,
          borderRadius: "var(--radius-lg)",
          background: "var(--color-surface)",
          border: "1px solid var(--color-divider)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 16 }}>新しい窓口を追加</div>
        <div style={{ fontSize: 11.5, color: "var(--color-neutral-500)", lineHeight: 1.6 }}>
          今のログインのまま、新しい窓口（事業者）をもう1つ追加します。新しいログイン情報は作りません。
        </div>
        <OrgAccountFields form={form} set={set} showOwnerLogin={false} />
        {error && <span style={{ fontSize: 11.5, color: "var(--color-accent-200)" }}>{error}</span>}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={submit}
            disabled={saving}
            style={{ height: 36, padding: "0 14px", cursor: "pointer", fontSize: 12.5, color: "var(--color-accent-100)", background: "var(--color-accent-900)", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)" }}
          >
            {saving ? "作成中…" : "この内容で追加"}
          </button>
          <button
            onClick={onClose}
            style={{ height: 36, padding: "0 14px", cursor: "pointer", fontSize: 12.5, color: "var(--color-neutral-400)", background: "transparent", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
