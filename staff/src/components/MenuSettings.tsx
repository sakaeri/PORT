"use client";

import { useState } from "react";
import {
  Trash,
  Plus,
  CaretDown,
  CaretRight,
  Gift,
  Wrench,
  Toolbox,
  Hammer,
  HardHat,
  Truck,
  Package,
  Car,
  Broom,
  PaintBrush,
  Calculator,
  CurrencyCircleDollar,
  ClipboardText,
  FileText,
  Calendar,
  ChatCircleText,
  Phone,
  EnvelopeSimple,
  Megaphone,
  Camera,
  Scissors,
  ForkKnife,
  GraduationCap,
  FirstAidKit,
  Heartbeat,
  ShieldCheck,
  Star,
  Tag,
  House,
  MapPin,
  ShoppingCart,
  Users,
  Handshake,
  ArrowsClockwise,
  Scales,
  type Icon,
} from "@phosphor-icons/react";
import { headingWeight } from "@/lib/style";
import { useIsMobile } from "@/lib/useIsMobile";
import InfoTooltip from "@/components/InfoTooltip";
import Modal from "@/components/Modal";
import {
  createMenu,
  updateMenu,
  deleteMenu,
  addMenuQuestion,
  updateMenuQuestion,
  deleteMenuQuestion,
  createIntakeForm,
  updateIntakeForm,
  deleteIntakeForm,
  addIntakeField,
  updateIntakeField,
  deleteIntakeField,
  createReportFieldPreset,
  updateReportFieldPreset,
  deleteReportFieldPreset,
} from "@/app/actions";

interface Question {
  id: string;
  menu_id: string;
  label: string;
  sort: number;
}

interface Menu {
  id: string;
  org_id: string;
  label: string;
  note: string | null;
  icon: string | null;
  price: number | null;
  lead_hours: number;
  active: boolean;
  department_id: string | null;
  menu_questions: Question[];
  report_field_presets: ReportFieldPreset[];
}

// 依頼主側の「メニューから問い合わせる」で ph.ph-xxx のアイコンフォントとして
// そのまま表示される（src/components/chat/Dialogs.tsx の MenuSheet）。
// 画像アップロードではなくこの固定セットから選ぶ形にすることで、追加の
// 保存先や表示コストなしにアイコンを付けられるようにする。
const MENU_ICON_OPTIONS: { name: string; label: string }[] = [
  { name: "wrench", label: "修理" },
  { name: "toolbox", label: "道具" },
  { name: "hammer", label: "施工" },
  { name: "hard-hat", label: "工事" },
  { name: "truck", label: "配送" },
  { name: "package", label: "荷物" },
  { name: "car", label: "車" },
  { name: "broom", label: "清掃" },
  { name: "paint-brush", label: "塗装" },
  { name: "calculator", label: "経理" },
  { name: "currency-circle-dollar", label: "料金" },
  { name: "clipboard-text", label: "手続き" },
  { name: "file-text", label: "書類" },
  { name: "calendar", label: "予約" },
  { name: "chat-circle-text", label: "相談" },
  { name: "phone", label: "電話" },
  { name: "envelope-simple", label: "連絡" },
  { name: "megaphone", label: "案内" },
  { name: "camera", label: "撮影" },
  { name: "scissors", label: "美容" },
  { name: "fork-knife", label: "飲食" },
  { name: "graduation-cap", label: "講習" },
  { name: "first-aid-kit", label: "応急" },
  { name: "heartbeat", label: "健康" },
  { name: "shield-check", label: "安全" },
  { name: "gift", label: "特典" },
  { name: "star", label: "おすすめ" },
  { name: "tag", label: "割引" },
  { name: "house", label: "住宅" },
  { name: "map-pin", label: "現地" },
  { name: "shopping-cart", label: "購入" },
  { name: "users", label: "人員" },
  { name: "handshake", label: "契約" },
  { name: "arrows-clockwise", label: "修正" },
  { name: "scales", label: "法務" },
];

