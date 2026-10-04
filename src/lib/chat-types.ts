import type { Database } from "@/lib/supabase/types";

export type MessageRow = Database["public"]["Tables"]["messages"]["Row"];
export type RequestRow = Database["public"]["Tables"]["requests"]["Row"];
export type RequestItemRow = Database["public"]["Tables"]["request_items"]["Row"];
export type CompletionReportRow = Database["public"]["Tables"]["completion_reports"]["Row"];
export type RatingRow = Database["public"]["Tables"]["ratings"]["Row"];
export type AttachmentRow = Database["public"]["Tables"]["message_attachments"]["Row"];
export type ReportAttachmentRow = Database["public"]["Tables"]["completion_report_attachments"]["Row"];

export interface RequestBundle {
  request: RequestRow;
  items: RequestItemRow[];
  report: (CompletionReportRow & { attachments: ReportAttachmentRow[] }) | null;
  rating: RatingRow | null;
}

export interface MessageWithExtras extends MessageRow {
  attachments: AttachmentRow[];
  requestBundle: RequestBundle | null;
}

export type RawMessageRow = MessageRow & {
  message_attachments: AttachmentRow[] | null;
  requests:
    | (RequestRow & {
        request_items: RequestItemRow[] | null;
        completion_reports: CompletionReportRow[] | CompletionReportRow | null;
        completion_report_attachments: ReportAttachmentRow[] | null;
        ratings: RatingRow[] | RatingRow | null;
      })
    | null;
};

// 会話が長くなっても初回表示・ポーリングが遅くならないよう、一度に読み込むメッセージ件数を絞る。
export const MESSAGE_PAGE_SIZE = 60;

export function mapMessageRow(row: RawMessageRow): MessageWithExtras {
  const { message_attachments, requests, ...msg } = row;
  const reportRaw = requests ? (Array.isArray(requests.completion_reports) ? requests.completion_reports[0] : requests.completion_reports) : null;
  const report = reportRaw ? { ...reportRaw, attachments: requests?.completion_report_attachments ?? [] } : null;
  const requestBundle: RequestBundle | null = requests
    ? {
        request: requests,
        items: requests.request_items ?? [],
        report,
        rating: (Array.isArray(requests.ratings) ? requests.ratings[0] : requests.ratings) ?? null,
      }
    : null;
  return { ...msg, attachments: message_attachments ?? [], requestBundle };
}

export interface CustomerContext {
  userId: string;
  orgId: string;
  orgDisplayName: string;
  customerId: string;
  customerName: string;
  memberNo: string | null;
  threadId: string;
  email: string | null;
  isAnonymous: boolean;
  avatarUrl: string | null;
  // トライアル終了・支払い滞納などで、この事業所への新規の問い合わせ・返信を
  // 止めるべき状態かどうか。過去のやり取りの閲覧は常にできる。
  orgLocked: boolean;
  // チャージ残高（円）。
  balance: number;
  // 残高の自動チャージ設定。
  autoRecharge: { enabled: boolean; threshold: number | null; amount: number | null; hasCard: boolean };
}
