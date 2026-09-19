"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash, Plus, CaretDown, CaretRight } from "@phosphor-icons/react";
import { headingWeight } from "@/lib/style";
import { errorMessage } from "@/lib/errors";
import { useIsMobile } from "@/lib/useIsMobile";
import {
  updateCompanyInfo,
  updateStaffMode,
  updatePaymentSettings,
  renameCardPaymentLink,
  deleteCardPaymentLink,
  createMenu,
  updateMenu,
  deleteMenu,
  addMenuQuestion,
  updateMenuQuestion,
  deleteMenuQuestion,
  updateLoginEmail,
  updateLoginPassword,
  createIntakeForm,
  updateIntakeForm,
  deleteIntakeForm,
  addIntakeField,
  updateIntakeField,
  deleteIntakeField,
  updateRefundPolicy,
} from "@/app/actions";
import type { BankTransferInfo, RefundMode, RefundStage } from "@/lib/supabase/types";

interface Company {
  name: string;
  display_name: string;
  rep_name: string;
  address: string;
  tel: string;
  email: string;
}

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
  price: number;
  lead_hours: number;
  active: boolean;
  menu_questions: Question[];
}

interface IntakeField {
  id: string;
  form_id: string;
  key: string;
  label: string;
  kind: string;
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

interface RefundPolicyRow {
  stage: RefundStage;
  mode: RefundMode;
  pct: number;
}

interface CardPaymentLink {
  id: string;
  title: string;
  url: string;
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
  referrerUserId,
  initialCompany,
  initialMenus,
  initialLoginEmail,
  initialTemplates,
  initialRefundPolicy,
  slug,
  initialCardPaymentEnabled,
  initialBankInfo,
  initialCardPaymentLinks,
}: {
  orgId: string;
  referrerUserId: string;
  initialCompany: Company;
  initialMenus: Menu[];
  initialLoginEmail: string;
  initialTemplates: IntakeForm[];
  initialRefundPolicy: RefundPolicyRow[];
  initialSolo: boolean;
  slug: string | null;
  initialCardPaymentEnabled: boolean;
  initialBankInfo: BankTransferInfo;
  initialCardPaymentLinks: CardPaymentLink[];
}) {
  const [tab, setTab] = useState<TabKey>("company");
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

      {tab === "company" && (
        <>
          <CompanyInfoCard initial={initialCompany} slug={slug} referrerUserId={referrerUserId} />
          <PaymentSettingsCard initialCardPaymentEnabled={initialCardPaymentEnabled} initialBankInfo={initialBankInfo} />
          <CardPaymentLinksCard initialLinks={initialCardPaymentLinks} />
          {/* StaffModeCard は複数スタッフ運用が必要になるまで非表示にする */}
        </>
      )}
      {tab === "menu" && <MenuListCard orgId={orgId} initialMenus={initialMenus} />}
      {tab === "templates" && <TemplatesCard orgId={orgId} initialTemplates={initialTemplates} />}
      {tab === "refund" && <RefundPolicyCard orgId={orgId} initialPolicy={initialRefundPolicy} />}
      {tab === "login" && <LoginInfoCard initialEmail={initialLoginEmail} />}
    </div>
  );
}

type TabKey = "company" | "menu" | "login" | "templates" | "refund";

const TABS: { key: TabKey; label: string; mobileLabel: string }[] = [
  { key: "company", label: "会社情報", mobileLabel: "会社情報" },
  { key: "menu", label: "受付メニュー", mobileLabel: "メニュー" },
  { key: "templates", label: "返信テンプレ", mobileLabel: "テンプレ" },
  { key: "refund", label: "キャンセル・返金ポリシー", mobileLabel: "返金ポリシー" },
  { key: "login", label: "ログイン情報", mobileLabel: "ログイン設定" },
];

