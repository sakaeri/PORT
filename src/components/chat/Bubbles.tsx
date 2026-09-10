"use client";

import { useState } from "react";
import { BellRinging, Star, CheckCircle, MinusCircle } from "@phosphor-icons/react";
import type { AttachmentRow, MessageWithExtras, RequestBundle } from "@/lib/chat-types";
import { yen, timeLabel } from "@/lib/format";
import { stageInfoFor } from "@/lib/stage";
import { computeRefund } from "@/lib/refund";
import type { Database } from "@/lib/supabase/types";
import { headingWeight } from "@/lib/style";

type RefundPolicyRow = Database["public"]["Tables"]["refund_policies"]["Row"];

function fileIconClass(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "heic"].includes(ext)) return "ph ph-image";
  if (ext === "pdf") return "ph ph-file-pdf";
  if (["xls", "xlsx", "csv"].includes(ext)) return "ph ph-file-xls";
  if (["doc", "docx"].includes(ext)) return "ph ph-file-doc";
  if (["zip", "rar", "7z"].includes(ext)) return "ph ph-file-zip";
  if (["mp4", "mov", "avi"].includes(ext)) return "ph ph-file-video";
  return "ph ph-paperclip";
}

function fileSizeLabel(n: number | null): string {
  if (n == null) return "";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return Math.round(n / 1024) + " KB";
  return (n / 1048576).toFixed(1) + " MB";
}

const bubbleShell: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, maxWidth: "82%" };
const senderRow: React.CSSProperties = { display: "flex", gap: 6 };
const timeStyle: React.CSSProperties = { fontSize: 10.5, color: "var(--color-neutral-700)" };
const senderStyle: React.CSSProperties = { fontSize: 10.5, whiteSpace: "nowrap", color: "var(--color-neutral-600)" };

function Meta({ isSelf, time }: { isSelf: boolean; time: string }) {
  return (
    <div style={{ ...senderRow, alignSelf: isSelf ? "flex-end" : "flex-start" }}>
      {!isSelf && <span style={senderStyle}>受付 ・</span>}
      <span style={timeStyle}>{time}</span>
    </div>
  );
}

export function TextBubble({ msg, highlight }: { msg: MessageWithExtras; highlight: boolean }) {
  const isSelf = msg.sender_role === "client";
  return (
    <div style={{ ...bubbleShell, alignSelf: isSelf ? "flex-end" : "flex-start", outline: highlight ? "2px solid var(--color-accent)" : "none", borderRadius: "var(--radius-lg)" }}>
      <div
        style={{
          width: "max-content",
          maxWidth: "100%",
          background: isSelf ? "var(--color-bubble-self-bg)" : "var(--color-bubble-other-bg)",
          color: isSelf ? "var(--color-bubble-self-text)" : "var(--color-bubble-other-text)",
          border: isSelf ? "none" : "1px solid var(--color-divider)",
          padding: "10px 14px",
          borderRadius: "var(--radius-lg)",
          fontSize: 14,
          lineHeight: 1.55,
          whiteSpace: "pre-wrap",
        }}
      >
        {msg.body}
      </div>
      <Meta isSelf={isSelf} time={timeLabel(msg.sent_at)} />
    </div>
  );
}

export function FilesBubble({ msg, highlight }: { msg: MessageWithExtras; highlight: boolean }) {
  const isSelf = msg.sender_role === "client";
  return (
    <div style={{ ...bubbleShell, alignSelf: isSelf ? "flex-end" : "flex-start", outline: highlight ? "2px solid var(--color-accent)" : "none", borderRadius: "var(--radius-lg)" }}>
      <div
        style={{
          width: "min(300px, 100%)",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          padding: 10,
          borderRadius: "var(--radius-md)",
          background: isSelf ? "var(--color-bubble-self-bg)" : "var(--color-bubble-other-bg)",
          border: isSelf ? "none" : "1px solid var(--color-divider)",
        }}
      >
        {msg.attachments.map((f: AttachmentRow) => (
          <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0, padding: "6px 8px", borderRadius: "var(--radius-md)", background: isSelf ? "color-mix(in srgb, var(--color-bubble-self-text) 6%, transparent)" : "var(--color-bg)" }}>
            <i className={fileIconClass(f.file_name)} style={{ flex: "none", fontSize: 17, color: isSelf ? "var(--color-bubble-self-text)" : "var(--color-accent)" }} />
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12.5, color: isSelf ? "var(--color-bubble-self-text)" : "var(--color-text)" }}>{f.file_name}</span>
            <span style={{ flex: "none", fontSize: 10, color: isSelf ? "color-mix(in srgb, var(--color-bubble-self-text) 60%, transparent)" : "var(--color-neutral-500)" }}>{fileSizeLabel(f.bytes)}</span>
          </div>
        ))}
      </div>
      <Meta isSelf={isSelf} time={timeLabel(msg.sent_at)} />
    </div>
  );
}

