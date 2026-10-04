"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CaretDown } from "@phosphor-icons/react";
import { headingWeight } from "@/lib/style";
import { switchStaffOrg } from "@/app/actions";
import type { StaffOrgOption } from "@/lib/data";

export default function OrgSwitcher({
  orgId,
  orgDisplayName,
  orgs,
  unreadCounts,
}: {
  orgId: string;
  orgDisplayName: string;
  orgs: StaffOrgOption[];
  unreadCounts: Record<string, number>;
}) {
  const router = useRouter();
  const [switching, setSwitching] = useState(false);
  const [open, setOpen] = useState(false);
  const hasMenu = orgs.length > 1;
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
          color: "var(--color-nav-text)",
        }}
      >
        <span style={{ minWidth: 0, flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{orgDisplayName}</span>
        {hasOtherUnread && <span aria-label="他の窓口に未読あり" style={{ flex: "none", width: 7, height: 7, borderRadius: "50%", background: "var(--stb-seal-ink)" }} />}
        {hasMenu && <CaretDown size={12} color="var(--color-nav-text-muted)" style={{ flex: "none" }} />}
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
            {orgs.map((o) => {
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
          </div>
        </>
      )}
    </div>
  );
}