function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const btnRef = useRef<HTMLButtonElement>(null);
  const [mobileTop, setMobileTop] = useState(0);

  useEffect(() => {
    if (open && isMobile && btnRef.current) {
      // position:fixed なので、開いた時点のボタン位置（ビューポート基準）を測っておく。
      setMobileTop(btnRef.current.getBoundingClientRect().bottom + 6);
    }
  }, [open, isMobile]);

  return (
    <span style={{ position: "relative", display: "inline-flex", flex: "none", alignSelf: "flex-start" }}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        aria-label="説明を表示"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 13,
          height: 13,
          padding: 0,
          cursor: "pointer",
          fontSize: 9,
          lineHeight: 1,
          color: "var(--color-neutral-500)",
          background: "transparent",
          border: "1px solid var(--color-neutral-500)",
          borderRadius: "50%",
        }}
      >
        i
      </button>
      {open && (
        <div
          role="tooltip"
          style={
            isMobile
              ? {
                  position: "fixed",
                  top: mobileTop,
                  left: 16,
                  right: 16,
                  zIndex: 30,
                  padding: "10px 12px",
                  fontSize: 11.5,
                  lineHeight: 1.6,
                  color: "var(--color-text)",
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-divider)",
                  borderRadius: "var(--radius-md)",
                  boxShadow: "var(--shadow-md)",
                }
              : {
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  left: 0,
                  zIndex: 20,
                  width: "max-content",
                  maxWidth: 520,
                  padding: "10px 12px",
                  fontSize: 11.5,
                  lineHeight: 1.6,
                  color: "var(--color-text)",
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-divider)",
                  borderRadius: "var(--radius-md)",
                  boxShadow: "var(--shadow-md)",
                }
          }
        >
          {text}
        </div>
      )}
    </span>
  );
}

function CardHeader({ title, info, editing, onEdit }: { title: string; info?: string; editing: boolean; onEdit: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 15 }}>{title}</div>
      {info && <InfoTooltip text={info} />}
      <div style={{ flex: 1 }} />
      {!editing && (
        <button onClick={onEdit} style={{ ...smallBtn, height: 28 }}>
          変更
        </button>
      )}
    </div>
  );
}

function InfoRow({ label: l, value, labelWidth = 90 }: { label: string; value: string; labelWidth?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 12, fontSize: 12.5 }}>
      <span style={{ width: labelWidth, flex: "none", color: "var(--color-neutral-500)", lineHeight: 1.5 }}>{l}</span>
      <span style={{ minWidth: 0, flex: 1, color: value ? "inherit" : "var(--color-neutral-500)" }}>{value || "（未設定）"}</span>
    </div>
  );
}

