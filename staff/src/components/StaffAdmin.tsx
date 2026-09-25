"use client";

import { useState } from "react";
import { Plus, Trash, PencilSimple, X, Check, Copy, CaretDown, CaretRight } from "@phosphor-icons/react";
import { headingWeight } from "@/lib/style";
import { errorMessage } from "@/lib/errors";
import { createDepartment, renameDepartment, deleteDepartment, updateMenuDepartment, createStaffInvite } from "@/app/actions";
import InfoTooltip from "@/components/InfoTooltip";
import type { StaffRole } from "@/lib/supabase/types";

export interface Department {
  id: string;
  name: string;
}

export interface MenuOption {
  id: string;
  label: string;
  departmentId: string | null;
}

const card: React.CSSProperties = {
  padding: 16,
  borderRadius: "var(--radius-md)",
  background: "var(--color-surface)",
  border: "1px solid var(--color-divider)",
  boxShadow: "var(--shadow-sm)",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};
const smallBtn: React.CSSProperties = {
  height: 34,
  padding: "0 12px",
  cursor: "pointer",
  fontSize: 12.5,
  whiteSpace: "nowrap",
  color: "var(--color-accent)",
  background: "transparent",
  border: "1px solid var(--color-accent)",
  borderRadius: "var(--radius-md)",
};
const primaryBtn: React.CSSProperties = {
  height: 40,
  padding: "0 18px",
  cursor: "pointer",
  fontSize: 13.5,
  color: "var(--color-accent-100)",
  background: "var(--color-accent-900)",
  border: "1px solid var(--color-accent)",
  borderRadius: "var(--radius-md)",
};
const input: React.CSSProperties = {
  width: "100%",
  height: 36,
  padding: "6px 10px",
  fontSize: 13.5,
  color: "var(--color-text)",
  background: "var(--color-bg)",
  border: "1px solid var(--color-divider)",
  borderRadius: "var(--radius-md)",
  outline: "none",
};
const label: React.CSSProperties = { fontSize: 12, color: "var(--color-neutral-500)" };

function ModalHeader({ title, onClose }: { title: string; onClose?: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 22 }}>{title}</div>
      <div style={{ flex: 1 }} />
      {onClose && (
        <button onClick={onClose} aria-label="閉じる" style={{ display: "flex", cursor: "pointer", color: "var(--color-neutral-400)", background: "transparent", border: "none" }}>
          <X size={18} />
        </button>
      )}
    </div>
  );
}

export function DepartmentAdmin({
  currentRole,
  departments: initialDepartments,
  menus: initialMenus,
  onClose,
}: {
  currentRole: StaffRole | "reception";
  departments: Department[];
  menus: MenuOption[];
  onClose?: () => void;
}) {
  const [departments, setDepartments] = useState(initialDepartments);
  const [menus, setMenus] = useState(initialMenus);
  const canManage = currentRole === "owner";
  const canDelete = currentRole === "owner";

  return (
    <div style={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: 20, maxWidth: 600, width: "100%", margin: "0 auto" }}>
      <ModalHeader title="窓口管理" onClose={onClose} />
      <DepartmentsCard departments={departments} setDepartments={setDepartments} menus={menus} setMenus={setMenus} canManage={canManage} canDelete={canDelete} />
    </div>
  );
}

export function InviteAdmin({ onClose }: { onClose?: () => void }) {
  return (
    <div style={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: 20, maxWidth: 520, width: "100%", margin: "0 auto" }}>
      <ModalHeader title="スタッフを招待" onClose={onClose} />
      <InviteLinkCard />
    </div>
  );
}

