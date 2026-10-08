"use client";

import { useState } from "react";
import { Trash } from "@phosphor-icons/react";
import { headingWeight } from "@/lib/style";
import { errorMessage } from "@/lib/errors";
import { createCaseRequest } from "@/app/actions";
import InfoTooltip from "@/components/InfoTooltip";
import type { SubscriptionCadence } from "@/lib/supabase/types";

export interface MenuOption {
  id: string;
  label: string;
  note: string | null;
  price: number | null;
  payout: number;
  leadHours: number;
}

export interface CustomItem {
  label: string;
  price: number;
  qty: number;
  leadHours: number | null;
}

function hoursToDueLabel(hours: number): string {
  if (hours <= 24) return "24時間以内";
  return `${Math.ceil(hours / 24)}日後`;
}

function pillStyle(active: boolean): React.CSSProperties {
  return {
    height: 30,
    padding: "0 12px",
    cursor: "pointer",
    fontSize: 12,
    whiteSpace: "nowrap",
    color: active ? "var(--color-accent-100)" : "var(--color-neutral-400)",
    background: active ? "var(--color-accent-900)" : "transparent",
    border: "1px solid",
    borderColor: active ? "var(--color-accent-800)" : "var(--color-divider)",
    borderRadius: "var(--radius-md)",
  };
}

// 時間精算の単価は30分3,000円（＝時給6,000円）で固定。見積もり時は
// スタッフが目安時間を入れるだけで、上限額（これ以上は請求しない額）を
// 自動計算する。実際の請求額の計算（30分単位切り上げ・最低3,000円）は
// finalize_hourly_billing（DB関数）側で、ここと同じ単価を使って行う。
const HOURLY_BLOCK_MINUTES = 30;
const HOURLY_BLOCK_RATE = 3000;
const HOURLY_RATE_PER_HOUR = HOURLY_BLOCK_RATE * (60 / HOURLY_BLOCK_MINUTES);

function capFromEstimatedHours(hours: number): number {
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  const blocks = Math.ceil((hours * 60) / HOURLY_BLOCK_MINUTES);
  return blocks * HOURLY_BLOCK_RATE;
}

const smallBtn: React.CSSProperties = {
  height: 30,
  padding: "0 10px",
  cursor: "pointer",
  fontSize: 11.5,
  color: "var(--color-neutral-400)",
  background: "transparent",
  border: "1px solid var(--color-divider)",
  borderRadius: "var(--radius-md)",
};

const stepperBtn: React.CSSProperties = {
  flex: "none",
  width: 24,
  height: 24,
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  fontSize: 14,
  color: "var(--color-accent)",
  background: "transparent",
  border: "1px solid var(--color-divider)",
  borderRadius: "var(--radius-sm)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 36,
  padding: "0 10px",
  font: "inherit",
  fontSize: 13,
  color: "var(--color-text)",
  background: "var(--color-bg)",
  border: "1px solid var(--color-divider)",
  borderRadius: "var(--radius-md)",
  outline: "none",
};