export function NoticeBubble({ msg }: { msg: MessageWithExtras }) {
  return (
    <div style={{ alignSelf: "center" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11.5,
          whiteSpace: "nowrap",
          color: "var(--color-neutral-500)",
          padding: "2px 10px",
          borderRadius: "var(--radius-md)",
          background: "var(--color-surface)",
        }}
      >
        <BellRinging size={12} />
        {msg.body}
      </div>
    </div>
  );
}

export function MenuPickBubble({ msg }: { msg: MessageWithExtras }) {
  const p = msg.payload as { menuLabel?: string; menuIcon?: string | null; rows?: { label: string; value: string }[]; note?: string };
  return (
    <div style={{ ...bubbleShell, alignSelf: "flex-end" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "11px 13px", borderRadius: "var(--radius-md)", background: "var(--color-accent-900)", border: "1px solid var(--color-accent-800)" }}>
        <span style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-accent-200)" }}>このメニューについて相談したい</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {p.menuIcon && <i className={p.menuIcon} style={{ fontSize: 15, color: "var(--color-accent)", flex: "none" }} />}
          <span style={{ fontSize: 13.5, minWidth: 0, flex: 1, lineHeight: 1.4 }}>{p.menuLabel}</span>
        </div>
        {!!p.rows?.length && (
          <div style={{ display: "flex", flexDirection: "column", gap: 5, paddingTop: 7, borderTop: "1px solid var(--color-accent-800)" }}>
            {p.rows.map((rw, i) => (
              <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, lineHeight: 1.5 }}>
                <span style={{ width: 96, flex: "none", color: "var(--color-neutral-500)" }}>{rw.label}</span>
                <span style={{ minWidth: 0, flex: 1 }}>{rw.value}</span>
              </div>
            ))}
          </div>
        )}
        {p.note && <div style={{ fontSize: 12, lineHeight: 1.55, paddingTop: 7, borderTop: "1px solid var(--color-accent-800)" }}>{p.note}</div>}
      </div>
      <Meta isSelf time={timeLabel(msg.sent_at)} />
    </div>
  );
}

const kicker: React.CSSProperties = { fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-accent)" };
const outlineBtn: React.CSSProperties = { height: 40, cursor: "pointer", fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 14, color: "var(--color-accent)", background: "transparent", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)" };

