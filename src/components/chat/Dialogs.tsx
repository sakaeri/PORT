"use client";

import { X, Timer } from "@phosphor-icons/react";
import type { RequestBundle } from "@/lib/chat-types";
import { yen, timeLabel } from "@/lib/format";
import { stageInfoFor, statusBadgeFor, STAGE_LABELS } from "@/lib/stage";
import { headingWeight } from "@/lib/style";

const scrim: React.CSSProperties = { position: "fixed", inset: 0, background: "var(--stb-scrim)", zIndex: 50 };
const dialogBox: React.CSSProperties = {
  width: "min(440px, 100%)",
  maxHeight: "calc(100vh - 32px)",
  overflowY: "auto",
  position: "relative",
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
export function ProgressPanel({
  bundles,
  onClose,
  onCancel,
}: {
  bundles: RequestBundle[];
  onClose: () => void;
  onCancel: (id: string) => void;
}) {
  const active = bundles.filter((b) => b.request.phase !== "declined");
  const quoted = active.filter((b) => b.request.phase === "quoted").length;
  const preparing = active.filter((b) => b.request.phase === "preparing").length;
  const inProgress = active.filter((b) => b.request.phase === "started").length;
  const parts = [quoted && `見積もり待ち ${quoted}件`, preparing && `着手前 ${preparing}件`, inProgress && `対応中 ${inProgress}件`].filter(Boolean);
  const headline = (parts.length ? parts.join("／") + "　" : "") + "同時にお受けできるのは3件までです";
  // 完了した依頼は「報告書一覧」で、見送った依頼はここに出しても意味がない
  // ため、進捗状況からは消す。
  const items = bundles.filter((b) => !["draft", "completed", "declined"].includes(b.request.phase)).slice().reverse();

  return (
    <Centered onBackdrop={onClose}>
      <button onClick={onClose} aria-label="閉じる" style={{ position: "absolute", top: 14, right: 14, width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--color-neutral-500)", background: "transparent", border: "none" }}>
        <X size={16} />
      </button>
      <div style={{ ...dialogTitle, position: "relative" }}>進捗状況</div>
      <div style={{ fontSize: 11.5, color: "var(--color-neutral-600)" }}>{headline}</div>
      {items.length === 0 ? (
        <div style={{ fontSize: 13.5, opacity: 0.8, lineHeight: 1.6 }}>進行中の依頼はまだありません。チャットで頼みごとを送ると、見積もり後にここで進捗を追えます。</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 420, overflowY: "auto" }}>
          {items.map(({ request: r, items: lineItems }) => {
              const badge = statusBadgeFor(r);
              const stage = stageInfoFor(r);
              const canCancel = r.phase === "quoted";
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
                      {r.phase === "completed"
                        ? "完了しました"
                        : r.phase === "declined"
                          ? "費用は発生していません"
                          : r.phase === "cancelled"
                            ? `${yen(r.refunded_amount)} 返金済み`
                            : lineItems[0]?.label ?? ""}
                    </span>
                    <span style={{ flex: "none" }}>{yen(r.amount)}</span>
                  </div>
                  {canCancel && (
                    <button onClick={() => onCancel(r.id)} style={{ height: 34, cursor: "pointer", fontSize: 12.5, color: "var(--color-text)", background: "transparent", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}>
                      この見積もりを見送る
                    </button>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </Centered>
  );
}

// ---------- キャンセルダイアログ ----------
// 決済が発生した依頼のキャンセル・返金は一切行わない方針のため、ここで
// キャンセルできるのは見積もり段階（まだ入金前）だけ。
export function CancelDialog({
  onClose,
  onConfirm,
  confirming,
}: {
  onClose: () => void;
  onConfirm: () => void;
  confirming: boolean;
}) {
  return (
    <Centered onBackdrop={onClose}>
      <div style={dialogTitle}>見積もりを見送りますか？</div>
      <div style={{ fontSize: 14, lineHeight: 1.6, opacity: 0.85 }}>まだ決済前のため、費用は発生しません。この見積もりを見送ります。</div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
        <button onClick={onClose} style={ghostBtn}>依頼を続ける</button>
        <button onClick={onConfirm} disabled={confirming} style={{ ...accentBtn, opacity: confirming ? 0.6 : 1 }}>
          {confirming ? "処理中…" : "見積もりを見送る"}
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

