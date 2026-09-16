"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash, ArrowSquareOut, CaretDown } from "@phosphor-icons/react";
import { headingWeight } from "@/lib/style";
import { switchStaffOrg, createOrgForCurrentUser, removeMyOrgLink } from "@/app/actions";
import { EMPTY_ORG_FORM, OrgAccountFields, slugify, type OrgAccountFormState } from "@/components/OrgAccountFields";
import type { StaffOrgOption } from "@/lib/data";

export default function OrgSwitcher({
  orgId,
  orgDisplayName,
  role,
  orgs,
  unreadCounts,
}: {
  orgId: string;
  orgDisplayName: string;
  role: "owner" | "reception";
  orgs: StaffOrgOption[];
  unreadCounts: Record<string, number>;
}) {
  const router = useRouter();
  const [switching, setSwitching] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [open, setOpen] = useState(false);
  const removableOrgs = orgs.filter((o) => !o.isPrimary && o.role === "owner");
  const hasMenu = orgs.length > 1 || removableOrgs.length > 0 || role === "owner";
  const hasOtherUnread = orgs.some((o) => o.orgId !== orgId && (unreadCounts[o.orgId] ?? 0) > 0);

  async function handleSwitch(newOrgId: string) {
    setOpen(false);
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
    <div style={{ position: "relative", padding: "6px 0 4px" }}>
      <button
        onClick={() => hasMenu && setOpen((v) => !v)}
        disabled={!hasMenu}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          padding: "2px 0",
          cursor: hasMenu ? "pointer" : "default",
          background: "transparent",
          border: "none",
          fontFamily: "var(--font-heading)",
          fontWeight: headingWeight,
          fontSize: 15,
          color: "var(--color-text)",
        }}
      >
        <span style={{ minWidth: 0, flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{orgDisplayName}</span>
        {hasOtherUnread && <span aria-label="他の窓口に未読あり" style={{ flex: "none", width: 7, height: 7, borderRadius: "50%", background: "var(--stb-seal-ink)" }} />}
        {hasMenu && <CaretDown size={12} color="var(--color-neutral-500)" style={{ flex: "none" }} />}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 59 }} />
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              width: 200,
              marginTop: 4,
              zIndex: 60,
              display: "flex",
              flexDirection: "column",
              gap: 2,
              padding: 6,
              borderRadius: "var(--radius-md)",
              background: "var(--color-surface)",
              border: "1px solid var(--color-divider)",
              boxShadow: "var(--shadow-md)",
            }}
          >
            {orgs.length > 1 &&
              orgs.map((o) => {
                const count = unreadCounts[o.orgId] ?? 0;
                return (
                  <button
                    key={o.orgId}
                    onClick={() => handleSwitch(o.orgId)}
                    disabled={switching}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      height: 32,
                      padding: "0 8px",
                      cursor: "pointer",
                      textAlign: "left",
                      fontSize: 12.5,
                      borderRadius: "var(--radius-sm)",
                      border: "none",
                      color: o.orgId === orgId ? "var(--color-accent)" : "var(--color-text)",
                      background: o.orgId === orgId ? "color-mix(in srgb, var(--color-accent) 14%, transparent)" : "transparent",
                    }}
                  >
                    <span style={{ minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.displayName}</span>
                    {count > 0 && (
                      <span style={{ flex: "none", fontSize: 10.5, fontWeight: 700, color: "var(--color-bg)", background: "var(--stb-seal-ink)", borderRadius: 8, padding: "1px 6px" }}>
                        {count > 99 ? "99+" : count}件
                      </span>
                    )}
                  </button>
                );
              })}
            {orgs.length > 1 && (removableOrgs.length > 0 || role === "owner") && (
              <div style={{ height: 1, background: "var(--color-divider)", margin: "3px 2px" }} />
            )}
            {removableOrgs.length > 0 && (
              <button
                onClick={() => {
                  setOpen(false);
                  setShowManage(true);
                }}
                style={{ display: "flex", alignItems: "center", gap: 6, height: 32, padding: "0 8px", cursor: "pointer", textAlign: "left", fontSize: 12.5, color: "var(--color-neutral-400)", background: "transparent", border: "none", borderRadius: "var(--radius-sm)" }}
              >
                窓口を整理
              </button>
            )}
            {role === "owner" && (
              <button
                onClick={() => {
                  setOpen(false);
                  setShowAdd(true);
                }}
                style={{ display: "flex", alignItems: "center", gap: 6, height: 32, padding: "0 8px", cursor: "pointer", textAlign: "left", fontSize: 12.5, color: "var(--color-accent)", background: "transparent", border: "none", borderRadius: "var(--radius-sm)" }}
              >
                <Plus size={12} />
                窓口を追加
              </button>
            )}
          </div>
        </>
      )}

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
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.displayName}</div>
                <div style={{ fontSize: 10.5, color: "var(--color-neutral-500)" }}>{o.slug ? `port.s-stylegolf.com/${o.slug}` : "URL未設定"}</div>
              </div>
              {o.slug && (
                <a href={`https://port.s-stylegolf.com/${o.slug}`} target="_blank" rel="noreferrer" style={{ flex: "none", display: "flex", color: "var(--color-neutral-400)" }} aria-label="サイトを開く">
                  <ArrowSquareOut size={14} />
                </a>
              )}
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
  const [created, setCreated] = useState<{ orgId: string; slug: string } | null>(null);

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
      setCreated(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "作成できませんでした");
    } finally {
      setSaving(false);
    }
  }

  async function finish() {
    if (!created) return;
    // onClose unmounts this dialog, so it must run last — calling it
    // before onCreated (which navigates/refreshes) left this component's
    // own promise chain still running after it was torn down.
    await onCreated(created.orgId);
    onClose();
  }

  return (
    <div
      onClick={created ? undefined : onClose}
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
        {created ? (
          <>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 16 }}>窓口を追加しました</div>
            <div style={{ fontSize: 13, color: "var(--color-accent-100)" }}>
              依頼主用のトーク画面はこちらです：
              <br />
              <a href={`https://port.s-stylegolf.com/${created.slug}`} target="_blank" rel="noreferrer" style={{ color: "var(--color-accent-300)" }}>
                port.s-stylegolf.com/{created.slug}
              </a>
            </div>
            <div style={{ fontSize: 11, color: "var(--color-neutral-500)", lineHeight: 1.6 }}>このURLをホームページやSNSなどに載せて、依頼主に使ってもらってください。</div>
            <button
              onClick={finish}
              style={{ alignSelf: "flex-start", height: 36, padding: "0 14px", cursor: "pointer", fontSize: 12.5, color: "var(--color-accent-100)", background: "var(--color-accent-900)", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)" }}
            >
              この窓口に切り替える
            </button>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}