export function RequestCard({
  msg,
  bundle,
  refundPolicies,
  onPay,
  onCancel,
  onSubmitRating,
  onSkipRating,
}: {
  msg: MessageWithExtras;
  bundle: RequestBundle;
  refundPolicies: RefundPolicyRow[];
  onPay: (id: string) => void;
  onCancel: (id: string) => void;
  onSubmitRating: (id: string, stars: number, comment: string) => void;
  onSkipRating: (id: string) => void;
}) {
  const { request: r, items, report, rating } = bundle;
  const payload = msg.payload as { title?: string; note?: string; due?: string };
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");

  const isPending = r.phase === "quoted";
  const showProgress = !["quoted", "declined"].includes(r.phase);
  const showReport = r.phase === "completed" && !!report?.sent_at;
  const stage = stageInfoFor(r);
  const refund = computeRefund(r, refundPolicies);
  const started = !!r.started_at;
  const canCancel = ["preparing", "started", "approved"].includes(r.phase);

  return (
    <div style={{ ...bubbleShell, alignSelf: "flex-start" }}>
      <div style={{ width: "min(300px, 100%)", display: "flex", flexDirection: "column", gap: 10, padding: 14, borderRadius: "var(--radius-md)", background: "var(--color-surface)", boxShadow: "0 0 0 1px var(--color-neutral-800)" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={kicker}>お見積もり</span>
            <span style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--color-neutral-500)", whiteSpace: "nowrap" }}>受付が作成</span>
          </div>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 17, lineHeight: 1.2, marginTop: 2 }}>
            {payload.title ?? r.title}
          </div>
          {payload.note && <p style={{ margin: "6px 0 0", fontSize: 13, opacity: 0.8 }}>{payload.note}</p>}
          {items.length > 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 10, paddingTop: 9, borderTop: "1px solid var(--color-divider)" }}>
              {items.map((it) => (
                <div key={it.id} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12.5 }}>
                  <span style={{ minWidth: 0, flex: 1, opacity: 0.85 }}>
                    {it.label}
                    {it.qty > 1 ? ` ×${it.qty}` : ""}
                  </span>
                  <span style={{ flex: "none", color: "var(--color-neutral-400)" }}>{yen(it.price * it.qty)}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 8 }}>
            <span style={{ fontSize: 22, fontWeight: 600, fontFamily: "var(--font-heading)" }}>{yen(r.amount)}</span>
            <span style={{ fontSize: 12, color: "var(--color-neutral-500)" }}>（税込）</span>
          </div>
          {payload.due && (
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6, fontSize: 12.5 }}>
              <span style={{ color: "var(--color-neutral-500)" }}>対応の目安</span>
              <span style={{ color: "var(--color-accent-300)" }}>{payload.due} ごろ</span>
            </div>
          )}
          {isPending && (
            <button onClick={() => onPay(r.id)} style={{ ...outlineBtn, marginTop: 10, width: "100%" }}>
              決済して依頼する
            </button>
          )}
          {!isPending && r.phase !== "declined" && (
            <span style={{ display: "inline-flex", marginTop: 10, fontSize: 11, padding: "3px 10px", borderRadius: 6, background: "var(--color-accent-800)", color: "var(--color-accent-100)", width: "fit-content" }}>
              承認済み・決済完了
            </span>
          )}
        </div>

        {showProgress && (
          <div style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 10 }}>
            <div style={kicker}>進捗状況</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 6 }}>
              {stage.steps.map((s, i) => {
                const color = s.state === "done" ? "var(--color-accent-300)" : s.state === "muted" ? "var(--color-neutral-400)" : s.state === "current" ? "var(--color-neutral-400)" : "var(--color-neutral-600)";
                const icon = s.state === "done" || s.state === "muted" ? (r.phase === "cancelled" || r.phase === "declined" ? "ph-fill ph-x-circle" : "ph-fill ph-check-circle") : s.state === "current" ? "ph ph-circle-dashed" : "ph ph-circle";
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color }}>
                    <i className={icon} style={{ flex: "none", fontSize: 16 }} />
                    <span style={{ minWidth: 0, flex: 1 }}>{s.label}</span>
                    <span style={{ flex: "none", fontSize: 10.5, color: "var(--color-neutral-600)" }}>{s.at ? timeLabel(s.at) : ""}</span>
                  </div>
                );
              })}
            </div>
            {canCancel && (
              <button
                onClick={() => onCancel(r.id)}
                style={{ marginTop: 10, width: "100%", height: 38, cursor: "pointer", fontFamily: "var(--font-heading)", fontSize: 13, color: "var(--color-text)", background: "transparent", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}
              >
                {!started ? "依頼をキャンセルする（全額返金）" : `依頼をキャンセルする（返金 ${yen(refund.amount)}）`}
              </button>
            )}
            {r.phase === "cancelled" && (
              <span style={{ display: "inline-flex", marginTop: 8, fontSize: 11, padding: "3px 10px", borderRadius: 6, border: "1px solid var(--color-accent)", color: "var(--color-accent)", width: "fit-content" }}>
                キャンセル・返金済み
              </span>
            )}
          </div>
        )}

        {showReport && report && (
          <div style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 10 }}>
            <div style={{ ...kicker, display: "flex", alignItems: "center", gap: 4 }}>
              <CheckCircle size={12} />
              完了報告
            </div>
            <p style={{ margin: "6px 0 0", fontSize: 13, opacity: 0.8 }}>{report.summary}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
              {report.details.map((d, i) => (
                <div key={i} style={{ display: "flex", gap: 8, fontSize: 12.5 }}>
                  <span style={{ color: "var(--color-neutral-500)", flex: "none", width: 64 }}>{d.label}</span>
                  <span>{d.value}</span>
                </div>
              ))}
            </div>
            <p style={{ margin: "10px 0 0", paddingTop: 8, borderTop: "1px solid var(--color-divider)", fontSize: 12.5, opacity: 0.75 }}>
              このたびもご依頼いただきありがとうございました。ご不明な点や修正のご希望があれば、このまま返信ください。またのご依頼をお待ちしております。
            </p>
            <div style={{ marginTop: 6, fontSize: 12, color: "var(--color-neutral-500)" }}>受付</div>

            {!rating && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--color-divider)", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 12.5 }}>今回の対応はいかがでしたか</div>
                <div style={{ display: "flex", gap: 4 }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} onClick={() => setStars(n)} aria-label={`星${n}`} style={{ width: 34, height: 34, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: n <= stars ? "var(--color-accent)" : "var(--color-neutral-700)", background: "transparent", border: "none", padding: 0 }}>
                      <Star size={22} weight={n <= stars ? "fill" : "regular"} />
                    </button>
                  ))}
                  <span style={{ alignSelf: "center", marginLeft: 6, fontSize: 11.5, color: "var(--color-neutral-500)" }}>
                    {["", "申し訳ありません", "ご期待に届きませんでした", "ありがとうございます", "ありがとうございます", "ありがとうございます"][stars]}
                  </span>
                </div>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="ひとことあれば（任意）。よかった点も、直してほしい点も"
                  className="vid-textarea"
                  style={{ width: "100%", minHeight: 62, padding: "9px 10px", fontFamily: "var(--font-body)", fontSize: 12.5, lineHeight: 1.7, color: "var(--color-text)", background: "var(--color-bg)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)", outline: "none", resize: "vertical" }}
                />
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    onClick={() => onSubmitRating(r.id, stars, comment)}
                    disabled={stars === 0}
                    style={{ flex: 1, height: 34, cursor: stars ? "pointer" : "not-allowed", fontSize: 12.5, color: stars ? "var(--color-accent)" : "var(--color-neutral-600)", background: "transparent", border: `1px solid ${stars ? "var(--color-accent)" : "var(--color-divider)"}`, borderRadius: "var(--radius-md)" }}
                  >
                    送る
                  </button>
                  <button onClick={() => onSkipRating(r.id)} style={{ height: 34, padding: "0 12px", cursor: "pointer", fontSize: 12, color: "var(--color-neutral-500)", background: "transparent", border: "none" }}>
                    今回はスキップ
                  </button>
                </div>
                <div style={{ fontSize: 10.5, color: "var(--color-neutral-600)", lineHeight: 1.6 }}>
                  星もひとことも、まず運営だけが受け取ります。担当者に直接は届きません。お伝えしたほうがよい内容は運営が判断してお伝えします。
                </div>
              </div>
            )}

            {rating && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--color-divider)", display: "flex", alignItems: "flex-start", gap: 7 }}>
                {rating.skipped ? <MinusCircle size={14} color="var(--color-neutral-500)" style={{ flex: "none", marginTop: 1 }} /> : <CheckCircle weight="fill" size={14} color="var(--color-neutral-500)" style={{ flex: "none", marginTop: 1 }} />}
                <span style={{ fontSize: 11.5, color: "var(--color-neutral-500)", lineHeight: 1.6 }}>
                  {rating.skipped
                    ? "評価はスキップしました。あとから送りたいときは、このまま返信でお知らせください。"
                    : rating.comment
                      ? "ご評価ありがとうございました。いただいたひとことは運営が確認します。"
                      : "ご評価ありがとうございました。"}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
      <Meta isSelf={false} time={timeLabel(msg.sent_at)} />
    </div>
  );
}
