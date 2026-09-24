"use client";

import { useState } from "react";
import { Plus, Trash, PencilSimple, X } from "@phosphor-icons/react";
import { headingWeight } from "@/lib/style";
import { errorMessage } from "@/lib/errors";
import {
  createDepartment,
  renameDepartment,
  deleteDepartment,
  inviteStaffMember,
  updateStaffMember,
  removeStaffMember,
  updateMenuDepartment,
} from "@/app/actions";
import type { StaffRole } from "@/lib/supabase/types";

export interface Department {
  id: string;
  name: string;
}

export interface StaffRow {
  id: string;
  role: StaffRole;
  departmentId: string | null;
  displayName: string;
  email: string;
}

export interface MenuOption {
  id: string;
  label: string;
  departmentId: string | null;
}

const ROLE_LABEL: Record<StaffRole, string> = {
  owner: "オーナー",
  supervisor: "統括担当",
  dept_manager: "窓口マネージャー",
  dept_leader: "窓口リーダー",
};
const INVITE_ROLES: StaffRole[] = ["supervisor", "dept_manager", "dept_leader"];
const isDeptScoped = (role: StaffRole) => role === "dept_manager" || role === "dept_leader";

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

export default function StaffAdmin({
  currentUserId,
  currentRole,
  departments: initialDepartments,
  staff: initialStaff,
  menus: initialMenus,
  onClose,
}: {
  currentUserId: string;
  currentRole: StaffRole | "reception";
  departments: Department[];
  staff: StaffRow[];
  menus: MenuOption[];
  onClose?: () => void;
}) {
  const [departments, setDepartments] = useState(initialDepartments);
  const [staff, setStaff] = useState(initialStaff);
  const [menus, setMenus] = useState(initialMenus);
  const canManage = currentRole === "owner" || currentRole === "supervisor";
  const canDelete = currentRole === "owner";

  return (
    <div style={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: 20, maxWidth: 780, width: "100%", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 22 }}>窓口・スタッフ管理</div>
        <div style={{ flex: 1 }} />
        {onClose && (
          <button onClick={onClose} aria-label="閉じる" style={{ display: "flex", cursor: "pointer", color: "var(--color-neutral-400)", background: "transparent", border: "none" }}>
            <X size={18} />
          </button>
        )}
      </div>
      <DepartmentsCard departments={departments} setDepartments={setDepartments} menus={menus} setMenus={setMenus} canManage={canManage} canDelete={canDelete} />
      <StaffListCard
        staff={staff}
        setStaff={setStaff}
        departments={departments}
        setDepartments={setDepartments}
        currentUserId={currentUserId}
        canManage={canManage}
        canDelete={canDelete}
      />
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
// 別の窓口ですでにONのメニューを押すとこちらに付け替わる。
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
      <span style={label}>対応メニュー</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {menus.map((m) => {
          const on = m.departmentId === department.id;
          return (
            <button
              key={m.id}
              onClick={() => toggle(m)}
              disabled={busyId === m.id}
              style={{
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
              {m.label}
            </button>
          );
        })}
      </div>
      {error && <span style={{ fontSize: 11, color: "var(--color-accent-200)" }}>{error}</span>}
    </div>
  );
}

// 招待・役職変更フォームの中で使う、窓口の選択欄。「＋新しい窓口を作る」
// を選ぶとその場で窓口名を入力して作成でき、窓口作成→スタッフ招待が
// 別々の2画面にならずに済む。
function DepartmentSelect({
  departments,
  setDepartments,
  value,
  onChange,
}: {
  departments: Department[];
  setDepartments: React.Dispatch<React.SetStateAction<Department[]>>;
  value: string;
  onChange: (departmentId: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirmCreate() {
    if (busy || !newName.trim()) return;
    setBusy(true);
    setError("");
    try {
      const id = await createDepartment(newName);
      setDepartments((d) => [...d, { id, name: newName.trim() }]);
      onChange(id);
      setCreating(false);
      setNewName("");
    } catch (e) {
      setError(errorMessage(e, "作成できませんでした"));
    } finally {
      setBusy(false);
    }
  }

  if (creating) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span style={label}>新しい窓口名</span>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="例：経理関係"
            className="vid-input"
            style={{ ...input, width: 160, height: 34 }}
            autoFocus
          />
          <button type="button" onClick={confirmCreate} disabled={busy} style={{ ...smallBtn, height: 34 }}>
            {busy ? "作成中…" : "作成"}
          </button>
          <button
            type="button"
            onClick={() => {
              setCreating(false);
              setNewName("");
            }}
            style={{ ...smallBtn, height: 34, color: "var(--color-neutral-400)", borderColor: "var(--color-divider)" }}
          >
            キャンセル
          </button>
        </div>
        {error && <span style={{ fontSize: 11, color: "var(--color-accent-200)" }}>{error}</span>}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={label}>担当窓口</span>
      <select
        value={value}
        onChange={(e) => (e.target.value === "__new__" ? setCreating(true) : onChange(e.target.value))}
        className="vid-input"
        style={{ ...input, width: 180, height: 34 }}
      >
        <option value="">窓口を選択</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
        <option value="__new__">＋新しい窓口を作る</option>
      </select>
    </div>
  );
}

function StaffListCard({
  staff,
  setStaff,
  departments,
  setDepartments,
  currentUserId,
  canManage,
  canDelete,
}: {
  staff: StaffRow[];
  setStaff: React.Dispatch<React.SetStateAction<StaffRow[]>>;
  departments: Department[];
  setDepartments: React.Dispatch<React.SetStateAction<Department[]>>;
  currentUserId: string;
  canManage: boolean;
  canDelete: boolean;
}) {
  const [inviting, setInviting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function remove(s: StaffRow) {
    if (removingId || !confirm(`「${s.displayName}」を削除します。ログインもできなくなります。よろしいですか？`)) return;
    setError("");
    setRemovingId(s.id);
    try {
      await removeStaffMember(s.id);
      setStaff((rows) => rows.filter((r) => r.id !== s.id));
    } catch (e) {
      setError(errorMessage(e, "削除できませんでした"));
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 15 }}>スタッフ一覧</div>
        <div style={{ flex: 1 }} />
        {canManage && !inviting && (
          <button onClick={() => setInviting(true)} style={smallBtn}>
            <Plus size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
            スタッフを追加
          </button>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {staff.map((s) => (
          <StaffRowItem
            key={s.id}
            row={s}
            departments={departments}
            setDepartments={setDepartments}
            isSelf={s.id === currentUserId}
            canManage={canManage}
            canDelete={canDelete}
            onSaved={(patch) => setStaff((rows) => rows.map((r) => (r.id === s.id ? { ...r, ...patch } : r)))}
            onRemove={() => remove(s)}
            removing={removingId === s.id}
          />
        ))}
      </div>

      {inviting && (
        <InviteForm
          departments={departments}
          setDepartments={setDepartments}
          onClose={() => setInviting(false)}
          onCreated={(row) => {
            setStaff((rows) => [...rows, row]);
            setInviting(false);
          }}
        />
      )}

      {error && <span style={{ fontSize: 11.5, color: "var(--color-accent-200)" }}>{error}</span>}
    </div>
  );
}

function StaffRowItem({
  row,
  departments,
  setDepartments,
  isSelf,
  canManage,
  canDelete,
  onSaved,
  onRemove,
  removing,
}: {
  row: StaffRow;
  departments: Department[];
  setDepartments: React.Dispatch<React.SetStateAction<Department[]>>;
  isSelf: boolean;
  canManage: boolean;
  canDelete: boolean;
  onSaved: (patch: Partial<StaffRow>) => void;
  onRemove: () => void;
  removing: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState<StaffRole>(row.role);
  const [departmentId, setDepartmentId] = useState(row.departmentId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const canEditThisRow = canManage && row.role !== "owner";

  async function save() {
    if (saving) return;
    if (isDeptScoped(role) && !departmentId) {
      setError("担当する窓口を選んでください");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await updateStaffMember(row.id, role, isDeptScoped(role) ? departmentId : null);
      onSaved({ role, departmentId: isDeptScoped(role) ? departmentId : null });
      setEditing(false);
    } catch (e) {
      setError(errorMessage(e, "変更できませんでした"));
    } finally {
      setSaving(false);
    }
  }

  const departmentName = departments.find((d) => d.id === row.departmentId)?.name;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-divider)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: "1 1 160px" }}>
          <div style={{ fontSize: 13 }}>{row.displayName}{isSelf && "（自分）"}</div>
          <div style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>{row.email}</div>
        </div>
        <div style={{ flex: "none", fontSize: 12, color: "var(--color-neutral-400)" }}>
          {ROLE_LABEL[row.role]}
          {isDeptScoped(row.role) && departmentName ? `（${departmentName}）` : ""}
        </div>
        {canEditThisRow && !editing && (
          <button onClick={() => setEditing(true)} style={{ ...smallBtn, height: 30 }}>
            変更
          </button>
        )}
        {canDelete && !isSelf && row.role !== "owner" && (
          <button
            onClick={onRemove}
            disabled={removing}
            aria-label="削除"
            style={{ flex: "none", width: 30, height: 30, display: "grid", placeItems: "center", cursor: "pointer", color: "var(--color-neutral-500)", background: "transparent", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}
          >
            <Trash size={13} />
          </button>
        )}
      </div>

      {editing && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 8, borderTop: "1px solid var(--color-divider)" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select value={role} onChange={(e) => setRole(e.target.value as StaffRole)} className="vid-input" style={{ ...input, width: 180, height: 34 }}>
              {INVITE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
            {isDeptScoped(role) && (
              <DepartmentSelect departments={departments} setDepartments={setDepartments} value={departmentId} onChange={setDepartmentId} />
            )}
          </div>
          {error && <span style={{ fontSize: 11.5, color: "var(--color-accent-200)" }}>{error}</span>}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={save} disabled={saving} style={{ ...smallBtn, height: 32 }}>
              {saving ? "保存中…" : "保存"}
            </button>
            <button onClick={() => setEditing(false)} style={{ ...smallBtn, height: 32, color: "var(--color-neutral-400)", borderColor: "var(--color-divider)" }}>
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function InviteForm({
  departments,
  setDepartments,
  onClose,
  onCreated,
}: {
  departments: Department[];
  setDepartments: React.Dispatch<React.SetStateAction<Department[]>>;
  onClose: () => void;
  onCreated: (row: StaffRow) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<StaffRole>("dept_leader");
  const [departmentId, setDepartmentId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (saving) return;
    if (isDeptScoped(role) && !departmentId) {
      setError("担当する窓口を選んでください");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await inviteStaffMember({
        email,
        password,
        displayName,
        role,
        departmentId: isDeptScoped(role) ? departmentId : null,
      });
      onCreated({
        id: crypto.randomUUID(), // 一覧の再取得は次回のページ読み込みで正しいIDに揃う
        role,
        departmentId: isDeptScoped(role) ? departmentId : null,
        displayName: displayName.trim() || email.trim(),
        email: email.trim(),
      });
    } catch (e) {
      setError(errorMessage(e, "作成できませんでした"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, borderRadius: "var(--radius-md)", background: "var(--color-bg)", border: "1px solid var(--color-accent-800)" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span style={label}>表示名</span>
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="vid-input" style={input} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span style={label}>ログインメールアドレス</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="vid-input" style={input} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span style={label}>初期パスワード（8文字以上）</span>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="vid-input" style={input} />
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={label}>役職</span>
          <select value={role} onChange={(e) => setRole(e.target.value as StaffRole)} className="vid-input" style={{ ...input, width: 180 }}>
            {INVITE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
        {isDeptScoped(role) && (
          <DepartmentSelect departments={departments} setDepartments={setDepartments} value={departmentId} onChange={setDepartmentId} />
        )}
      </div>
      {error && <span style={{ fontSize: 11.5, color: "var(--color-accent-200)" }}>{error}</span>}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={submit} disabled={saving} style={{ ...smallBtn, height: 36 }}>
          {saving ? "作成中…" : "この内容で追加"}
        </button>
        <button onClick={onClose} disabled={saving} style={{ ...smallBtn, height: 36, color: "var(--color-neutral-400)", borderColor: "var(--color-divider)" }}>
          キャンセル
        </button>
      </div>
    </div>
  );
}
