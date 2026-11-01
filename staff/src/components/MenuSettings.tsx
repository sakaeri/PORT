"use client";

import { useState } from "react";
import {
  Trash,
  Plus,
  X,
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
import InquiryDesksCard from "@/components/InquiryDesksCard";
import ReferralSourcesCard, { type ReferralSourceWithCustomers } from "@/components/ReferralSourcesCard";
import type { InquiryDesk } from "@/app/actions";
import Modal from "@/components/Modal";
import {
  createMenu,
  importTaskExampleMenus,
  updateMenu,
  deleteMenu,
  createIntakeForm,
  updateIntakeForm,
  deleteIntakeForm,
  discardIntakeFormIfEmpty,
  addIntakeField,
  updateIntakeField,
  deleteIntakeField,
  createReportFieldPreset,
  updateReportFieldPreset,
  deleteReportFieldPreset,
  updateOrgTerms,
} from "@/app/actions";
import { errorMessage } from "@/lib/errors";

// ポップアップの中の変更は「保存する」を押したときだけ反映する。新しく足した行は
// まだDBに無いので、仮のid（new: で始まる）を付けておき、保存のときに作る。
const NEW_ID_PREFIX = "new:";
function tempId(): string {
  return `${NEW_ID_PREFIX}${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}
function isTempId(id: string): boolean {
  return id.startsWith(NEW_ID_PREFIX);
}
const UNSAVED_CONFIRM = "保存していない変更があります。保存せずに閉じますか？";

// ポップアップの下の「保存する」「キャンセル」。
function SaveBar({ saving, dirty, error, onSave, onCancel }: { saving: boolean; dirty: boolean; error: string; onSave: () => void; onCancel: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 10, borderTop: "1px solid var(--color-divider)" }}>
      {error && <span style={{ fontSize: 11.5, color: "var(--color-accent-200)" }}>{error}</span>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onCancel} disabled={saving} style={{ ...smallBtn, color: "var(--color-neutral-400)", borderColor: "var(--color-divider)" }}>
          キャンセル
        </button>
        <button
          onClick={onSave}
          disabled={saving || !dirty}
          style={{ ...smallBtn, color: "var(--color-accent-100)", background: "var(--color-accent-900)", opacity: saving || !dirty ? 0.6 : 1 }}
        >
          {saving ? "保存中…" : "保存する"}
        </button>
      </div>
    </div>
  );
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
  kind: string;
  required: boolean;
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
// Modal.tsx のボックス背景が var(--color-bg) なので、その中に置く入力欄は
// 同じ var(--color-bg) だと背景と色が被って見えなくなる（AccountSettingsPanel.tsx
// など他のModal内フォームと同じく、ここでは var(--color-surface) にして区別する）。
const modalInput: React.CSSProperties = { ...input, background: "var(--color-surface)" };
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
  initialTermsContent,
  initialDesks,
  initialReferralSources,
  departments,
  canEdit,
}: {
  orgId: string;
  initialMenus: Menu[];
  initialTemplates: IntakeForm[];
  initialTermsContent: string;
  initialDesks: InquiryDesk[];
  initialReferralSources: ReferralSourceWithCustomers[];
  departments: { id: string; name: string }[];
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

      {/* タブを切り替えても中身を作り直さない（作り直すと、最初に読み込んだ時点の内容に戻って見えてしまう） */}
      <div hidden={tab !== "menu"}><MenuListCard orgId={orgId} initialMenus={initialMenus} canEdit={canEdit} /></div>
      <div hidden={tab !== "templates"}><TemplatesCard orgId={orgId} initialTemplates={initialTemplates} canDelete={canEdit} /></div>
      <div hidden={tab !== "terms"}><TermsCard orgId={orgId} initialContent={initialTermsContent} canEdit={canEdit} /></div>
      <div hidden={tab !== "desks"}><InquiryDesksCard initialDesks={initialDesks} departments={departments} canEdit={canEdit} /></div>
      <div hidden={tab !== "referrals"}><ReferralSourcesCard initialSources={initialReferralSources} canEdit={canEdit} /></div>
    </div>
  );
}

type TabKey = "menu" | "templates" | "terms" | "desks" | "referrals";

const TABS: { key: TabKey; label: string; mobileLabel: string }[] = [
  { key: "menu", label: "受付メニュー", mobileLabel: "メニュー" },
  { key: "templates", label: "返信テンプレ", mobileLabel: "テンプレ" },
  { key: "terms", label: "利用規約", mobileLabel: "規約" },
  { key: "desks", label: "問い合わせ窓口", mobileLabel: "窓口" },
  { key: "referrals", label: "紹介元", mobileLabel: "紹介" },
];

function MenuListCard({ orgId, initialMenus, canEdit }: { orgId: string; initialMenus: Menu[]; canEdit: boolean }) {
  const [menus, setMenus] = useState(initialMenus);
  const [openId, setOpenId] = useState<string | null>(null);
  // 開いているメニューの編集中の内容（保存するまで一覧には反映しない）。
  const [draft, setDraft] = useState<Menu | null>(null);
  // 「メニューを追加」で作ったばかりのメニュー。保存せずに閉じたら消す。
  const [newMenuId, setNewMenuId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [presetsMenuId, setPresetsMenuId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState("");
  const q = query.trim().toLowerCase();
  const visibleMenus = q ? menus.filter((m) => m.label.toLowerCase().includes(q)) : menus;

  async function handleImport() {
    if (importing) return;
    if (!confirm("「頼めること」一覧（約100件）のうち、まだ無いものを受付メニューに追加します。金額は空欄で作るので、あとで入れてください。よろしいですか？")) return;
    setImporting(true);
    setImportNote("");
    try {
      const added = await importTaskExampleMenus(orgId);
      setMenus((m) => [...added.map((a) => ({ ...a, report_field_presets: [] })), ...m]);
      setImportNote(added.length > 0 ? `${added.length}件追加しました` : "すべて追加済みです");
    } catch {
      setImportNote("追加できませんでした");
    } finally {
      setImporting(false);
    }
  }

  function openMenu(m: Menu) {
    setOpenId(m.id);
    setDraft({ ...m, report_field_presets: m.report_field_presets.map((p) => ({ ...p })) });
    setSaveError("");
  }

  async function handleAdd() {
    const id = await createMenu(orgId);
    const created: Menu = { id, org_id: orgId, label: "新しいメニュー", note: null, icon: null, price: null, lead_hours: 24, active: true, department_id: null, report_field_presets: [] };
    setMenus((m) => [created, ...m]);
    setNewMenuId(id);
    openMenu(created);
  }

  async function handleDelete(id: string) {
    if (!confirm("このメニューを削除しますか？")) return;
    await deleteMenu(id);
    setMenus((m) => m.filter((x) => x.id !== id));
    setOpenId(null);
    setDraft(null);
    setNewMenuId(null);
  }

  function patchDraft(patch: Partial<Menu>) {
    setDraft((d) => (d ? { ...d, ...patch } : d));
  }

  const savedMenu = menus.find((m) => m.id === openId) ?? null;
  const dirty = !!draft && !!savedMenu && JSON.stringify(draft) !== JSON.stringify(savedMenu);

  async function closeMenu() {
    if (saving) return;
    if (dirty && !confirm(UNSAVED_CONFIRM)) return;
    // 追加したばかりで一度も保存していないメニューは、作らなかったことにする。
    if (newMenuId && newMenuId === openId) {
      const id = newMenuId;
      setMenus((m) => m.filter((x) => x.id !== id));
      deleteMenu(id).catch(() => {});
    }
    setNewMenuId(null);
    setPresetsMenuId(null);
    setOpenId(null);
    setDraft(null);
  }

  async function saveMenu() {
    if (!draft || !savedMenu || saving) return;
    setSaving(true);
    setSaveError("");
    try {
      await updateMenu(draft.id, { label: draft.label, note: draft.note ?? "", price: draft.price, active: draft.active, icon: draft.icon });
      // 報告書の定型項目：消したもの・足したもの・変えたものを反映する（名前が空の新しい行は作らない）。
      const keptIds = new Set(draft.report_field_presets.map((p) => p.id));
      for (const p of savedMenu.report_field_presets) {
        if (!keptIds.has(p.id)) await deleteReportFieldPreset(p.id);
      }
      const savedPresets: ReportFieldPreset[] = [];
      for (const [i, p] of draft.report_field_presets.entries()) {
        if (isTempId(p.id)) {
          if (!p.label.trim()) continue;
          const id = await createReportFieldPreset(draft.id, p.label.trim(), i);
          if (p.kind !== "text" || p.required) await updateReportFieldPreset(id, { kind: p.kind, required: p.required });
          savedPresets.push({ ...p, id, label: p.label.trim(), sort: i });
        } else {
          const before = savedMenu.report_field_presets.find((x) => x.id === p.id);
          if (before && (before.label !== p.label || before.kind !== p.kind || before.required !== p.required)) {
            await updateReportFieldPreset(p.id, { label: p.label, kind: p.kind, required: p.required });
          }
          savedPresets.push(p);
        }
      }
      setMenus((rows) => rows.map((r) => (r.id === draft.id ? { ...draft, report_field_presets: savedPresets } : r)));
      setNewMenuId(null);
      setPresetsMenuId(null);
      setOpenId(null);
      setDraft(null);
    } catch (e) {
      setSaveError(errorMessage(e, "保存できませんでした。もう一度お試しください。"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={card}>
      {/* スマホでは見出しが縦に潰れないよう、ボタンは次の行に回す。 */}
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 15, whiteSpace: "nowrap" }}>受付メニュー</div>
        <InfoTooltip text="依頼主が相談するときに選ぶ一覧です。金額・はじめの質問をここで決めます（金額は依頼主には表示されません）。金額を空欄にすると『相談のみ』の項目になり、見積もり作成時の選択肢には出てきません。どの秘書が対応するかは、依頼主の画面の「担当秘書」で割り当てます。編集は本部だけができます" />
        <div style={{ flex: 1 }} />
        {canEdit && (
          <button onClick={handleImport} disabled={importing} style={{ ...smallBtn, opacity: importing ? 0.6 : 1 }}>
            {importing ? "追加中…" : "頼めること一覧から追加"}
          </button>
        )}
        {canEdit && (
          <button onClick={handleAdd} style={smallBtn}>
            <Plus size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
            メニューを追加
          </button>
        )}
      </div>
      {importNote && <div style={{ fontSize: 11.5, color: "var(--color-accent-300)" }}>{importNote}</div>}
      {menus.length > 8 && (
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="メニューを検索" className="vid-input" style={input} />
      )}
      {!canEdit && <div style={{ fontSize: 11.5, color: "var(--color-neutral-500)" }}>メニューの編集は本部のみ行えます。</div>}

      {menus.length === 0 && <div style={{ fontSize: 12.5, color: "var(--color-neutral-500)" }}>まだメニューがありません。</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {visibleMenus.map((m) => {
          const open = openId === m.id;
          const selectedIconName = menuIconName(m.icon);
          const draftIconName = open && draft ? menuIconName(draft.icon) : null;
          const SelectedIcon = selectedIconName ? MENU_ICON_COMPONENTS[selectedIconName] : null;
          return (
            <div key={m.id} style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--color-divider)", overflow: "hidden" }}>
              <button
                onClick={() => openMenu(m)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", cursor: "pointer", background: "var(--color-bg)", border: "none", textAlign: "left", color: "var(--color-text)" }}
              >
                {SelectedIcon && <SelectedIcon size={15} color="var(--color-accent)" style={{ flex: "none" }} />}
                <span style={{ flex: 1, fontSize: 13.5, opacity: m.active ? 1 : 0.5 }}>{m.label || "（無題）"}</span>
                <span style={{ fontSize: 11.5, color: "var(--color-neutral-500)" }}>{m.price != null ? `¥${m.price.toLocaleString("ja-JP")}` : "相談のみ"}</span>
                <CaretRight size={13} color="var(--color-neutral-500)" />
              </button>
              {open && draft && (
                <Modal onClose={closeMenu} maxWidth={520}>
                <div style={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: 10 }}>
                  <PopupHeader title={draft.label || "（無題）"} onClose={closeMenu} />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      <span style={label}>メニュー名</span>
                      <input value={draft.label} onChange={(e) => patchDraft({ label: e.target.value })} disabled={!canEdit} className="vid-input" style={input} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      <span style={{ ...label, display: "flex", alignItems: "center", gap: 6 }}>
                        請求金額（円）
                        <InfoTooltip text="空欄にすると「相談のみ」の項目になり、見積もりの選択肢には出てきません。" />
                      </span>
                      <input
                        type="number"
                        value={draft.price ?? ""}
                        placeholder="未設定"
                        onChange={(e) => patchDraft({ price: e.target.value === "" ? null : Number(e.target.value) })}
                        disabled={!canEdit}
                        className="vid-input"
                        style={input}
                      />
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <span style={label}>詳細内容</span>
                    <input value={draft.note ?? ""} onChange={(e) => patchDraft({ note: e.target.value })} disabled={!canEdit} className="vid-input" style={input} />
                  </div>

                  {canEdit && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      <span style={label}>アイコン（依頼主のメニュー一覧に表示されます）</span>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => {
                            patchDraft({ icon: null });
                          }}
                          title="アイコンなし"
                          style={{
                            width: 32,
                            height: 32,
                            display: "grid",
                            placeItems: "center",
                            cursor: "pointer",
                            fontSize: 10,
                            whiteSpace: "nowrap",
                            color: draftIconName === null ? "var(--color-accent)" : "var(--color-neutral-500)",
                            background: draftIconName === null ? "var(--color-accent-900)" : "transparent",
                            border: `1px solid ${draftIconName === null ? "var(--color-accent)" : "var(--color-divider)"}`,
                            borderRadius: "var(--radius-md)",
                          }}
                        >
                          なし
                        </button>
                        {MENU_ICON_OPTIONS.map((opt) => {
                          const OptIcon = MENU_ICON_COMPONENTS[opt.name];
                          const on = draftIconName === opt.name;
                          return (
                            <button
                              key={opt.name}
                              type="button"
                              onClick={() => {
                                patchDraft({ icon: menuIconClass(opt.name) });
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
                    <button onClick={() => setPresetsMenuId(m.id)} style={smallBtn}>
                      報告書の定型項目　{draft.report_field_presets.length}件
                    </button>
                    <div style={{ flex: 1 }} />
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-neutral-400)" }}>
                      <input type="checkbox" checked={draft.active} onChange={(e) => patchDraft({ active: e.target.checked })} disabled={!canEdit} />
                      表示する
                    </label>
                    {canEdit && (
                      <button onClick={() => handleDelete(m.id)} style={{ ...smallBtn, color: "var(--color-accent-200)", borderColor: "var(--color-divider)" }}>
                        <Trash size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
                        削除
                      </button>
                    )}
                  </div>
                  {canEdit && <SaveBar saving={saving} dirty={dirty} error={saveError} onSave={saveMenu} onCancel={closeMenu} />}
                </div>
                </Modal>
              )}
              {presetsMenuId === m.id && draft && (
                <Modal onClose={() => setPresetsMenuId(null)} maxWidth={480}>
                  <div style={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 18 }}>報告書の定型項目</div>
                      <InfoTooltip text="このメニューの完了報告を書くとき、スタッフがワンタップで項目を追加できる定型の項目名です（自由な項目追加も別途できます）。ここでの変更は、メニューの「保存する」を押したときに反映されます。" />
                      <div style={{ flex: 1 }} />
                      <button onClick={() => setPresetsMenuId(null)} aria-label="閉じる" style={{ display: "flex", cursor: "pointer", color: "var(--color-neutral-400)", background: "transparent", border: "none" }}>
                        <X size={18} />
                      </button>
                    </div>
                    <MenuReportFieldPresetsEditor menuId={m.id} presets={draft.report_field_presets} onChange={(p) => patchDraft({ report_field_presets: p })} canEdit={canEdit} />
                    <button onClick={() => setPresetsMenuId(null)} style={{ ...smallBtn, alignSelf: "flex-end" }}>
                      決定
                    </button>
                  </div>
                </Modal>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// canDelete: 返信テンプレの削除は本部（オーナー）のみ。追加・編集は秘書もできる。
// 一覧の行をタップして開くポップアップの見出し（名前と閉じるボタン）。
function PopupHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, minWidth: 0, fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 17, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
      <button onClick={onClose} aria-label="閉じる" style={{ display: "flex", cursor: "pointer", color: "var(--color-neutral-400)", background: "transparent", border: "none" }}>
        <X size={18} />
      </button>
    </div>
  );
}

function TemplatesCard({ orgId, initialTemplates, canDelete }: { orgId: string; initialTemplates: IntakeForm[]; canDelete: boolean }) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [openId, setOpenId] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  // 開いているテンプレの編集中の内容（保存するまで一覧には反映しない）。
  const [draft, setDraft] = useState<IntakeForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  function openTemplate(t: IntakeForm) {
    setOpenId(t.id);
    setDraft({ ...t, intake_fields: t.intake_fields.map((f) => ({ ...f })) });
    setSaveError("");
  }

  const savedTemplate = templates.find((t) => t.id === openId) ?? null;
  const dirty = !!draft && !!savedTemplate && JSON.stringify(draft) !== JSON.stringify(savedTemplate);

  function closeTemplate() {
    if (saving) return;
    if (dirty && !confirm(UNSAVED_CONFIRM)) return;
    // 追加したばかりで一度も保存していないテンプレは、作らなかったことにする。
    if (createdId && createdId === openId) {
      const id = createdId;
      setTemplates((rows) => rows.filter((x) => x.id !== id));
      discardIntakeFormIfEmpty(id).catch(() => {});
    }
    setCreatedId(null);
    setOpenId(null);
    setDraft(null);
  }

  async function saveTemplate() {
    if (!draft || !savedTemplate || saving) return;
    setSaving(true);
    setSaveError("");
    try {
      await updateIntakeForm(draft.id, { label: draft.label, note: draft.note ?? "" });
      // 入力してもらう項目：消したもの・足したもの・変えたものを反映する（名前が空の新しい行は作らない）。
      const keptIds = new Set(draft.intake_fields.map((f) => f.id));
      for (const f of savedTemplate.intake_fields) {
        if (!keptIds.has(f.id)) await deleteIntakeField(f.id);
      }
      const savedFields: IntakeField[] = [];
      for (const [i, f] of draft.intake_fields.entries()) {
        if (isTempId(f.id)) {
          if (!f.label.trim()) continue;
          const created = await addIntakeField(draft.id, i);
          await updateIntakeField(created.id, { label: f.label.trim(), kind: f.kind });
          savedFields.push({ ...f, id: created.id, key: created.key, label: f.label.trim(), sort: i });
        } else {
          const before = savedTemplate.intake_fields.find((x) => x.id === f.id);
          if (before && (before.label !== f.label || before.kind !== f.kind)) await updateIntakeField(f.id, { label: f.label, kind: f.kind });
          savedFields.push(f);
        }
      }
      setTemplates((rows) => rows.map((r) => (r.id === draft.id ? { ...draft, intake_fields: savedFields } : r)));
      setCreatedId(null);
      setOpenId(null);
      setDraft(null);
    } catch (e) {
      setSaveError(errorMessage(e, "保存できませんでした。もう一度お試しください。"));
    } finally {
      setSaving(false);
    }
  }

  async function handleAdd() {
    const id = await createIntakeForm(orgId);
    const created: IntakeForm = { id, org_id: orgId, label: "", note: null, sort: 999, intake_fields: [] };
    setTemplates((t) => [created, ...t]);
    setCreatedId(id);
    openTemplate(created);
  }

  async function handleDelete(id: string) {
    if (!confirm("このテンプレを削除しますか？")) return;
    await deleteIntakeForm(id);
    setTemplates((t) => t.filter((x) => x.id !== id));
    setCreatedId(null);
    setOpenId(null);
    setDraft(null);
  }

  function patchDraft(patch: Partial<IntakeForm>) {
    setDraft((d) => (d ? { ...d, ...patch } : d));
  }

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 15, whiteSpace: "nowrap" }}>返信テンプレ</div>
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
                onClick={() => openTemplate(t)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", cursor: "pointer", background: "var(--color-bg)", border: "none", textAlign: "left", color: "var(--color-text)" }}
              >
                <span style={{ flex: 1, fontSize: 13.5 }}>{t.label || "（無題）"}</span>
                <span style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>{t.intake_fields.length > 0 ? `項目${t.intake_fields.length}件` : "定型文のみ"}</span>
                <CaretRight size={13} color="var(--color-neutral-500)" />
              </button>
              {open && draft && (
                <Modal onClose={closeTemplate} maxWidth={520}>
                <div style={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: 10 }}>
                  <PopupHeader title={draft.label || "（無題）"} onClose={closeTemplate} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <span style={label}>テンプレ名</span>
                    <input value={draft.label} onChange={(e) => patchDraft({ label: e.target.value })} placeholder="例：ご予約の確認" className="vid-input" style={input} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <span style={label}>定型文の本文（項目がなければそのまま送信されます）</span>
                    <textarea
                      value={draft.note ?? ""}
                      onChange={(e) => patchDraft({ note: e.target.value })}
                      rows={3}
                      className="vid-input"
                      style={{ ...input, height: "auto", padding: "8px 10px", resize: "vertical" }}
                    />
                  </div>

                  <TemplateFieldsEditor formId={draft.id} fields={draft.intake_fields} onChange={(fields) => patchDraft({ intake_fields: fields })} />

                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    {canDelete && (
                    <button onClick={() => handleDelete(t.id)} style={{ ...smallBtn, color: "var(--color-accent-200)", borderColor: "var(--color-divider)" }}>
                      <Trash size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
                      削除
                    </button>
                    )}
                  </div>
                  <SaveBar saving={saving} dirty={dirty} error={saveError} onSave={saveTemplate} onCancel={closeTemplate} />
                </div>
                </Modal>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TermsCard({ orgId, initialContent, canEdit }: { orgId: string; initialContent: string; canEdit: boolean }) {
  const [content, setContent] = useState(initialContent);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (saving) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await updateOrgTerms(orgId, content);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 15, whiteSpace: "nowrap" }}>利用規約</div>
        <InfoTooltip text="依頼主が新規登録のときに同意する利用規約の本文です（/terms に表示されます）。ここで直すとすぐに反映されます。法的な内容は専門家に確認することをおすすめします。" />
      </div>
      {!canEdit && <div style={{ fontSize: 11.5, color: "var(--color-neutral-500)" }}>利用規約の編集は本部のみ行えます。</div>}
      <textarea
        value={content}
        onChange={(e) => { setContent(e.target.value); setSaved(false); }}
        disabled={!canEdit}
        rows={24}
        className="vid-input"
        style={{ ...input, height: "auto", minHeight: 420, padding: "10px 12px", lineHeight: 1.7, resize: "vertical", fontFamily: "var(--font-body)" }}
      />
      {canEdit && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={save} disabled={saving} style={{ ...smallBtn, color: "var(--color-accent-100)", background: "var(--color-accent-900)" }}>
            {saving ? "保存中…" : "保存する"}
          </button>
          {saved && <span style={{ fontSize: 12, color: "var(--color-accent-300)" }}>保存しました</span>}
          {error && <span style={{ fontSize: 12, color: "var(--color-accent-200)" }}>{error}</span>}
        </div>
      )}
    </div>
  );
}

const PRESET_KINDS = [
  { value: "text", label: "テキスト" },
  { value: "url", label: "URL" },
];

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
  function add() {
    onChange([...presets, { id: tempId(), menu_id: menuId, label: "", kind: "text", required: false, sort: presets.length }]);
  }
  function patch(id: string, p: Partial<ReportFieldPreset>) {
    onChange(presets.map((x) => (x.id === id ? { ...x, ...p } : x)));
  }
  function remove(id: string) {
    onChange(presets.filter((p) => p.id !== id));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {presets.map((p) => (
        <div key={p.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={p.label}
            onChange={(e) => patch(p.id, { label: e.target.value })}
            placeholder="項目名"
            disabled={!canEdit}
            className="vid-input"
            style={{ ...modalInput, flex: 1, minWidth: 100, height: 32 }}
          />
          <select
            value={p.kind}
            onChange={(e) => patch(p.id, { kind: e.target.value })}
            disabled={!canEdit}
            className="vid-input"
            style={{ ...modalInput, flex: "none", width: 92, height: 32 }}
          >
            {PRESET_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 4, flex: "none", fontSize: 11.5, color: "var(--color-neutral-400)" }}>
            <input
              type="checkbox"
              checked={p.required}
              onChange={(e) => patch(p.id, { required: e.target.checked })}
              disabled={!canEdit}
            />
            必須
          </label>
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
  function add() {
    onChange([...fields, { id: tempId(), form_id: formId, key: "", label: "", kind: "text", sort: fields.length }]);
  }
  function patch(id: string, p: Partial<IntakeField>) {
    onChange(fields.map((f) => (f.id === id ? { ...f, ...p } : f)));
  }
  function remove(id: string) {
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
            placeholder="例：ご希望の日時"
            className="vid-input"
            style={{ ...input, height: 32 }}
          />
          <select
            value={f.kind}
            onChange={(e) => patch(f.id, { kind: e.target.value })}
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

