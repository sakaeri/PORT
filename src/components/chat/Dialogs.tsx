"use client";

import { useState } from "react";
import { X, Timer } from "@phosphor-icons/react";
import type { RequestBundle } from "@/lib/chat-types";
import { yen, timeLabel } from "@/lib/format";
import { stageInfoFor, statusBadgeFor, STAGE_LABELS } from "@/lib/stage";
import { computeRefund, type RefundResult } from "@/lib/refund";
import type { MenuRow } from "@/lib/chat-types";
import type { Database } from "@/lib/supabase/types";
import { headingWeight } from "@/lib/style";
import LoginPanel from "@/components/chat/LoginPanel";

type RefundPolicyRow = Database["public"]["Tables"]["refund_policies"]["Row"];

const scrim: React.CSSProperties = { position: "fixed", inset: 0, background: "var(--stb-scrim)", zIndex: 50 };
const dialogBox: React.CSSProperties = {
  width: "min(440px, 100%)",
  maxHeight: "calc(100vh - 32px)",
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: 20,
  borderRadius: "var(--radius-lg)",
  background: "var(--color-surface)",
  boxShadow: "var(--shadow-lg)",
};
const dialogTitle: React.CSSProperties = { fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 20 };
const ghostBtn: React.CSSProperties = { height: 36, padding: "0 14px", cursor: "pointer", color: "var(--color-text)", background: "transparent", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" };
const accentBtn: React.CSSProperties = { height: 36, padding: "0 14px", cursor: "pointer", whiteSpace: "nowrap", color: "var(--color-accent)", background: "transparent", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)" };

function Centered({ onBackdrop, children }: { onBackdrop: () => void; children: React.ReactNode }) {
  return (
    <div style={{ ...scrim, display: "grid", placeItems: "center", padding: "var(--space-4)" }} onClick={onBackdrop}>
      <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={dialogBox}>
        {children}
      </div>
    </div>
  );
}

// ---------- 進捗状況パネル ----------
export function ProgressPanel({ bundles, onClose, onCancel }: { bundles: RequestBundle[]; onClose: () => void; onCancel: (id: string) => void }) {
  const active = bundles.filter((b) => b.request.phase !== "declined");
  const quoted = active.filter((b) => b.request.phase === "quoted").length;
  const preparing = active.filter((b) => b.request.phase === "preparing").length;
  const inProgress = active.filter((b) => ["started", "approved"].includes(b.request.phase)).length;
  const parts = [quoted && `見積もり待ち ${quoted}件`, preparing && `着手前 ${preparing}件`, inProgress && `対応中 ${inProgress}件`].filter(Boolean);
  const headline = (parts.length ? parts.join("／") + "　" : "") + "同時にお受けできるのは3件までです";
  const items = bundles.filter((b) => b.request.phase !== "draft").slice().reverse();

  return (
    <div style={{ ...scrim, display: "flex", justifyContent: "flex-end" }} onClick={onClose}>
      <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ width: "min(400px, 100%)", height: "100%", display: "flex", flexDirection: "column", gap: 12, padding: 18, background: "var(--color-surface)", boxShadow: "var(--shadow-lg)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 19, flex: 1 }}>進捗状況</div>
          <button onClick={onClose} aria-label="閉じる" style={{ width: 28, height: 28, flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--color-neutral-500)", background: "transparent", border: "none" }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--color-neutral-600)" }}>{headline}</div>
        {items.length === 0 ? (
          <div style={{ fontSize: 13.5, opacity: 0.8, lineHeight: 1.6 }}>進行中の依頼はまだありません。チャットで頼みごとを送ると、見積もり後にここで進捗を追えます。</div>
        ) : (
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
            {items.map(({ request: r, items: lineItems }) => {
              const badge = statusBadgeFor(r);
              const stage = stageInfoFor(r);
              const canCancel = r.phase === "quoted" || ["preparing", "started", "approved"].includes(r.phase);
              return (
                <div key={r.id} style={{ display: "flex", flexDirection: "column", gap: 9, padding: 13, borderRadius: "var(--radius-md)", background: "var(--color-bg)", border: "1px solid var(--color-divider)" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ minWidth: 0, flex: 1, fontFamily: "var(--font-heading)", fontSize: 14.5, lineHeight: 1.35 }}>{r.title}</div>
                    <span style={{ flex: "none", fontSize: 10.5, padding: "3px 9px", borderRadius: 6, whiteSpace: "nowrap", color: badge.color, background: badge.bg, border: `1px solid ${badge.edge}` }}>{badge.label}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {STAGE_LABELS.map((_, i) => (
                      <span key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i < stage.stageIndex ? (r.phase === "cancelled" ? "var(--color-neutral-600)" : "var(--color-accent-500)") : "var(--color-neutral-800)" }} />
                    ))}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {stage.steps.map((s, i) => {
                      const color = s.state === "done" || s.state === "muted" ? "var(--color-accent-300)" : s.state === "current" ? "var(--color-neutral-400)" : "var(--color-neutral-600)";
                      const icon = s.state === "done" || s.state === "muted" ? (r.phase === "cancelled" || r.phase === "declined" ? "ph-fill ph-x-circle" : "ph-fill ph-check-circle") : s.state === "current" ? "ph ph-circle-dashed" : "ph ph-circle";
                      return (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color }}>
                          <i className={icon} style={{ flex: "none", fontSize: 15 }} />
                          <span style={{ minWidth: 0, flex: 1 }}>{s.label}</span>
                          <span style={{ flex: "none", fontSize: 10.5, color: "var(--color-neutral-600)" }}>{s.at ? timeLabel(s.at) : ""}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: "var(--color-neutral-500)" }}>
                    <Timer size={13} />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      {r.phase === "completed" ? "完了しました" : r.phase === "declined" ? "費用は発生していません" : r.phase === "cancelled" ? `${yen(r.refunded_amount)} 返金済み` : lineItems[0]?.label ?? ""}
                    </span>
                    <span style={{ flex: "none" }}>{yen(r.amount)}</span>
                  </div>
                  {canCancel && (
                    <button onClick={() => onCancel(r.id)} style={{ height: 34, cursor: "pointer", fontSize: 12.5, color: "var(--color-text)", background: "transparent", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}>
                      {r.phase === "quoted" ? "この見積もりを断る" : r.started_at ? `キャンセル（着手後のため50%返金 ${yen(Math.round(r.amount / 2))}）` : "全額返金してキャンセル"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- 支払いダイアログ ----------
export function PayDialog({
  price,
  needsProfile,
  hasGuestActivity,
  onClose,
  onConfirm,
  confirming,
}: {
  price: number;
  needsProfile: boolean;
  hasGuestActivity: boolean;
  onClose: () => void;
  onConfirm: (profile?: { name: string; email: string; phone: string }) => void;
  confirming: boolean;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const ready = !needsProfile || (name.trim() && email.trim());

  return (
    <Centered onBackdrop={onClose}>
      <div style={dialogTitle}>{needsProfile ? "お支払いの前に" : "お支払い"}</div>
      {needsProfile ? (
        <>
          <div style={{ fontSize: 14, opacity: 0.85, lineHeight: 1.6 }}>
            お名前は書類の宛名、メールアドレスは領収書と完了報告の送信先に使います。この見積もりのお支払いに進むために一度だけご登録ください。
          </div>
          <LoginPanel hasGuestActivity={hasGuestActivity} />
          <div>
            <label style={{ display: "block", fontSize: 12, marginBottom: 5, color: "var(--color-neutral-500)" }}>お名前</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="山田 太郎" className="vid-input" style={{ width: "100%", height: 36, padding: "6px 10px", fontSize: 14, color: "var(--color-text)", background: "var(--color-bg)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)", outline: "none" }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, marginBottom: 5, color: "var(--color-neutral-500)" }}>メールアドレス</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="vid-input" style={{ width: "100%", height: 36, padding: "6px 10px", fontSize: 14, color: "var(--color-text)", background: "var(--color-bg)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)", outline: "none" }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, marginBottom: 5, color: "var(--color-neutral-500)" }}>電話番号（任意）</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="vid-input" style={{ width: "100%", height: 36, padding: "6px 10px", fontSize: 14, color: "var(--color-text)", background: "var(--color-bg)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)", outline: "none" }} />
          </div>
        </>
      ) : (
        <div style={{ fontSize: 14, opacity: 0.85 }}>{yen(price)} を決済し、この見積もりで正式にご依頼します。</div>
      )}
      <div style={{ fontSize: 10.5, color: "var(--color-neutral-600)", lineHeight: 1.6 }}>
        カード決済は準備中です。今は「決済して依頼する」を押すと即時に確定します（本番はStripe Connect導入後に置き換わります）。
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
        <button onClick={onClose} style={ghostBtn}>閉じる</button>
        <button
          onClick={() => onConfirm(needsProfile ? { name, email, phone } : undefined)}
          disabled={confirming || !ready}
          style={{ ...accentBtn, opacity: confirming || !ready ? 0.6 : 1 }}
        >
          {confirming ? "処理中…" : needsProfile ? "登録してお支払いへ" : "決済して依頼する"}
        </button>
      </div>
    </Centered>
  );
}

// ---------- キャンセルダイアログ ----------
function cancelCopy(refund: RefundResult): { reason: string; confirmLabel: string } {
  if (refund.mode === "nocharge") return { reason: "まだ決済前のため、費用は発生しません。この見積もりを断ります。", confirmLabel: "見積もりを断る" };
  if (refund.stage === "terminate") return { reason: "お待たせしているため、全額返金の上キャンセルできます。", confirmLabel: "全額返金してキャンセル" };
  if (refund.mode === "full") return { reason: "まだ制作に着手していないため、全額返金の上キャンセルできます。", confirmLabel: "全額返金してキャンセル" };
  return { reason: "すでに対応が始まっているため、返金は決済額の50%になります。", confirmLabel: `${yen(refund.amount)} 返金してキャンセル` };
}

export function CancelDialog({
  bundle,
  refundPolicies,
  onClose,
  onConfirm,
  confirming,
}: {
  bundle: RequestBundle;
  refundPolicies: RefundPolicyRow[];
  onClose: () => void;
  onConfirm: () => void;
  confirming: boolean;
}) {
  const refund = computeRefund(bundle.request, refundPolicies);
  const copy = cancelCopy(refund);
  return (
    <Centered onBackdrop={onClose}>
      <div style={dialogTitle}>依頼をキャンセルしますか？</div>
      <div style={{ fontSize: 14, lineHeight: 1.6, opacity: 0.85 }}>{copy.reason}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "11px 12px", borderRadius: "var(--radius-md)", background: "var(--color-bg)", border: "1px solid var(--color-divider)" }}>
        <span style={{ flex: 1, fontSize: 12, color: "var(--color-neutral-500)" }}>返金額</span>
        <span style={{ fontFamily: "var(--font-heading)", fontSize: 19 }}>{yen(refund.amount)}</span>
        <span style={{ fontSize: 11.5, color: "var(--color-neutral-600)" }}>/ {refund.paid ? `${yen(refund.paid)} 決済済み` : "未決済"}</span>
      </div>
      <div style={{ fontSize: 11.5, lineHeight: 1.6, color: "var(--color-neutral-600)" }}>返金規定：対応開始前は全額、対応開始後は50%、対応が大幅に遅れている場合は全額をお返しします。</div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
        <button onClick={onClose} style={ghostBtn}>依頼を続ける</button>
        <button onClick={onConfirm} disabled={confirming} style={{ ...accentBtn, opacity: confirming ? 0.6 : 1 }}>
          {confirming ? "処理中…" : copy.confirmLabel}
        </button>
      </div>
    </Centered>
  );
}

// ---------- 報告書一覧 ----------
export function ReportsDialog({ bundles, ackedIds, onAck, onClose }: { bundles: RequestBundle[]; ackedIds: Set<string>; onAck: (id: string) => void; onClose: () => void }) {
  const list = bundles.filter((b) => b.request.phase === "completed" && b.report?.sent_at && !ackedIds.has(b.request.id));
  return (
    <Centered onBackdrop={onClose}>
      <button onClick={onClose} aria-label="閉じる" style={{ position: "absolute", top: 14, right: 14, width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--color-neutral-500)", background: "transparent", border: "none" }}>
        <X size={16} />
      </button>
      <div style={{ ...dialogTitle, position: "relative" }}>報告書一覧</div>
      {list.length === 0 ? (
        <div style={{ fontSize: 14, opacity: 0.85 }}>まだ完了した報告書はありません。</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 340, overflowY: "auto" }}>
          {list.map(({ request: r, report }) => (
            <div key={r.id} style={{ display: "flex", flexDirection: "column", gap: 6, padding: 12, borderRadius: "var(--radius-md)", background: "var(--color-bg)", border: "1px solid var(--color-divider)" }}>
              <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 14 }}>{r.title}</div>
              <div style={{ fontSize: 11, color: "var(--color-neutral-600)" }}>{report?.sent_at ? timeLabel(report.sent_at) : ""}</div>
              <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>{report?.summary}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {report?.details.map((d, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, fontSize: 12.5 }}>
                    <span style={{ color: "var(--color-neutral-500)", flex: "none", width: 64 }}>{d.label}</span>
                    <span>{d.value}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => onAck(r.id)} style={{ alignSelf: "flex-end", height: 29, padding: "0 12px", cursor: "pointer", fontSize: 12, color: "var(--color-bg)", background: "var(--color-accent-400)", border: "none", borderRadius: "var(--radius-md)" }}>
                確認済み
              </button>
            </div>
          ))}
        </div>
      )}
    </Centered>
  );
}

// ---------- メニューから問い合わせる ----------
export function MenuSheet({
  menus,
  onClose,
  onSubmit,
}: {
  menus: MenuRow[];
  onClose: () => void;
  onSubmit: (menu: MenuRow, rows: { label: string; value: string }[], note: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState<MenuRow | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!selected || submitting) return;
    setSubmitting(true);
    try {
      const rows = selected.menu_questions.map((q) => ({ label: q.label, value: fields[q.id] ?? "" }));
      await onSubmit(selected, rows, note);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Centered onBackdrop={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {!selected ? (
          <>
            <div style={dialogTitle}>メニューから問い合わせる</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--color-neutral-400)" }}>何から聞けばいいか迷うときの入口です。選んでもこの内容で確定にはなりません。</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {menus.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setSelected(m);
                    setFields({});
                    setNote("");
                  }}
                  style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left", cursor: "pointer", padding: "11px 13px", borderRadius: "var(--radius-md)", color: "var(--color-text)", background: "var(--color-bg)", border: "1px solid var(--color-divider)" }}
                >
                  {m.icon && <i className={m.icon} style={{ fontSize: 16, color: "var(--color-accent)", flex: "none" }} />}
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
                    <span style={{ fontSize: 13.5, lineHeight: 1.4 }}>{m.label}</span>
                    <span style={{ fontSize: 11, color: "var(--color-neutral-600)", lineHeight: 1.5 }}>{m.note}</span>
                  </div>
                </button>
              ))}
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--color-neutral-500)", paddingTop: 10, borderTop: "1px solid var(--color-divider)" }}>メニュー外のご相談は、チャットでお気軽にご相談ください。</div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={onClose} style={ghostBtn}>閉じる</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>お問い合わせ内容</span>
              <div style={dialogTitle}>{selected.label}</div>
              <span style={{ fontSize: 11.5, color: "var(--color-neutral-600)", lineHeight: 1.5 }}>{selected.note}</span>
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--color-neutral-400)" }}>わかる項目だけで大丈夫です。空欄のままでも送れます。</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {selected.menu_questions.map((q) => (
                <div key={q.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>{q.label}</label>
                  <input
                    value={fields[q.id] ?? ""}
                    onChange={(e) => setFields((f) => ({ ...f, [q.id]: e.target.value }))}
                    className="vid-input"
                    style={{ width: "100%", height: 36, padding: "6px 10px", font: "inherit", fontSize: 13.5, color: "var(--color-text)", background: "var(--color-bg)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)", outline: "none" }}
                  />
                </div>
              ))}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>そのほか伝えたいこと</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  className="vid-textarea"
                  style={{ width: "100%", resize: "vertical", padding: "8px 10px", font: "inherit", fontSize: 13.5, color: "var(--color-text)", background: "var(--color-bg)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)", outline: "none" }}
                />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <button onClick={() => setSelected(null)} style={ghostBtn}>戻る</button>
              <button onClick={submit} disabled={submitting} style={{ ...accentBtn, padding: "0 16px", opacity: submitting ? 0.6 : 1 }}>
                この内容で送る
              </button>
            </div>
          </>
        )}
      </div>
    </Centered>
  );
}
