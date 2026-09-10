import type { Database } from "@/lib/supabase/types";

export type MessageRow = Database["public"]["Tables"]["messages"]["Row"];
export type RequestRow = Database["public"]["Tables"]["requests"]["Row"];
export type RequestItemRow = Database["public"]["Tables"]["request_items"]["Row"];
export type CompletionReportRow = Database["public"]["Tables"]["completion_reports"]["Row"];
export type RatingRow = Database["public"]["Tables"]["ratings"]["Row"];
export type MenuRow = Database["public"]["Tables"]["menus"]["Row"] & {
  menu_questions: Database["public"]["Tables"]["menu_questions"]["Row"][];
};
export type VaultRow = Database["public"]["Tables"]["customer_vault_items"]["Row"];
export type AttachmentRow = Database["public"]["Tables"]["message_attachments"]["Row"];
export type RefundPolicyRow = Database["public"]["Tables"]["refund_policies"]["Row"];

export interface RequestBundle {
  request: RequestRow;
  items: RequestItemRow[];
  report: CompletionReportRow | null;
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
        ratings: RatingRow[] | RatingRow | null;
      })
    | null;
};

export function mapMessageRow(row: RawMessageRow): MessageWithExtras {
  const { message_attachments, requests, ...msg } = row;
  const requestBundle: RequestBundle | null = requests
    ? {
        request: requests,
        items: requests.request_items ?? [],
        report: (Array.isArray(requests.completion_reports) ? requests.completion_reports[0] : requests.completion_reports) ?? null,
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
}