function CompanyInfoCard({ initial, slug, referrerUserId }: { initial: Company; slug: string | null; referrerUserId: string }) {
  const [saved, setSaved] = useState(initial);
  const [form, setForm] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const referralLink = `https://port-business.s-stylegolf.com/signup?ref=${referrerUserId}`;

  async function shareReferralLink() {
    // 端末が共有シートに対応していればそちらを使い、対応していなければ
    // URLをコピーするだけにする（PCのブラウザなど navigator.share が
    // ないケース）。
    if (navigator.share) {
      try {
        await navigator.share({ title: "PORT", text: "PORTを使ってみませんか？", url: referralLink });
      } catch {
        /* 共有をキャンセルした場合など。何もしない */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  function set<K extends keyof Company>(key: K, value: Company[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function startEdit() {
    setForm(saved);
    setError("");
    setEditing(true);
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await updateCompanyInfo(form);
      setSaved(form);
      setEditing(false);
    } catch (e) {
      setError(errorMessage(e, "保存できませんでした"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={card}>
      <CardHeader title="会社情報" info="契約書の「甲」・依頼主への表示名・見積書と請求書に使います" editing={editing} onEdit={startEdit} />
      {slug && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-neutral-400)" }}>
          <span>お問い合わせURL：</span>
          <a href={`https://port.s-stylegolf.com/${slug}`} target="_blank" rel="noreferrer" style={{ color: "var(--color-accent-300)" }}>
            port.s-stylegolf.com/{slug}
          </a>
          <InfoTooltip text="このURLは共通のリンクですが、タップした方ごとに専用のお問い合わせ窓口になります。ホームページなどに載せてご利用ください。" />
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <button
          onClick={shareReferralLink}
          style={{ height: 30, padding: "0 12px", cursor: "pointer", fontSize: 12, color: "var(--color-accent)", background: "transparent", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-sm)" }}
        >
          {copied ? "リンクをコピーしました" : "知り合いにもPORTを勧めて1ヶ月無料をもらう"}
        </button>
        <InfoTooltip text="このリンクから他の事業者がPORTに申し込むと、トライアル期間が30日間から90日間になります。申し込みが完了すると、あなたの次回のお支払いが1ヶ月分無料になります。" />
      </div>
      {!editing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <InfoRow label="正式名称" value={saved.name} />
          <InfoRow label="表示名" value={saved.display_name} />
          <InfoRow label="代表者名" value={saved.rep_name} />
          <InfoRow label="電話番号" value={saved.tel} />
          <InfoRow label="メールアドレス" value={saved.email} />
          <InfoRow label="住所" value={saved.address} />
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="正式名称" value={form.name} onChange={(v) => set("name", v)} />
            <Field label="表示名（依頼主に見える）" value={form.display_name} onChange={(v) => set("display_name", v)} />
            <Field label="代表者名" value={form.rep_name} onChange={(v) => set("rep_name", v)} />
            <Field label="電話番号" value={form.tel} onChange={(v) => set("tel", v)} />
            <Field label="メールアドレス" value={form.email} onChange={(v) => set("email", v)} />
            <Field label="住所" value={form.address} onChange={(v) => set("address", v)} />
          </div>
          {error && <span style={{ fontSize: 11.5, color: "var(--color-accent-200)" }}>{error}</span>}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={save} disabled={saving} style={{ ...smallBtn, height: 36 }}>
              {saving ? "保存中…" : "保存して閉じる"}
            </button>
            <button onClick={() => setEditing(false)} disabled={saving} style={{ ...smallBtn, height: 36, color: "var(--color-neutral-400)", borderColor: "var(--color-divider)" }}>
              キャンセル
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function PaymentSettingsCard({
  initialCardPaymentEnabled,
  initialBankInfo,
}: {
  initialCardPaymentEnabled: boolean;
  initialBankInfo: BankTransferInfo;
}) {
  const savedInitial = { cardEnabled: initialCardPaymentEnabled, bankInfo: initialBankInfo };
  const [saved, setSaved] = useState(savedInitial);
  const [cardEnabled, setCardEnabled] = useState(saved.cardEnabled);
  const [bankInfo, setBankInfo] = useState(saved.bankInfo);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function setBankField<K extends keyof BankTransferInfo>(key: K, value: string) {
    setBankInfo((b) => ({ ...b, [key]: value }));
  }

  function startEdit() {
    setCardEnabled(saved.cardEnabled);
    setBankInfo(saved.bankInfo);
    setError("");
    setEditing(true);
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await updatePaymentSettings({ cardPaymentEnabled: cardEnabled, bankInfo });
      setSaved({ cardEnabled, bankInfo });
      setEditing(false);
    } catch (e) {
      setError(errorMessage(e, "保存できませんでした"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={card}>
      <CardHeader
        title="決済設定"
        info="見積もり作成時に選べる支払い方法と、銀行振込のデフォルトの振込先です（見積もりごとにその場で変更もできます）。カード決済のリンクは見積もり作成のたびに入力します。"
        editing={editing}
        onEdit={startEdit}
      />
      {!editing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <InfoRow label="カード決済" value={saved.cardEnabled ? "使う" : "使わない"} />
          <InfoRow label="口座名義" value={saved.bankInfo.holder ?? ""} />
          <InfoRow label="銀行・支店" value={[saved.bankInfo.bankName, saved.bankInfo.branchName].filter(Boolean).join(" ")} />
          <InfoRow label="口座番号" value={[saved.bankInfo.accountType, saved.bankInfo.accountNumber].filter(Boolean).join(" ")} />
        </div>
      ) : (
        <>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
            <input type="checkbox" checked={cardEnabled} onChange={(e) => setCardEnabled(e.target.checked)} />
            カード決済を見積もりで選べるようにする
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={label}>銀行振込のデフォルト振込先</span>
            <Field label="口座名義" value={bankInfo.holder ?? ""} onChange={(v) => setBankField("holder", v)} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="銀行名" value={bankInfo.bankName ?? ""} onChange={(v) => setBankField("bankName", v)} />
              <Field label="支店名" value={bankInfo.branchName ?? ""} onChange={(v) => setBankField("branchName", v)} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="口座種別（普通・当座）" value={bankInfo.accountType ?? ""} onChange={(v) => setBankField("accountType", v)} />
              <Field label="口座番号" value={bankInfo.accountNumber ?? ""} onChange={(v) => setBankField("accountNumber", v)} />
            </div>
          </div>
          {error && <span style={{ fontSize: 11.5, color: "var(--color-accent-200)" }}>{error}</span>}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={save} disabled={saving} style={{ ...smallBtn, height: 36 }}>
              {saving ? "保存中…" : "保存して閉じる"}
            </button>
            <button onClick={() => setEditing(false)} disabled={saving} style={{ ...smallBtn, height: 36, color: "var(--color-neutral-400)", borderColor: "var(--color-divider)" }}>
              キャンセル
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function CardPaymentLinksCard({ initialLinks }: { initialLinks: CardPaymentLink[] }) {
  const [links, setLinks] = useState(initialLinks);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const isMobile = useIsMobile();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function startRename(l: CardPaymentLink) {
    setEditingId(l.id);
    setTitleDraft(l.title);
    setError("");
  }

  async function saveRename(id: string) {
    if (busyId) return;
    setBusyId(id);
    setError("");
    try {
      await renameCardPaymentLink(id, titleDraft);
      setLinks((rows) => rows.map((r) => (r.id === id ? { ...r, title: titleDraft.trim() } : r)));
      setEditingId(null);
    } catch (e) {
      setError(errorMessage(e, "変更できませんでした"));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    if (busyId || !confirm("この決済リンクを削除しますか？")) return;
    setBusyId(id);
    setError("");
    try {
      await deleteCardPaymentLink(id);
      setLinks((rows) => rows.filter((r) => r.id !== id));
    } catch (e) {
      setError(errorMessage(e, "削除できませんでした"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 15 }}>カード決済のリンク一覧</div>
        <InfoTooltip text="見積もり作成時に入力したリンクがここに並びます。URLは変更できません（タイトルの変更・削除のみ）。" />
      </div>
      {links.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--color-neutral-500)" }}>まだリンクはありません。</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {links.map((l) =>
            isMobile ? (
              <div key={l.id} style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--color-divider)", overflow: "hidden" }}>
                <button
                  onClick={() => setExpandedId((v) => (v === l.id ? null : l.id))}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", cursor: "pointer", background: "var(--color-bg)", border: "none", textAlign: "left", color: "var(--color-text)" }}
                >
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.title}</span>
                  {expandedId === l.id ? <CaretDown size={13} /> : <CaretRight size={13} />}
                </button>
                {expandedId === l.id && (
                  <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 11.5, color: "var(--color-neutral-500)", overflowWrap: "anywhere" }}>{l.url}</div>
                    {editingId === l.id ? (
                      <div style={{ display: "flex", gap: 8 }}>
                        <input value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} className="vid-input" style={{ ...input, height: 32, minWidth: 0, flex: 1 }} />
                        <button onClick={() => saveRename(l.id)} disabled={busyId === l.id} style={{ ...smallBtn, height: 32 }}>
                          保存
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => startRename(l)} style={{ ...smallBtn, height: 30, flex: 1 }}>
                          タイトル変更
                        </button>
                        <button onClick={() => remove(l.id)} disabled={busyId === l.id} style={{ flex: "none", width: 30, height: 30, display: "grid", placeItems: "center", cursor: "pointer", color: "var(--color-neutral-500)", background: "transparent", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}>
                          <Trash size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div key={l.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-divider)" }}>
                {editingId === l.id ? (
                  <input value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} className="vid-input" style={{ ...input, height: 32, minWidth: 0, flex: "1 1 140px" }} />
                ) : (
                  <span style={{ minWidth: 0, flex: "1 1 140px", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.title}</span>
                )}
                <span style={{ minWidth: 0, flex: "2 1 160px", fontSize: 11.5, color: "var(--color-neutral-500)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.url}</span>
                <div style={{ display: "flex", flex: "none", gap: 8, marginLeft: "auto" }}>
                  {editingId === l.id ? (
                    <button onClick={() => saveRename(l.id)} disabled={busyId === l.id} style={{ ...smallBtn, height: 30 }}>
                      保存
                    </button>
                  ) : (
                    <button onClick={() => startRename(l)} style={{ ...smallBtn, height: 30 }}>
                      タイトル変更
                    </button>
                  )}
                  <button onClick={() => remove(l.id)} disabled={busyId === l.id} style={{ flex: "none", width: 30, height: 30, display: "grid", placeItems: "center", cursor: "pointer", color: "var(--color-neutral-500)", background: "transparent", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}>
                    <Trash size={13} />
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      )}
      {error && <span style={{ fontSize: 11.5, color: "var(--color-accent-200)" }}>{error}</span>}
    </div>
  );
}

// 複数スタッフ運用が必要になるまで未使用（呼び出し箇所を非表示にしている）。
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function StaffModeCard({ initialSolo }: { initialSolo: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(!initialSolo);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    if (saving) return;
    const next = !enabled;
    setSaving(true);
    setError("");
    try {
      await updateStaffMode(next);
      setEnabled(next);
      router.refresh();
    } catch (e) {
      setError(errorMessage(e, "切り替えできませんでした"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 15 }}>スタッフ連携</div>
        <InfoTooltip text="オンにすると、左メニューに「スタッフ」が表示され、案件ごとに担当者を割り当てられるようになります。オフのままなら、受付が1人で全ての案件に対応する運用になります。" />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={toggle}
          disabled={saving}
          role="switch"
          aria-checked={enabled}
          style={{
            width: 42,
            height: 24,
            padding: 2,
            flex: "none",
            cursor: "pointer",
            display: "flex",
            justifyContent: enabled ? "flex-end" : "flex-start",
            background: enabled ? "var(--color-accent)" : "var(--color-neutral-800)",
            border: "none",
            borderRadius: 999,
          }}
        >
          <span style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--color-surface)" }} />
        </button>
        <span style={{ fontSize: 12.5 }}>{enabled ? "スタッフ連携を使う" : "1人運用（スタッフ機能を隠す）"}</span>
      </div>
      {error && <span style={{ fontSize: 11.5, color: "var(--color-accent-200)" }}>{error}</span>}
    </div>
  );
}

function Field({ label: l, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={label}>{l}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="vid-input" style={input} />
    </div>
  );
}

function MenuListCard({ orgId, initialMenus }: { orgId: string; initialMenus: Menu[] }) {
  const [menus, setMenus] = useState(initialMenus);
  const [openId, setOpenId] = useState<string | null>(null);

  async function handleAdd() {
    const id = await createMenu(orgId);
    setMenus((m) => [...m, { id, org_id: orgId, label: "新しいメニュー", note: null, price: 0, lead_hours: 24, active: true, menu_questions: [] }]);
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
    await updateMenu(m.id, { label: m.label, note: m.note ?? "", price: m.price, lead_hours: m.lead_hours, active: m.active });
  }

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 15 }}>受付メニュー</div>
        <InfoTooltip text="依頼主が相談するときに選ぶ一覧です。金額・作業時間の目安・はじめの質問をここで決めます" />
        <div style={{ flex: 1 }} />
        <button onClick={handleAdd} style={smallBtn}>
          <Plus size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
          メニューを追加
        </button>
      </div>

      {menus.length === 0 && <div style={{ fontSize: 12.5, color: "var(--color-neutral-500)" }}>まだメニューがありません。</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {menus.map((m) => {
          const open = openId === m.id;
          return (
            <div key={m.id} style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--color-divider)", overflow: "hidden" }}>
              <button
                onClick={() => setOpenId(open ? null : m.id)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", cursor: "pointer", background: "var(--color-bg)", border: "none", textAlign: "left", color: "var(--color-text)" }}
              >
                {open ? <CaretDown size={13} /> : <CaretRight size={13} />}
                <span style={{ flex: 1, fontSize: 13.5, opacity: m.active ? 1 : 0.5 }}>{m.label || "（無題）"}</span>
                <span style={{ fontSize: 11.5, color: "var(--color-neutral-500)" }}>¥{m.price.toLocaleString("ja-JP")}</span>
              </button>
              {open && (
                <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      <span style={label}>メニュー名</span>
                      <input value={m.label} onChange={(e) => patchLocal(m.id, { label: e.target.value })} onBlur={() => commit(m)} className="vid-input" style={input} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      <span style={label}>請求金額（円）</span>
                      <input
                        type="number"
                        value={m.price}
                        onChange={(e) => patchLocal(m.id, { price: Number(e.target.value) })}
                        onBlur={() => commit(m)}
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
                        className="vid-input"
                        style={input}
                      />
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <span style={label}>詳細内容</span>
                    <input value={m.note ?? ""} onChange={(e) => patchLocal(m.id, { note: e.target.value })} onBlur={() => commit(m)} className="vid-input" style={input} />
                  </div>

                  <QuestionsEditor menuId={m.id} questions={m.menu_questions} onChange={(qs) => patchLocal(m.id, { menu_questions: qs })} />

                  <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 6, borderTop: "1px solid var(--color-divider)" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-neutral-400)" }}>
                      <input type="checkbox" checked={m.active} onChange={(e) => { patchLocal(m.id, { active: e.target.checked }); commit({ ...m, active: e.target.checked }); }} />
                      表示する
                    </label>
                    <div style={{ flex: 1 }} />
                    <button onClick={() => handleDelete(m.id)} style={{ ...smallBtn, color: "var(--color-accent-200)", borderColor: "var(--color-divider)" }}>
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

function QuestionsEditor({ menuId, questions, onChange }: { menuId: string; questions: Question[]; onChange: (q: Question[]) => void }) {
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
            className="vid-input"
            style={{ ...input, flex: 1, height: 32 }}
          />
          <button onClick={() => remove(q.id)} aria-label="削除" style={{ flex: "none", width: 32, height: 32, cursor: "pointer", color: "var(--color-neutral-500)", background: "transparent", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}>
            <Trash size={13} />
          </button>
        </div>
      ))}
      <button onClick={add} style={{ alignSelf: "flex-start", ...smallBtn, height: 30 }}>
        ＋質問を追加
      </button>
    </div>
  );
}

function LoginInfoCard({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [editingEmail, setEditingEmail] = useState(false);
  const [editingPw, setEditingPw] = useState(false);
  const [nextEmail, setNextEmail] = useState(initialEmail);
  const [curPw, setCurPw] = useState("");
  const [nextPw, setNextPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveEmail() {
    if (saving) return;
    setError("");
    if (!nextEmail.trim()) return setError("メールアドレスを入力してください");
    setSaving(true);
    try {
      await updateLoginEmail(nextEmail.trim());
      setEmail(nextEmail.trim());
      setEditingEmail(false);
      setDone("確認メールを新しいアドレスに送信しました。リンクを開くと切り替わります。");
    } catch (e) {
      setError(errorMessage(e, "変更できませんでした"));
    } finally {
      setSaving(false);
    }
  }

  async function savePassword() {
    if (saving) return;
    setError("");
    if (nextPw.length < 8) return setError("新しいパスワードは8文字以上にしてください");
    if (nextPw !== confirmPw) return setError("新しいパスワードが一致しません");
    setSaving(true);
    try {
      await updateLoginPassword(curPw, nextPw);
      setEditingPw(false);
      setCurPw("");
      setNextPw("");
      setConfirmPw("");
      setDone("パスワードを変更しました。");
    } catch (e) {
      setError(errorMessage(e, "変更できませんでした"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 15 }}>ログイン情報</div>
        <InfoTooltip text="この管理画面に入るためのメールアドレスとパスワードです。書類には使いません。" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 13px", borderRadius: "var(--radius-md)", background: "var(--color-bg)", border: "1px solid var(--color-divider)" }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={label}>メールアドレス</span>
            <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email}</span>
          </div>
          <button onClick={() => { setEditingEmail((v) => !v); setEditingPw(false); setError(""); setDone(""); }} style={smallBtn}>変更</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 13px", borderRadius: "var(--radius-md)", background: "var(--color-bg)", border: "1px solid var(--color-divider)" }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={label}>パスワード</span>
            <span style={{ fontSize: 13, letterSpacing: "0.12em" }}>••••••••</span>
          </div>
          <button onClick={() => { setEditingPw((v) => !v); setEditingEmail(false); setError(""); setDone(""); }} style={smallBtn}>変更</button>
        </div>
      </div>

      {editingEmail && (
        <div style={{ display: "flex", flexDirection: "column", gap: 9, padding: 13, borderRadius: "var(--radius-md)", background: "var(--color-bg)", border: "1px solid var(--color-accent-800)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={label}>新しいメールアドレス</span>
            <input value={nextEmail} onChange={(e) => setNextEmail(e.target.value)} className="vid-input" style={input} />
          </div>
          {error && <span style={{ fontSize: 11.5, color: "var(--color-accent-200)" }}>{error}</span>}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={saveEmail} disabled={saving} style={{ ...smallBtn, height: 34 }}>{saving ? "保存中…" : "変更を保存"}</button>
            <button onClick={() => { setEditingEmail(false); setNextEmail(email); setError(""); }} style={{ ...smallBtn, color: "var(--color-neutral-400)", borderColor: "var(--color-divider)" }}>キャンセル</button>
          </div>
        </div>
      )}

      {editingPw && (
        <div style={{ display: "flex", flexDirection: "column", gap: 9, padding: 13, borderRadius: "var(--radius-md)", background: "var(--color-bg)", border: "1px solid var(--color-accent-800)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={label}>現在のパスワード</span>
              <input type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} className="vid-input" style={input} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={label}>新しいパスワード</span>
              <input type="password" value={nextPw} onChange={(e) => setNextPw(e.target.value)} placeholder="8文字以上" className="vid-input" style={input} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={label}>確認のため再入力</span>
              <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} className="vid-input" style={input} />
            </div>
          </div>
          {error && <span style={{ fontSize: 11.5, color: "var(--color-accent-200)" }}>{error}</span>}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={savePassword} disabled={saving} style={{ ...smallBtn, height: 34 }}>{saving ? "保存中…" : "変更を保存"}</button>
            <button onClick={() => { setEditingPw(false); setCurPw(""); setNextPw(""); setConfirmPw(""); setError(""); }} style={{ ...smallBtn, color: "var(--color-neutral-400)", borderColor: "var(--color-divider)" }}>キャンセル</button>
          </div>
        </div>
      )}

      {done && !editingEmail && !editingPw && <span style={{ fontSize: 11.5, color: "var(--color-accent-300)" }}>{done}</span>}
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

const REFUND_STAGES: { key: RefundStage; label: string; when: string }[] = [
  { key: "prequote", label: "見積提示前のキャンセル", when: "見積を出す前の相談段階" },
  { key: "accepted", label: "見積承諾後・着手前", when: "承諾はあったが、まだ「着手する」を押していない" },
  { key: "started", label: "着手後のキャンセル", when: "「着手する」を押した後・完了報告の前" },
  { key: "delivered", label: "完了後の返金", when: "完了報告のあと。品質不備などがあれば受付が判断" },
  { key: "terminate", label: "大幅な遅延・担当終了", when: "対応の目安を過ぎても未完了の場合、依頼主を保護" },
];

const REFUND_MODES: { value: RefundMode; label: string }[] = [
  { value: "nocharge", label: "請求なし" },
  { value: "full", label: "全額返金" },
  { value: "partial", label: "部分返金" },
  { value: "none", label: "返金なし" },
];

function refundModeLabel(mode: RefundMode, pct: number): string {
  const found = REFUND_MODES.find((m) => m.value === mode);
  const base = found?.label ?? mode;
  return mode === "partial" ? `${base}（${pct}%）` : base;
}

function RefundPolicyCard({ orgId, initialPolicy }: { orgId: string; initialPolicy: RefundPolicyRow[] }) {
  const makeRows = () =>
    REFUND_STAGES.map((s) => {
      const found = initialPolicy.find((p) => p.stage === s.key);
      return { ...s, mode: found?.mode ?? ("none" as RefundMode), pct: found?.pct ?? 0 };
    });
  const [saved, setSaved] = useState(makeRows);
  const [rows, setRows] = useState(saved);
  const [editing, setEditing] = useState(false);

  function patch(i: number, p: Partial<{ mode: RefundMode; pct: number }>) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...p } : row)));
  }

  async function commit(row: (typeof rows)[number]) {
    await updateRefundPolicy(orgId, row.key, row.mode, row.pct);
    setSaved((r) => r.map((s) => (s.key === row.key ? row : s)));
  }

  return (
    <div style={card}>
      <CardHeader
        title="キャンセル・返金ポリシー"
        info="段階は依頼の進み方で決まるため固定です。受付が決めるのは、それぞれの段階の返金の扱いと割合だけです。"
        editing={editing}
        onEdit={() => { setRows(saved); setEditing(true); }}
      />

      {!editing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {saved.map((r) => (
            <InfoRow key={r.key} label={r.label} value={refundModeLabel(r.mode, r.pct)} labelWidth={168} />
          ))}
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rows.map((r, i) => (
              <div
                key={r.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 10,
                  padding: "12px 14px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--color-neutral-800)",
                  border: "1px solid var(--color-divider)",
                }}
              >
                <div style={{ minWidth: 180, flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 12.5 }}>{r.label}</span>
                  <span style={{ fontSize: 10.5, color: "var(--color-neutral-500)" }}>{r.when}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "none" }}>
                  <select
                    value={r.mode}
                    onChange={(e) => { const mode = e.target.value as RefundMode; patch(i, { mode }); commit({ ...r, mode }); }}
                    className="vid-input"
                    style={{ ...input, width: 140, height: 34 }}
                  >
                    {REFUND_MODES.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                  {r.mode === "partial" && (
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <input
                        type="number"
                        value={r.pct}
                        onChange={(e) => patch(i, { pct: Number(e.target.value) })}
                        onBlur={() => commit(rows[i])}
                        className="vid-input"
                        style={{ ...input, width: 60, height: 34 }}
                      />
                      <span style={{ fontSize: 11.5, color: "var(--color-neutral-500)" }}>%</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 9, padding: "11px 13px", borderRadius: "var(--radius-md)", background: "var(--color-neutral-800)", border: "1px solid var(--color-divider)" }}>
            <div style={{ minWidth: 0, fontSize: 11.5, color: "var(--color-neutral-400)", lineHeight: 1.6 }}>
              「着手」の定義：受付が対象の案件で「着手する」を押した時点です。押していなければ未着手として扱われ、キャンセル時は原則全額返金になります。
            </div>
          </div>

          <button onClick={() => setEditing(false)} style={{ ...smallBtn, height: 36, alignSelf: "flex-start", color: "var(--color-neutral-400)", borderColor: "var(--color-divider)" }}>
            閉じる
          </button>
        </>
      )}
    </div>
  );
}