function DepartmentsCard({
  departments,
  setDepartments,
  menus,
  setMenus,
  canManage,
  canDelete,
}: {
  departments: Department[];
  setDepartments: React.Dispatch<React.SetStateAction<Department[]>>;
  menus: MenuOption[];
  setMenus: React.Dispatch<React.SetStateAction<MenuOption[]>>;
  canManage: boolean;
  canDelete: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function add() {
    if (busy || !newName.trim()) return;
    setBusy(true);
    setError("");
    try {
      const id = await createDepartment(newName);
      setDepartments((d) => [...d, { id, name: newName.trim() }]);
      setNewName("");
      setAdding(false);
    } catch (e) {
      setError(errorMessage(e, "作成できませんでした"));
    } finally {
      setBusy(false);
    }
  }

  async function rename(id: string) {
    if (busy || !editName.trim()) return;
    setBusy(true);
    setError("");
    try {
      await renameDepartment(id, editName);
      setDepartments((d) => d.map((x) => (x.id === id ? { ...x, name: editName.trim() } : x)));
      setEditingId(null);
    } catch (e) {
      setError(errorMessage(e, "変更できませんでした"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (busy || !confirm("この窓口を削除しますか？紐付いているメニュー・スタッフは「窓口未設定」に戻ります。")) return;
    setBusy(true);
    setError("");
    try {
      await deleteDepartment(id);
      setDepartments((d) => d.filter((x) => x.id !== id));
    } catch (e) {
      setError(errorMessage(e, "削除できませんでした"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ fontSize: 11.5, color: "var(--color-neutral-500)", lineHeight: 1.6, flex: 1 }}>
          経理・イベント対応など、業務ごとの窓口を作って受付メニューとスタッフを割り当てられます。
        </div>
        {canManage && !adding && (
          <button onClick={() => setAdding(true)} style={{ ...smallBtn, flex: "none" }}>
            <Plus size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
            窓口を追加
          </button>
        )}
      </div>

      {departments.length === 0 && !adding && <div style={{ fontSize: 12.5, color: "var(--color-neutral-500)" }}>まだ窓口がありません。</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {departments.map((d) =>
          editingId === d.id ? (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-divider)" }}>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} className="vid-input" style={{ ...input, flex: 1, height: 32 }} autoFocus />
              <button onClick={() => rename(d.id)} disabled={busy} style={{ ...smallBtn, height: 32 }}>
                保存
              </button>
              <button onClick={() => setEditingId(null)} style={{ ...smallBtn, height: 32, color: "var(--color-neutral-400)", borderColor: "var(--color-divider)" }}>
                キャンセル
              </button>
            </div>
          ) : (
            <DepartmentRow
              key={d.id}
              department={d}
              menus={menus}
              setMenus={setMenus}
              canManage={canManage}
              canDelete={canDelete}
              busy={busy}
              onEdit={() => {
                setEditingId(d.id);
                setEditName(d.name);
              }}
              onDelete={() => remove(d.id)}
            />
          ),
        )}
      </div>

      {adding && (
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="例：経理関係"
            className="vid-input"
            style={{ ...input, flex: 1 }}
          />
          <button onClick={add} disabled={busy} style={smallBtn}>
            {busy ? "作成中…" : "作成"}
          </button>
          <button onClick={() => setAdding(false)} style={{ ...smallBtn, color: "var(--color-neutral-400)", borderColor: "var(--color-divider)" }}>
            キャンセル
          </button>
        </div>
      )}

      {error && <span style={{ fontSize: 11.5, color: "var(--color-accent-200)" }}>{error}</span>}
    </div>
  );
}

// 窓口ひとつぶんの行。タップで開閉し、中に対応メニューの選択と編集・削除をまとめる。
function DepartmentRow({
  department,
  menus,
  setMenus,
  canManage,
  canDelete,
  busy,
  onEdit,
  onDelete,
}: {
  department: Department;
  menus: MenuOption[];
  setMenus: React.Dispatch<React.SetStateAction<MenuOption[]>>;
  canManage: boolean;
  canDelete: boolean;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busyMenuId, setBusyMenuId] = useState<string | null>(null);
  const [menuError, setMenuError] = useState("");

  async function toggleMenu(menu: MenuOption) {
    if (busyMenuId) return;
    const nextDepartmentId = menu.departmentId === department.id ? null : department.id;
    setBusyMenuId(menu.id);
    setMenuError("");
    const prev = menu.departmentId;
    setMenus((rows) => rows.map((m) => (m.id === menu.id ? { ...m, departmentId: nextDepartmentId } : m)));
    try {
      await updateMenuDepartment(menu.id, nextDepartmentId);
    } catch (e) {
      setMenus((rows) => rows.map((m) => (m.id === menu.id ? { ...m, departmentId: prev } : m)));
      setMenuError(errorMessage(e, "変更できませんでした"));
    } finally {
      setBusyMenuId(null);
    }
  }

  return (
    <div style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--color-divider)", overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ display: "flex", alignItems: "center", width: "100%", gap: 8, height: 40, padding: "0 12px", cursor: "pointer", fontSize: 13, color: "var(--color-text)", background: "transparent", border: "none", textAlign: "left" }}
      >
        <span style={{ flex: 1 }}>{department.name}</span>
        {open ? <CaretDown size={13} color="var(--color-neutral-500)" /> : <CaretRight size={13} color="var(--color-neutral-500)" />}
      </button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 12px 12px", borderTop: "1px solid var(--color-divider)", paddingTop: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {canManage && menus.length > 0 ? (
              <div style={{ display: "flex", alignItems: "center", gap: 5, flex: 1 }}>
                <span style={label}>対応メニュー</span>
                <InfoTooltip text="このメニューで問い合わせが来ると、この窓口のスタッフが直接やり取りできるようになります。タップで選択・解除、他の窓口の担当だったメニューはこちらに移ります。" />
              </div>
            ) : (
              <div style={{ flex: 1 }} />
            )}
            {canManage && (
              <button onClick={onEdit} aria-label="編集" style={{ flex: "none", width: 28, height: 28, display: "grid", placeItems: "center", cursor: "pointer", color: "var(--color-neutral-500)", background: "transparent", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}>
                <PencilSimple size={13} />
              </button>
            )}
            {canDelete && (
              <button onClick={onDelete} disabled={busy} aria-label="削除" style={{ flex: "none", width: 28, height: 28, display: "grid", placeItems: "center", cursor: "pointer", color: "var(--color-neutral-500)", background: "transparent", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}>
                <Trash size={13} />
              </button>
            )}
          </div>
          {canManage && menus.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {menus.map((m) => {
                  const on = m.departmentId === department.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => toggleMenu(m)}
                      disabled={busyMenuId === m.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        height: 28,
                        padding: "0 10px",
                        cursor: "pointer",
                        fontSize: 11.5,
                        color: on ? "var(--color-accent-100)" : "var(--color-neutral-400)",
                        background: on ? "var(--color-accent-900)" : "transparent",
                        border: `1px solid ${on ? "var(--color-accent)" : "var(--color-divider)"}`,
                        borderRadius: "var(--radius-md)",
                      }}
                    >
                      {on && <Check size={11} weight="bold" />}
                      {m.label}
                    </button>
                  );
                })}
              </div>
              {menuError && <span style={{ fontSize: 11, color: "var(--color-accent-200)" }}>{menuError}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InviteLinkCard() {
  const [creating, setCreating] = useState(false);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function create() {
    if (creating) return;
    setError("");
    setCreating(true);
    try {
      const id = await createStaffInvite();
      setCreatedUrl(`${window.location.origin}/join/${id}`);
      setCopied(false);
    } catch (e) {
      setError(errorMessage(e, "作成できませんでした"));
    } finally {
      setCreating(false);
    }
  }

  async function copy(url: string) {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: "var(--radius-md)", background: "var(--color-surface)", border: "1px solid var(--color-divider)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, flex: 1 }}>
          <span style={{ fontSize: 12.5, color: "var(--color-text)" }}>リンクを発行してURLを本人に送ってください。</span>
          <InfoTooltip text="ログイン情報は本人が自分で設定します。役職・担当窓口はあとから何度でも変更できるので、まずは一番権限の小さい「スタッフ」として参加してもらい、必要になったらチャット画面から権限を上げてください。窓口が未設定の間は何も見えない状態になるので安全です。参加すると、そのままスタッフ一覧に表示されます。" />
        </div>
        <button onClick={create} disabled={creating} style={{ ...primaryBtn, flex: "none" }}>
          {creating ? "作成中…" : "招待リンクを作成"}
        </button>
      </div>

      {error && <span style={{ fontSize: 11.5, color: "var(--color-accent-200)" }}>{error}</span>}

      {createdUrl && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--color-bg)", border: "1px solid var(--color-accent-800)" }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{createdUrl}</span>
          <button
            onClick={() => copy(createdUrl)}
            aria-label="コピー"
            style={{
              flex: "none",
              display: "flex",
              alignItems: "center",
              gap: 5,
              height: 30,
              padding: copied ? "0 10px" : 0,
              width: copied ? undefined : 30,
              justifyContent: "center",
              cursor: "pointer",
              fontSize: 11.5,
              color: copied ? "var(--color-accent-100)" : "var(--color-accent)",
              background: copied ? "var(--color-accent-900)" : "transparent",
              border: `1px solid var(--color-accent)`,
              borderRadius: "var(--radius-md)",
            }}
          >
            {copied ? (
              <>
                <Check size={13} weight="bold" />
                コピーしました
              </>
            ) : (
              <Copy size={13} />
            )}
          </button>
        </div>
      )}
    </div>
  );
}
