"use client";

import { useState } from "react";
import { Plus, Trash, PencilSimple, X, Check, Copy } from "@phosphor-icons/react";
import { headingWeight } from "@/lib/style";
import { errorMessage } from "@/lib/errors";
import { createDepartment, renameDepartment, deleteDepartment, updateMenuDepartment, createStaffInvite } from "@/app/actions";
import RoleTags from "@/components/RoleTags";
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
  const canManage = currentRole === "owner" || currentRole === "supervisor";
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
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 15 }}>窓口（部署）</div>
        <div style={{ flex: 1 }} />
        {canManage && !adding && (
          <button onClick={() => setAdding(true)} style={smallBtn}>
            <Plus size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
            窓口を追加
          </button>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--color-neutral-500)", lineHeight: 1.6 }}>
        経理・イベント対応など、業務ごとの窓口を作って受付メニューとスタッフを割り当てられます。
      </div>

      {departments.length === 0 && !adding && <div style={{ fontSize: 12.5, color: "var(--color-neutral-500)" }}>まだ窓口がありません。</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {departments.map((d) => (
          <div key={d.id} style={{ display: "flex", flexDirection: "column", gap: 8, padding: "8px 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-divider)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {editingId === d.id ? (
                <>
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} className="vid-input" style={{ ...input, flex: 1, height: 32 }} />
                  <button onClick={() => rename(d.id)} disabled={busy} style={{ ...smallBtn, height: 32 }}>
                    保存
                  </button>
                  <button onClick={() => setEditingId(null)} style={{ ...smallBtn, height: 32, color: "var(--color-neutral-400)", borderColor: "var(--color-divider)" }}>
                    キャンセル
                  </button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, fontSize: 13 }}>{d.name}</span>
                  {canManage && (
                    <button
                      onClick={() => {
                        setEditingId(d.id);
                        setEditName(d.name);
                      }}
                      aria-label="名前を変更"
                      style={{ flex: "none", width: 30, height: 30, display: "grid", placeItems: "center", cursor: "pointer", color: "var(--color-neutral-500)", background: "transparent", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}
                    >
                      <PencilSimple size={13} />
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={() => remove(d.id)}
                      disabled={busy}
                      aria-label="削除"
                      style={{ flex: "none", width: 30, height: 30, display: "grid", placeItems: "center", cursor: "pointer", color: "var(--color-neutral-500)", background: "transparent", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}
                    >
                      <Trash size={13} />
                    </button>
                  )}
                </>
              )}
            </div>
            {canManage && menus.length > 0 && <DepartmentMenuPicker department={d} menus={menus} setMenus={setMenus} />}
          </div>
        ))}
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

// 窓口ごとの「対応メニュー」選択。メニューは1つの窓口にしか属さないので、
// 別の窓口ですでにONのメニューを押すとこちらに付け替わる。タップ後の状態が
// ひと目でわかるよう、選択中はチェックマーク付きで塗りつぶす。
function DepartmentMenuPicker({
  department,
  menus,
  setMenus,
}: {
  department: Department;
  menus: MenuOption[];
  setMenus: React.Dispatch<React.SetStateAction<MenuOption[]>>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function toggle(menu: MenuOption) {
    if (busyId) return;
    const nextDepartmentId = menu.departmentId === department.id ? null : department.id;
    setBusyId(menu.id);
    setError("");
    const prev = menu.departmentId;
    setMenus((rows) => rows.map((m) => (m.id === menu.id ? { ...m, departmentId: nextDepartmentId } : m)));
    try {
      await updateMenuDepartment(menu.id, nextDepartmentId);
    } catch (e) {
      setMenus((rows) => rows.map((m) => (m.id === menu.id ? { ...m, departmentId: prev } : m)));
      setError(errorMessage(e, "変更できませんでした"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 8, borderTop: "1px solid var(--color-divider)" }}>
      <span style={label}>対応メニュー（このメニューで問い合わせが来ると、この窓口のスタッフが直接やり取りできるようになります。タップで選択・解除、他の窓口の担当だったメニューはこちらに移ります）</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {menus.map((m) => {
          const on = m.departmentId === department.id;
          return (
            <button
              key={m.id}
              onClick={() => toggle(m)}
              disabled={busyId === m.id}
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
      {error && <span style={{ fontSize: 11, color: "var(--color-accent-200)" }}>{error}</span>}
    </div>
  );
}

function InviteLinkCard() {
  const [creating, setCreating] = useState(false);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function create() {
    if (creating) return;
    setError("");
    setCreating(true);
    try {
      const id = await createStaffInvite();
      setCreatedUrl(`${window.location.origin}/join/${id}`);
    } catch (e) {
      setError(errorMessage(e, "作成できませんでした"));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={card}>
      <div style={{ fontSize: 11.5, color: "var(--color-neutral-500)", lineHeight: 1.6 }}>
        リンクを発行してURLを本人に送ってください。ログイン情報は本人が自分で設定します。役職・担当窓口はあとから何度でも変更できるので、まずは一番権限の小さい「スタッフ」として参加してもらい、必要になったらチャット画面から権限を上げてください。窓口が未設定の間は何も見えない状態になるので安全です。参加すると、そのままスタッフ一覧に表示されます。
      </div>
      <RoleTags role="dept_leader" />

      <button onClick={create} disabled={creating} style={{ ...smallBtn, alignSelf: "flex-start" }}>
        {creating ? "作成中…" : "招待リンクを作成"}
      </button>

      {error && <span style={{ fontSize: 11.5, color: "var(--color-accent-200)" }}>{error}</span>}

      {createdUrl && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--color-bg)", border: "1px solid var(--color-accent-800)" }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{createdUrl}</span>
          <button
            onClick={() => navigator.clipboard.writeText(createdUrl)}
            aria-label="コピー"
            style={{ flex: "none", width: 30, height: 30, display: "grid", placeItems: "center", cursor: "pointer", color: "var(--color-accent)", background: "transparent", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)" }}
          >
            <Copy size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
