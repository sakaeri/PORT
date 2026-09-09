import type { RequestRow } from "@/lib/chat-types";

export const STAGE_LABELS = ["見積もり・受付", "制作の着手", "制作中", "納品"] as const;

export interface StageStep {
  label: string;
  state: "done" | "current" | "todo" | "muted";
  at: string | null;
}

export interface StageInfo {
  stageIndex: number; // 0..4, how many STAGE_LABELS are fully reached
  declined: boolean;
  steps: StageStep[];
}

function phaseStageIndex(phase: RequestRow["phase"]): number {
  switch (phase) {
    case "preparing":
      return 1;
    case "started":
      return 2;
    case "approved":
      return 3;
    case "completed":
      return 4;
    default:
      return 0;
  }
}

export interface StatusBadge {
  label: string;
  color: string;
  bg: string;
  edge: string;
}

const BADGE: Record<string, StatusBadge> = {
  quoted: { label: "見積もり待ち", color: "var(--color-neutral-300)", bg: "transparent", edge: "var(--color-divider)" },
  preparing: { label: "着手前", color: "var(--color-accent-300)", bg: "transparent", edge: "var(--color-accent-700)" },
  started: { label: "着手済み", color: "var(--color-accent-100)", bg: "var(--color-accent-800)", edge: "var(--color-accent-700)" },
  approved: { label: "対応中", color: "var(--color-accent-100)", bg: "var(--color-accent-800)", edge: "var(--color-accent-700)" },
  completed: { label: "完了", color: "var(--color-accent)", bg: "transparent", edge: "var(--color-accent)" },
  cancelled: { label: "返金済み", color: "var(--color-neutral-400)", bg: "transparent", edge: "var(--color-divider)" },
  declined: { label: "見送り", color: "var(--color-neutral-400)", bg: "transparent", edge: "var(--color-divider)" },
};

export function statusBadgeFor(r: RequestRow): StatusBadge {
  return BADGE[r.phase] ?? BADGE.quoted;
}

export function stageInfoFor(r: RequestRow): StageInfo {
  if (r.phase === "declined") {
    return {
      stageIndex: 0,
      declined: true,
      steps: [
        { label: STAGE_LABELS[0], state: "done", at: null },
        { label: "見送り（費用なし）", state: "muted", at: null },
        { label: "この依頼は終了しました", state: "todo", at: null },
      ],
    };
  }

  if (r.phase === "cancelled") {
    const reachedBeforeCancel = r.started_at ? 2 : 1;
    const steps: StageStep[] = STAGE_LABELS.slice(0, reachedBeforeCancel).map((label, i) => ({
      label,
      state: "muted",
      at: i === 0 ? r.quoted_at : i === 1 ? r.paid_at : null,
    }));
    steps.push({ label: "キャンセル・返金", state: "muted", at: r.cancelled_at });
    return { stageIndex: reachedBeforeCancel, declined: false, steps };
  }

  const stageIndex = phaseStageIndex(r.phase);
  const steps: StageStep[] = STAGE_LABELS.map((label, i) => {
    const reached = i < stageIndex;
    const current = i === stageIndex;
    const displayLabel = current && i === 1 ? "着手前（素材と条件の確認中）" : label;
    const at = i === 0 ? r.quoted_at : i === 1 ? r.paid_at : i === 2 ? r.started_at : i === 3 ? r.completed_at : null;
    return { label: displayLabel, state: reached ? "done" : current ? "current" : "todo", at: reached || (i === 3 && r.phase === "completed") ? at : null };
  });
  return { stageIndex, declined: false, steps };
}
