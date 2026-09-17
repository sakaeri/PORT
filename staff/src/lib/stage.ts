import type { PaymentTiming, RequestPhase } from "@/lib/supabase/types";

// 依頼主アプリ側(src/lib/stage.ts)の表記と揃えている。
export const PHASE_LABEL: Record<RequestPhase, string> = {
  draft: "下書き",
  quoted: "見積もり待ち",
  preparing: "着手前（承認済み）",
  started: "着手済み",
  completed: "完了",
  cancelled: "キャンセル・返金済み",
  declined: "見送り",
};

export const PAYMENT_TIMING_LABEL: Record<PaymentTiming, string> = {
  prepay_full: "先払い",
  deposit: "予約金の先払い",
  before_shipping: "発送前入金",
  postpay: "後払い",
};
