// 立替（実費の支払い代行）の手数料。実費の5%（円未満切り上げ）、最低100円。
// 依頼主画面は見積もりの明細（実費・手数料の2行）をそのまま表示するので、計算はここだけにある。
export const ADVANCE_FEE_RATE = 0.05;
export const ADVANCE_FEE_MIN = 100;

export function advanceFee(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.max(ADVANCE_FEE_MIN, Math.ceil(amount * ADVANCE_FEE_RATE));
}

// 立替の見積もりの有効時間（分）の選択肢。予約サイトの支払い画面が
// 打ち切られる前に承諾してもらうための期限。
export const ADVANCE_VALID_MINUTES = [10, 15, 20, 30] as const;