const MENU_ICON_COMPONENTS: Record<string, Icon> = {
  wrench: Wrench,
  toolbox: Toolbox,
  hammer: Hammer,
  "hard-hat": HardHat,
  truck: Truck,
  package: Package,
  car: Car,
  broom: Broom,
  "paint-brush": PaintBrush,
  calculator: Calculator,
  "currency-circle-dollar": CurrencyCircleDollar,
  "clipboard-text": ClipboardText,
  "file-text": FileText,
  calendar: Calendar,
  "chat-circle-text": ChatCircleText,
  phone: Phone,
  "envelope-simple": EnvelopeSimple,
  megaphone: Megaphone,
  camera: Camera,
  scissors: Scissors,
  "fork-knife": ForkKnife,
  "graduation-cap": GraduationCap,
  "first-aid-kit": FirstAidKit,
  heartbeat: Heartbeat,
  "shield-check": ShieldCheck,
  gift: Gift,
  star: Star,
  tag: Tag,
  house: House,
  "map-pin": MapPin,
  "shopping-cart": ShoppingCart,
  users: Users,
  handshake: Handshake,
  "arrows-clockwise": ArrowsClockwise,
  scales: Scales,
};

// menus.icon はスタッフ側では上の名前(例:"wrench")だけを持ち、依頼主側の
// アイコンフォント（@phosphor-icons/web）のクラス名 "ph ph-wrench" に変換して保存する。
function menuIconName(iconClass: string | null): string | null {
  if (!iconClass) return null;
  const parts = iconClass.trim().split(/\s+/);
  const withPrefix = parts.find((p) => p.startsWith("ph-"));
  return withPrefix ? withPrefix.slice(3) : null;
}
function menuIconClass(name: string | null): string | null {
  return name ? `ph ph-${name}` : null;
}

interface IntakeField {
  id: string;
  form_id: string;
  key: string;
  label: string;
  kind: string;
  sort: number;
}

interface ReportFieldPreset {
  id: string;
  menu_id: string;
  label: string;
  sort: number;
}

interface IntakeForm {
  id: string;
  org_id: string;
  label: string;
  note: string | null;
  sort: number;
  intake_fields: IntakeField[];
}

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
  height: 32,
  padding: "0 12px",
  cursor: "pointer",
  fontSize: 12,
  whiteSpace: "nowrap",
  color: "var(--color-accent)",
  background: "transparent",
  border: "1px solid var(--color-accent)",
  borderRadius: "var(--radius-md)",
};

export default function MenuSettings({
  orgId,
  initialMenus,
  initialTemplates,
  canEdit,
}: {
  orgId: string;
  initialMenus: Menu[];
  initialTemplates: IntakeForm[];
  // 受付メニューはFC展開でのブランド・料金統一のため本部専用で、
  // 本部以外のマネージャーには閲覧のみで見せる。返信テンプレは常に編集可。
  canEdit: boolean;
}) {
  const [tab, setTab] = useState<TabKey>("menu");
  const isMobile = useIsMobile();

  return (
    <div style={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: 20, maxWidth: 900, width: "100%", margin: "0 auto" }}>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 22 }}>メニュー管理</div>

      {isMobile ? (
        <div style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--color-divider)", paddingBottom: 2 }}>
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: 34,
                  padding: "0 2px",
                  cursor: "pointer",
                  fontSize: 10.5,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: active ? "var(--color-bg)" : "var(--color-neutral-400)",
                  background: active ? "var(--color-accent)" : "transparent",
                  border: "1px solid",
                  borderColor: active ? "var(--color-accent)" : "transparent",
                  borderRadius: "var(--radius-md)",
                }}
              >
                {t.mobileLabel}
              </button>
            );
          })}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", borderBottom: "1px solid var(--color-divider)", paddingBottom: 2 }}>
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  flex: "none",
                  height: 34,
                  padding: "0 10px",
                  cursor: "pointer",
                  fontSize: 12.5,
                  whiteSpace: "nowrap",
                  color: active ? "var(--color-bg)" : "var(--color-neutral-400)",
                  background: active ? "var(--color-accent)" : "transparent",
                  border: "1px solid",
                  borderColor: active ? "var(--color-accent)" : "transparent",
                  borderRadius: "var(--radius-md)",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      )}

      {tab === "menu" && <MenuListCard orgId={orgId} initialMenus={initialMenus} canEdit={canEdit} />}
      {tab === "templates" && <TemplatesCard orgId={orgId} initialTemplates={initialTemplates} />}
    </div>
  );
}