export default function QuoteDialog({
  threadId,
  customerId,
  menus,
  onClose,
  onCreated,
  title = "見積もりを発行",
  description = "このトークの内容を正式な依頼にします。発行するとトークに見積もりカードが入ります。",
  initialCustomItems,
  initialCadence,
}: {
  threadId: string;
  customerId: string;
  menus: MenuOption[];
  onClose: () => void;
  onCreated: (requestId: string) => void;
  title?: string;
  description?: string;
  // 完了済みの案件から「この内容で定期を提案」する時など、過去の項目を
  // そのまま引き継いで表示するための初期値（メニューが変わっている・
  // 非公開になっている場合もあるので、メニューIDではなく項目そのものを
  // 複製する）。
  initialCustomItems?: CustomItem[];
  initialCadence?: SubscriptionCadence;
}) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [customItems, setCustomItems] = useState<CustomItem[]>(initialCustomItems ?? []);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customLabel, setCustomLabel] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [customQty, setCustomQty] = useState("1");
  const [customLeadHours, setCustomLeadHours] = useState("");
  const [note, setNote] = useState("");
  const [saveAsMenu, setSaveAsMenu] = useState(false);
  const [isHourly, setIsHourly] = useState(false);
  const [cadence, setCadence] = useState<SubscriptionCadence | "">(initialCadence ?? "");
  const [anchorWeekday, setAnchorWeekday] = useState<number | null>(null);
  const [anchorDayOfMonth, setAnchorDayOfMonth] = useState("");
  const [anchorLastDayOfMonth, setAnchorLastDayOfMonth] = useState(false);
  const [estimatedHours, setEstimatedHours] = useState("");
  const [hourlyLabel, setHourlyLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function bump(menuId: string, delta: number) {
    setQty((q) => ({ ...q, [menuId]: Math.max(0, (q[menuId] ?? 0) + delta) }));
  }

  function addCustomItem() {
    const price = Number(customPrice);
    const qty = Math.max(1, Math.round(Number(customQty) || 1));
    const leadHours = customLeadHours.trim() ? Math.max(1, Math.round(Number(customLeadHours))) : null;
    if (!customLabel.trim() || !Number.isFinite(price) || price < 0) return;
    setCustomItems((rows) => [...rows, { label: customLabel.trim(), price, qty, leadHours }]);
    setCustomLabel("");
    setCustomPrice("");
    setCustomQty("1");
    setCustomLeadHours("");
  }

  function bumpCustomQty(index: number, delta: number) {
    setCustomItems((rows) => rows.map((r, i) => (i === index ? { ...r, qty: Math.max(1, r.qty + delta) } : r)));
  }

  // 金額が未設定（相談項目としてだけ使う）受付メニューは見積もりの候補には出さない。
  const priceableMenus = menus.filter((m): m is MenuOption & { price: number } => m.price != null);
  const menuItems = priceableMenus.filter((m) => (qty[m.id] ?? 0) > 0).map((m) => ({ menuId: m.id as string | null, label: m.label, price: m.price, payout: m.payout, qty: qty[m.id], leadHours: m.leadHours as number | null }));
  const allItems = [
    ...menuItems,
    ...customItems.map((c) => ({ menuId: null as string | null, label: c.label, price: c.price, payout: 0, qty: c.qty, leadHours: c.leadHours })),
  ];
  const itemsTotal = allItems.reduce((sum, it) => sum + it.price * it.qty, 0);
  const hourlyCap = capFromEstimatedHours(Number(estimatedHours));
  const total = isHourly ? hourlyCap : itemsTotal;
  // 同じ項目を複数個頼むと、その分準備に時間がかかる想定で数量に比例させる
  // （項目ごとの目安時間 × 数量）。違う項目同士は並行して進む前提でmaxを取る。
  const knownLeadHours = allItems.map((it) => (it.leadHours != null ? it.leadHours * it.qty : null)).filter((h): h is number => h != null);
  const due = knownLeadHours.length > 0 ? hoursToDueLabel(Math.max(...knownLeadHours)) : "";
  const canSubmit = isHourly ? hourlyCap > 0 : allItems.length > 0;

  async function submit() {
    if (saving || !canSubmit) return;
    setError("");
    setSaving(true);
    try {
      const requestId = await createCaseRequest(threadId, customerId, {
        items: allItems,
        note,
        due,
        saveAsMenu,
        hourly: isHourly ? { rate: HOURLY_RATE_PER_HOUR, cap: hourlyCap, label: hourlyLabel } : undefined,
        cadence: !isHourly && cadence ? cadence : undefined,
        anchorWeekday: !isHourly && cadence === "weekly" && anchorWeekday != null ? anchorWeekday : undefined,
        anchorDayOfMonth: !isHourly && cadence === "monthly" && !anchorLastDayOfMonth && anchorDayOfMonth.trim() ? Number(anchorDayOfMonth) : undefined,
        anchorLastDayOfMonth: !isHourly && cadence === "monthly" && anchorLastDayOfMonth ? true : undefined,
      });
      onCreated(requestId);
    } catch (e) {
      setError(errorMessage(e, "作成できませんでした"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, display: "grid", placeItems: "center", padding: 20, background: "color-mix(in srgb, var(--color-bg) 72%, transparent)" }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(480px, 100%)", maxHeight: "85vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, padding: 20, borderRadius: "var(--radius-lg)", background: "var(--color-surface)", border: "1px solid var(--color-divider)", boxShadow: "var(--shadow-lg)" }}
      >
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 16 }}>{title}</div>
        <div style={{ fontSize: 11.5, color: "var(--color-neutral-500)", lineHeight: 1.6 }}>{description}</div>

        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setIsHourly(false)} style={pillStyle(!isHourly)}>
            メニューから選ぶ
          </button>
          <button
            onClick={() => {
              setIsHourly(true);
              setCadence("");
            }}
            style={pillStyle(isHourly)}
          >
            時間精算（メニューに無い依頼）
          </button>
        </div>

        {isHourly ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontSize: 10.5, color: "var(--color-neutral-500)" }}>件名</span>
              <input value={hourlyLabel} onChange={(e) => setHourlyLabel(e.target.value)} placeholder="例：資料のフォーマット整え" className="vid-input" style={inputStyle} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 10.5, color: "var(--color-neutral-500)" }}>目安時間（時間）</span>
                <InfoTooltip
                  text={`時間単価は30分${HOURLY_BLOCK_RATE.toLocaleString("ja-JP")}円（時給${HOURLY_RATE_PER_HOUR.toLocaleString("ja-JP")}円）で固定です。目安時間から自動計算した上限額を依頼主に見積もりとして提示し、実際の請求額（着手〜完了報告の時間を30分単位で切り上げ・最低3,000円）がこれを超えることはありません。`}
                />
              </div>
              <input value={estimatedHours} onChange={(e) => setEstimatedHours(e.target.value)} type="number" min={0.5} step={0.5} placeholder="例：2" className="vid-input" style={{ ...inputStyle, maxWidth: 140 }} />
            </div>
            {hourlyCap > 0 && <div style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>上限額：¥{hourlyCap.toLocaleString("ja-JP")}</div>}
          </div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ flex: 1, fontSize: 11, color: "var(--color-neutral-500)" }}>受付メニュー</span>
                <button onClick={() => setShowCustomForm((v) => !v)} style={{ ...smallBtn, height: 26 }}>
                  ＋項目を追加
                </button>
              </div>
              {priceableMenus.length === 0 && <div style={{ fontSize: 11.5, color: "var(--color-neutral-500)" }}>金額の設定されたメニューがありません。</div>}
              {priceableMenus.map((m) => (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-divider)" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.label}</div>
                    <div style={{ fontSize: 10.5, color: "var(--color-neutral-500)" }}>
                      ¥{m.price.toLocaleString("ja-JP")}・納期{m.leadHours}時間
                    </div>
                  </div>
                  <button onClick={() => bump(m.id, -1)} disabled={!qty[m.id]} style={stepperBtn}>
                    −
                  </button>
                  <span style={{ width: 20, textAlign: "center", fontSize: 13 }}>{qty[m.id] ?? 0}</span>
                  <button onClick={() => bump(m.id, 1)} style={stepperBtn}>
                    ＋
                  </button>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {showCustomForm && (
                <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 10.5, color: "var(--color-neutral-500)" }}>件名</span>
                    <input value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} className="vid-input" style={inputStyle} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, width: 100 }}>
                    <span style={{ fontSize: 10.5, color: "var(--color-neutral-500)" }}>金額</span>
                    <input value={customPrice} onChange={(e) => setCustomPrice(e.target.value)} type="number" min={0} className="vid-input" style={inputStyle} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, width: 64 }}>
                    <span style={{ fontSize: 10.5, color: "var(--color-neutral-500)" }}>数量</span>
                    <input value={customQty} onChange={(e) => setCustomQty(e.target.value)} type="number" min={1} className="vid-input" style={inputStyle} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, width: 90 }}>
                    <span style={{ fontSize: 10.5, color: "var(--color-neutral-500)" }}>目安時間(h)・任意</span>
                    <input value={customLeadHours} onChange={(e) => setCustomLeadHours(e.target.value)} type="number" min={1} placeholder="なし" className="vid-input" style={inputStyle} />
                  </div>
                  <button onClick={addCustomItem} style={{ ...smallBtn, height: 36 }}>
                    追加
                  </button>
                </div>
              )}
              {customItems.map((c, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                  <span style={{ flex: 1, minWidth: 0 }}>{c.label}</span>
                  <span style={{ color: "var(--color-neutral-500)" }}>
                    ¥{c.price.toLocaleString("ja-JP")}
                    {c.leadHours != null && `・納期${c.leadHours}時間`}
                  </span>
                  <button onClick={() => bumpCustomQty(i, -1)} disabled={c.qty <= 1} style={stepperBtn}>
                    −
                  </button>
                  <span style={{ width: 20, textAlign: "center" }}>{c.qty}</span>
                  <button onClick={() => bumpCustomQty(i, 1)} style={stepperBtn}>
                    ＋
                  </button>
                  <button onClick={() => setCustomItems((rows) => rows.filter((_, j) => j !== i))} style={{ display: "flex", cursor: "pointer", color: "var(--color-neutral-500)", background: "transparent", border: "none" }}>
                    <Trash size={12} />
                  </button>
                </div>
              ))}
              {customItems.length > 0 && (
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--color-neutral-400)" }}>
                  <input type="checkbox" checked={saveAsMenu} onChange={(e) => setSaveAsMenu(e.target.checked)} />
                  この内容を受付メニューにも追加する
                </label>
              )}
            </div>
          </>
        )}

        {!isHourly && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 10, borderTop: "1px solid var(--color-divider)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>頻度</span>
              <InfoTooltip text="定期対応（毎週・毎月）はチャージ残高からのお支払いのみです。依頼主が初回を確定すると、以降は自動で案件が作られ、残高から引き落とされます（着手は毎回担当者が手動で行います）。" />
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setCadence("")} style={pillStyle(cadence === "")}>
                単発
              </button>
              <button onClick={() => setCadence("weekly")} style={pillStyle(cadence === "weekly")}>
                毎週
              </button>
              <button onClick={() => setCadence("monthly")} style={pillStyle(cadence === "monthly")}>
                毎月
              </button>
            </div>
            {cadence === "weekly" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 10.5, color: "var(--color-neutral-600)" }}>曜日を指定（任意・無指定なら初回決済日から7日ごと）</span>
                <div style={{ display: "flex", gap: 4 }}>
                  {["日", "月", "火", "水", "木", "金", "土"].map((label, i) => (
                    <button key={i} onClick={() => setAnchorWeekday((v) => (v === i ? null : i))} style={{ ...pillStyle(anchorWeekday === i), minWidth: 30, padding: "0 6px" }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {cadence === "monthly" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 10.5, color: "var(--color-neutral-600)" }}>日付を指定（任意。無指定なら初回決済日から1ヶ月ごと）</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    value={anchorDayOfMonth}
                    onChange={(e) => {
                      setAnchorDayOfMonth(e.target.value);
                      setAnchorLastDayOfMonth(false);
                    }}
                    disabled={anchorLastDayOfMonth}
                    type="number"
                    min={1}
                    max={28}
                    placeholder="例）25"
                    className="vid-input"
                    style={{ ...inputStyle, width: 90, opacity: anchorLastDayOfMonth ? 0.5 : 1 }}
                  />
                  <button
                    onClick={() => {
                      setAnchorLastDayOfMonth((v) => !v);
                      setAnchorDayOfMonth("");
                    }}
                    style={{ ...pillStyle(anchorLastDayOfMonth), minWidth: 56 }}
                  >
                    月末
                  </button>
                </div>
                {!anchorLastDayOfMonth && <span style={{ fontSize: 10, color: "var(--color-neutral-600)" }}>29〜31日は月によって無いため、「月末」を使ってください</span>}
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 10, borderTop: "1px solid var(--color-divider)" }}>
          <span style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>支払い：残高から依頼主が確定</span>
          <InfoTooltip text="依頼主が見積もりカードから直接「残高から支払う」ことで確定します。支払いが確定すると「着手前」になり、着手はこの後、担当者が案件詳細の「着手する」を押して行います。" />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 10, borderTop: "1px solid var(--color-divider)" }}>
          {due && (
            <div style={{ fontSize: 12.5 }}>
              対応の目安：{due}
              <span style={{ marginLeft: 6, fontSize: 10.5, color: "var(--color-neutral-500)" }}>（選んだ項目の目安時間から自動計算）</span>
            </div>
          )}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="補足メモ（依頼主にも表示されます）任意"
            rows={2}
            className="vid-input"
            style={{ ...inputStyle, height: "auto", padding: "8px 10px", resize: "none" }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 8, borderTop: "1px solid var(--color-divider)" }}>
          <span style={{ fontSize: 12, color: "var(--color-neutral-500)" }}>{isHourly ? "上限額（依頼主に表示）" : "請求額（依頼主に表示）"}</span>
          <span style={{ fontSize: 18, fontFamily: "var(--font-heading)", fontWeight: 600 }}>¥{total.toLocaleString("ja-JP")}</span>
        </div>

        {error && <span style={{ fontSize: 11.5, color: "var(--color-accent-200)" }}>{error}</span>}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={submit} disabled={saving || !canSubmit} style={{ ...smallBtn, height: 36, color: "var(--color-accent-100)", background: "var(--color-accent-900)" }}>
            {saving ? "送信中…" : "見積もりを送る"}
          </button>
          <button onClick={onClose} style={{ ...smallBtn, height: 36, color: "var(--color-neutral-400)", borderColor: "var(--color-divider)" }}>
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
