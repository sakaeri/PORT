"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash } from "@phosphor-icons/react";
import { headingWeight } from "@/lib/style";
import { switchStaffOrg, createOrgForCurrentUser, removeMyOrgLink } from "@/app/actions";
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
  const [showManage, setShowManage] = useState(false);
  const removableOrgs = orgs.filter((o) => !o.isPrimary && o.role === "owner");

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

  function handleRemoved() {
    // removeMyOrgLink already clears the staff_org_id cookie server-side if
    // it pointed at the org just removed, falling back to the primary org.
    router.push("/customers");
    router.refresh();
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10.5, color: "var(--color-neutral-500)" }}>受付画面</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {removableOrgs.length > 0 && (
            <button
              onClick={() => setShowManage(true)}
              style={{ display: "flex", alignItems: "center", gap: 3, cursor: "pointer", fontSize: 10.5, color: "var(--color-neutral-500)", background: "transparent", border: "none" }}
            >
              窓口を整理
            </button>
          )}
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
      </div>
      {showAdd && <AddOrgDialog onClose={() => setShowAdd(false)} onCreated={handleSwitch} />}
      {showManage && <ManageOrgsDialog orgs={removableOrgs} onClose={() => setShowManage(false)} onRemoved={handleRemoved} />}
    </div>
  );
}

function ManageOrgsDialog({ orgs, onClose, onRemoved }: { orgs: StaffOrgOption[]; onClose: () => void; onRemoved: () => void }) {
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [rows, setRows] = useState(orgs);
  const [error, setError] = useState("");

  async function remove(o: StaffOrgOption) {
    if (removingId) return;
    if (!confirm(`「${o.displayName}」を完全に削除します。依頼主・案件・トーク履歴も含めて元に戻せません。よろしいですか？`)) return;
    setError("");
    setRemovingId(o.orgId);
    try {
      await removeMyOrgLink(o.orgId);
      setRows((r) => r.filter((x) => x.orgId !== o.orgId));
      onRemoved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除できませんでした");
    } finally {
      setRemovingId(null);
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
          width: "min(420px, 100%)",
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
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 16 }}>窓口を整理</div>
        <div style={{ fontSize: 11.5, color: "var(--color-neutral-500)", lineHeight: 1.6 }}>
          自分のログインに追加した窓口を削除します。削除すると依頼主・案件・トーク履歴も含めて元に戻せません。
        </div>
        {rows.length === 0 && <div style={{ fontSize: 12.5, color: "var(--color-neutral-500)" }}>削除できる窓口はありません。</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((o) => (
            <div key={o.orgId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--color-bg)", border: "1px solid var(--color-divider)" }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.displayName}</div>
              <button
                onClick={() => remove(o)}
                disabled={removingId === o.orgId}
                aria-label="削除"
                style={{ flex: "none", width: 28, height: 28, display: "grid", placeItems: "center", cursor: "pointer", color: "var(--color-neutral-500)", background: "transparent", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}
              >
                <Trash size={13} />
              </button>
            </div>
          ))}
        </div>
        {error && <span style={{ fontSize: 11.5, color: "var(--color-accent-200)" }}>{error}</span>}
        <button
          onClick={onClose}
          style={{ alignSelf: "flex-start", height: 34, padding: "0 14px", cursor: "pointer", fontSize: 12.5, color: "var(--color-neutral-400)", background: "transparent", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}
        >
          閉じる
        </button>
      </div>
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