type TabKey = "menu" | "templates";

const TABS: { key: TabKey; label: string; mobileLabel: string }[] = [
  { key: "menu", label: "受付メニュー", mobileLabel: "メニュー" },
  { key: "templates", label: "返信テンプレ", mobileLabel: "テンプレ" },
];

function MenuListCard({ orgId, initialMenus, canEdit }: { orgId: string; initialMenus: Menu[]; canEdit: boolean }) {
  const [menus, setMenus] = useState(initialMenus);
  const [openId, setOpenId] = useState<string | null>(null);
  const [questionsMenuId, setQuestionsMenuId] = useState<string | null>(null);
  const [presetsMenuId, setPresetsMenuId] = useState<string | null>(null);

  async function handleAdd() {
    const id = await createMenu(orgId);
    setMenus((m) => [...m, { id, org_id: orgId, label: "新しいメニュー", note: null, icon: null, price: null, lead_hours: 24, active: true, department_id: null, menu_questions: [], report_field_presets: [] }]);
    setOpenId(id);
  }

  async function handleDelete(id: string) {
    if (!confirm("このメニューを削除しますか？")) return;
    await deleteMenu(id);
    setMenus((m) => m.filter((x) => x.id !== id));
  }

  function patchLocal(id: string, patch: Partial<Menu>) {
    setMenus((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function commit(m: Menu) {
    await updateMenu(m.id, { label: m.label, note: m.note ?? "", price: m.price, lead_hours: m.lead_hours, active: m.active, icon: m.icon });
  }

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 15 }}>受付メニュー</div>
        <InfoTooltip text="依頼主が相談するときに選ぶ一覧です。金額・作業時間の目安・はじめの質問をここで決めます（金額は依頼主には表示されません）。金額を空欄にすると『相談のみ』の項目になり、見積もり作成時の選択肢には出てきません。どの担当（窓口）が対応するかは、依頼主一覧の画面からその場で割り当てます。FC展開でのブランド・料金統一のため、編集は本部限定です" />
        <div style={{ flex: 1 }} />
        {canEdit && (
          <button onClick={handleAdd} style={smallBtn}>
            <Plus size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
            メニューを追加
          </button>
        )}
      </div>
      {!canEdit && <div style={{ fontSize: 11.5, color: "var(--color-neutral-500)" }}>メニューの編集は本部のみ行えます。</div>}

      {menus.length === 0 && <div style={{ fontSize: 12.5, color: "var(--color-neutral-500)" }}>まだメニューがありません。</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {menus.map((m) => {
          const open = openId === m.id;
          const selectedIconName = menuIconName(m.icon);
          const SelectedIcon = selectedIconName ? MENU_ICON_COMPONENTS[selectedIconName] : null;
          return (
            <div key={m.id} style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--color-divider)", overflow: "hidden" }}>
              <button
                onClick={() => setOpenId(open ? null : m.id)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", cursor: "pointer", background: "var(--color-bg)", border: "none", textAlign: "left", color: "var(--color-text)" }}
              >
                {open ? <CaretDown size={13} /> : <CaretRight size={13} />}
                {SelectedIcon && <SelectedIcon size={15} color="var(--color-accent)" style={{ flex: "none" }} />}
                <span style={{ flex: 1, fontSize: 13.5, opacity: m.active ? 1 : 0.5 }}>{m.label || "（無題）"}</span>
                <span style={{ fontSize: 11.5, color: "var(--color-neutral-500)" }}>{m.price != null ? `¥${m.price.toLocaleString("ja-JP")}` : "相談のみ"}</span>
              </button>
              {open && (
                <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      <span style={label}>メニュー名</span>
                      <input value={m.label} onChange={(e) => patchLocal(m.id, { label: e.target.value })} onBlur={() => commit(m)} disabled={!canEdit} className="vid-input" style={input} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      <span style={label}>請求金額（円・空欄なら相談項目として扱う）</span>
                      <input
                        type="number"
                        value={m.price ?? ""}
                        placeholder="未設定"
                        onChange={(e) => patchLocal(m.id, { price: e.target.value === "" ? null : Number(e.target.value) })}
                        onBlur={() => commit(m)}
                        disabled={!canEdit}
                        className="vid-input"
                        style={input}
                      />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      <span style={label}>作業時間の目安（時間）</span>
                      <input
                        type="number"
                        value={m.lead_hours}
                        onChange={(e) => patchLocal(m.id, { lead_hours: Number(e.target.value) })}
                        onBlur={() => commit(m)}
                        disabled={!canEdit}
                        className="vid-input"
                        style={input}
                      />
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <span style={label}>詳細内容</span>
                    <input value={m.note ?? ""} onChange={(e) => patchLocal(m.id, { note: e.target.value })} onBlur={() => commit(m)} disabled={!canEdit} className="vid-input" style={input} />
                  </div>

                  {canEdit && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      <span style={label}>アイコン（依頼主のメニュー一覧に表示されます）</span>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => {
                            patchLocal(m.id, { icon: null });
                            commit({ ...m, icon: null });
                          }}
                          title="アイコンなし"
                          style={{
                            width: 32,
                            height: 32,
                            display: "grid",
                            placeItems: "center",
                            cursor: "pointer",
                            fontSize: 10,
                            color: selectedIconName === null ? "var(--color-accent)" : "var(--color-neutral-500)",
                            background: selectedIconName === null ? "var(--color-accent-900)" : "transparent",
                            border: `1px solid ${selectedIconName === null ? "var(--color-accent)" : "var(--color-divider)"}`,
                            borderRadius: "var(--radius-md)",
                          }}
                        >
                          なし
                        </button>
                        {MENU_ICON_OPTIONS.map((opt) => {
                          const OptIcon = MENU_ICON_COMPONENTS[opt.name];
                          const on = selectedIconName === opt.name;
                          return (
                            <button
                              key={opt.name}
                              type="button"
                              onClick={() => {
                                const iconClass = menuIconClass(opt.name);
                                patchLocal(m.id, { icon: iconClass });
                                commit({ ...m, icon: iconClass });
                              }}
                              title={opt.label}
                              style={{
                                width: 32,
                                height: 32,
                                display: "grid",
                                placeItems: "center",
                                cursor: "pointer",
                                color: on ? "var(--color-accent-100)" : "var(--color-neutral-500)",
                                background: on ? "var(--color-accent-900)" : "transparent",
                                border: `1px solid ${on ? "var(--color-accent)" : "var(--color-divider)"}`,
                                borderRadius: "var(--radius-md)",
                              }}
                            >
                              <OptIcon size={16} />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", paddingTop: 6, borderTop: "1px solid var(--color-divider)" }}>
                    <button onClick={() => setQuestionsMenuId(m.id)} style={smallBtn}>
                      はじめの質問　{m.menu_questions.length}問
                    </button>
                    <button onClick={() => setPresetsMenuId(m.id)} style={smallBtn}>
                      報告書の定型項目　{m.report_field_presets.length}件
                    </button>
                    <div style={{ flex: 1 }} />
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-neutral-400)" }}>
                      <input type="checkbox" checked={m.active} onChange={(e) => { patchLocal(m.id, { active: e.target.checked }); commit({ ...m, active: e.target.checked }); }} disabled={!canEdit} />
                      表示する
                    </label>
                    {canEdit && (
                      <button onClick={() => handleDelete(m.id)} style={{ ...smallBtn, color: "var(--color-accent-200)", borderColor: "var(--color-divider)" }}>
                        <Trash size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
                        削除
                      </button>
                    )}
                  </div>
                </div>
              )}
              {questionsMenuId === m.id && (
                <Modal onClose={() => setQuestionsMenuId(null)} maxWidth={480}>
                  <QuestionsEditor menuId={m.id} questions={m.menu_questions} onChange={(qs) => patchLocal(m.id, { menu_questions: qs })} canEdit={canEdit} />
                </Modal>
              )}
              {presetsMenuId === m.id && (
                <Modal onClose={() => setPresetsMenuId(null)} maxWidth={480}>
                  <MenuReportFieldPresetsEditor menuId={m.id} presets={m.report_field_presets} onChange={(p) => patchLocal(m.id, { report_field_presets: p })} canEdit={canEdit} />
                </Modal>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function QuestionsEditor({ menuId, questions, onChange, canEdit }: { menuId: string; questions: Question[]; onChange: (q: Question[]) => void; canEdit: boolean }) {
  async function add() {
    const id = await addMenuQuestion(menuId, "", questions.length);
    onChange([...questions, { id, menu_id: menuId, label: "", sort: questions.length }]);
  }
  function patch(id: string, val: string) {
    onChange(questions.map((q) => (q.id === id ? { ...q, label: val } : q)));
  }
  async function commit(id: string, val: string) {
    await updateMenuQuestion(id, val);
  }
  async function remove(id: string) {
    await deleteMenuQuestion(id);
    onChange(questions.filter((q) => q.id !== id));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={label}>はじめの質問</span>
      {questions.map((q) => (
        <div key={q.id} style={{ display: "flex", gap: 8 }}>
          <input
            value={q.label}
            onChange={(e) => patch(q.id, e.target.value)}
            onBlur={() => commit(q.id, q.label)}
            disabled={!canEdit}
            className="vid-input"
            style={{ ...input, flex: 1, height: 32 }}
          />
          {canEdit && (
            <button onClick={() => remove(q.id)} aria-label="削除" style={{ flex: "none", width: 32, height: 32, cursor: "pointer", color: "var(--color-neutral-500)", background: "transparent", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}>
              <Trash size={13} />
            </button>
          )}
        </div>
      ))}
      {canEdit && (
        <button onClick={add} style={{ alignSelf: "flex-start", ...smallBtn, height: 30 }}>
          ＋質問を追加
        </button>
      )}
    </div>
  );
}

function TemplatesCard({ orgId, initialTemplates }: { orgId: string; initialTemplates: IntakeForm[] }) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [openId, setOpenId] = useState<string | null>(null);

  async function handleAdd() {
    const id = await createIntakeForm(orgId);
    setTemplates((t) => [...t, { id, org_id: orgId, label: "新しいテンプレ", note: null, sort: 999, intake_fields: [] }]);
    setOpenId(id);
  }

  async function handleDelete(id: string) {
    if (!confirm("このテンプレを削除しますか？")) return;
    await deleteIntakeForm(id);
    setTemplates((t) => t.filter((x) => x.id !== id));
  }

  function patchLocal(id: string, patch: Partial<IntakeForm>) {
    setTemplates((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function commit(t: IntakeForm) {
    await updateIntakeForm(t.id, { label: t.label, note: t.note ?? "" });
  }

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 15 }}>返信テンプレ</div>
        <InfoTooltip text="受付がトークからワンタップで送る定型の返信です。項目を付けると依頼主が入力するフォームになります。" />
        <div style={{ flex: 1 }} />
        <button onClick={handleAdd} style={smallBtn}>
          <Plus size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
          テンプレを追加
        </button>
      </div>

      {templates.length === 0 && <div style={{ fontSize: 12.5, color: "var(--color-neutral-500)" }}>まだテンプレがありません。</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {templates.map((t) => {
          const open = openId === t.id;
          return (
            <div key={t.id} style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--color-divider)", overflow: "hidden" }}>
              <button
                onClick={() => setOpenId(open ? null : t.id)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", cursor: "pointer", background: "var(--color-bg)", border: "none", textAlign: "left", color: "var(--color-text)" }}
              >
                {open ? <CaretDown size={13} /> : <CaretRight size={13} />}
                <span style={{ flex: 1, fontSize: 13.5 }}>{t.label || "（無題）"}</span>
                <span style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>{t.intake_fields.length > 0 ? `項目${t.intake_fields.length}件` : "定型文のみ"}</span>
              </button>
              {open && (
                <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <span style={label}>テンプレ名</span>
                    <input value={t.label} onChange={(e) => patchLocal(t.id, { label: e.target.value })} onBlur={() => commit(t)} className="vid-input" style={input} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <span style={label}>定型文の本文（項目がなければそのまま送信されます）</span>
                    <textarea
                      value={t.note ?? ""}
                      onChange={(e) => patchLocal(t.id, { note: e.target.value })}
                      onBlur={() => commit(t)}
                      rows={3}
                      className="vid-input"
                      style={{ ...input, height: "auto", padding: "8px 10px", resize: "vertical" }}
                    />
                  </div>

                  <TemplateFieldsEditor formId={t.id} fields={t.intake_fields} onChange={(fields) => patchLocal(t.id, { intake_fields: fields })} />

                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button onClick={() => handleDelete(t.id)} style={{ ...smallBtn, color: "var(--color-accent-200)", borderColor: "var(--color-divider)" }}>
                      <Trash size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
                      削除
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MenuReportFieldPresetsEditor({
  menuId,
  presets,
  onChange,
  canEdit,
}: {
  menuId: string;
  presets: ReportFieldPreset[];
  onChange: (p: ReportFieldPreset[]) => void;
  canEdit: boolean;
}) {
  async function add() {
    const id = await createReportFieldPreset(menuId, "", presets.length);
    onChange([...presets, { id, menu_id: menuId, label: "", sort: presets.length }]);
  }
  function patch(id: string, val: string) {
    onChange(presets.map((p) => (p.id === id ? { ...p, label: val } : p)));
  }
  async function commit(id: string, val: string) {
    if (!val.trim()) return;
    await updateReportFieldPreset(id, val);
  }
  async function remove(id: string) {
    await deleteReportFieldPreset(id);
    onChange(presets.filter((p) => p.id !== id));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={label}>報告書の定型項目</span>
        <InfoTooltip text="このメニューの完了報告を書くとき、スタッフがワンタップで項目を追加できる定型の項目名です（自由な項目追加も別途できます）。" />
      </div>
      {presets.map((p) => (
        <div key={p.id} style={{ display: "flex", gap: 8 }}>
          <input
            value={p.label}
            onChange={(e) => patch(p.id, e.target.value)}
            onBlur={() => commit(p.id, p.label)}
            disabled={!canEdit}
            className="vid-input"
            style={{ ...input, flex: 1, height: 32 }}
          />
          {canEdit && (
            <button onClick={() => remove(p.id)} aria-label="削除" style={{ flex: "none", width: 32, height: 32, cursor: "pointer", color: "var(--color-neutral-500)", background: "transparent", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}>
              <Trash size={13} />
            </button>
          )}
        </div>
      ))}
      {canEdit && (
        <button onClick={add} style={{ alignSelf: "flex-start", ...smallBtn, height: 30 }}>
          ＋項目を追加
        </button>
      )}
    </div>
  );
}

const FIELD_KINDS = [
  { value: "text", label: "テキスト" },
  { value: "tel", label: "電話番号" },
  { value: "email", label: "メールアドレス" },
  { value: "date", label: "日付" },
  { value: "textarea", label: "長文" },
];

function TemplateFieldsEditor({ formId, fields, onChange }: { formId: string; fields: IntakeField[]; onChange: (f: IntakeField[]) => void }) {
  async function add() {
    const created = await addIntakeField(formId, fields.length);
    onChange([...fields, { id: created.id, form_id: formId, key: created.key, label: "", kind: "text", sort: fields.length }]);
  }
  function patch(id: string, p: Partial<IntakeField>) {
    onChange(fields.map((f) => (f.id === id ? { ...f, ...p } : f)));
  }
  async function commit(f: IntakeField) {
    await updateIntakeField(f.id, { label: f.label, kind: f.kind });
  }
  async function remove(id: string) {
    await deleteIntakeField(id);
    onChange(fields.filter((f) => f.id !== id));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={label}>入力してもらう項目（空なら定型文をそのまま送るだけになります）</span>
      {fields.map((f) => (
        <div key={f.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 120px 32px", gap: 8 }}>
          <input
            value={f.label}
            onChange={(e) => patch(f.id, { label: e.target.value })}
            onBlur={() => commit(f)}
            placeholder="例：ご希望の日時"
            className="vid-input"
            style={{ ...input, height: 32 }}
          />
          <select
            value={f.kind}
            onChange={(e) => { patch(f.id, { kind: e.target.value }); commit({ ...f, kind: e.target.value }); }}
            className="vid-input"
            style={{ ...input, height: 32 }}
          >
            {FIELD_KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
          <button onClick={() => remove(f.id)} aria-label="削除" style={{ width: 32, height: 32, cursor: "pointer", color: "var(--color-neutral-500)", background: "transparent", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}>
            <Trash size={13} />
          </button>
        </div>
      ))}
      <button onClick={add} style={{ alignSelf: "flex-start", ...smallBtn, height: 30 }}>
        ＋項目を追加
      </button>
    </div>
  );
}

