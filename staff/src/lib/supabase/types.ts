// Hand-written to match supabase/migrations/*.sql exactly (Docker isn't
// available in this environment to run `supabase gen types` against a live
// project). Regenerate with:
//   supabase gen types typescript --project-id <ref> > src/lib/supabase/types.ts
// once the schema is pushed to a real Supabase project, then diff against
// this file before trusting the replacement.

export type AppRole = "owner" | "reception" | "creator" | "client" | "supervisor" | "dept_manager" | "dept_leader";
export type StaffRole = "owner" | "supervisor" | "dept_manager" | "dept_leader";

export type RequestPhase =
  | "draft"
  | "quoted"
  | "preparing"
  | "started"
  | "completed"
  | "cancelled"
  | "declined";

export type MessageKind =
  | "text"
  | "files"
  | "quote"
  | "notice"
  | "intake_request"
  | "off_choice"
  | "report"
  | "rating"
  | "system"
  | "menu_pick"
  | "intake_answer";

export type ThreadKind = "customer" | "case" | "internal";
export type RefundStage = "prequote" | "accepted" | "started" | "delivered" | "terminate";
export type RefundMode = "nocharge" | "full" | "partial" | "none";
export type PaymentMethod = "card" | "bank";
export type PaymentStatus = "unpaid" | "processing" | "paid" | "refunded" | "failed";
export type PaymentTiming = "prepay_full" | "deposit" | "before_shipping" | "postpay";
export type AgreementKind = "contract" | "employment_part" | "employment_full" | "nda" | "consent";
export type PayMode = "hourly" | "daily" | "monthly" | "menu" | "share" | "none";
export type PlanStatus = "trial" | "active" | "past_due" | "paused" | "cancelled";
export type ReferralStatus = "pending" | "confirmed" | "consumed" | "revoked";

export interface BankTransferInfo {
  holder?: string;
  bankName?: string;
  branchName?: string;
  accountType?: string;
  accountNumber?: string;
}

export interface QuotePayloadItem {
  label: string;
  price: number;
  qty?: number;
}

export interface QuotePayload {
  title: string;
  note?: string;
  items: QuotePayloadItem[];
  total: number;
  work_minutes?: number;
  due?: string;
}

export interface ReportDetail {
  label: string;
  value: string;
}

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          display_name: string;
          rep_name: string | null;
          address: string | null;
          tel: string | null;
          email: string | null;
          pay_method: string;
          solo: boolean;
          sla_minutes: number;
          terms: Record<string, unknown>;
          plan_status: "trial" | "active" | "past_due" | "paused" | "cancelled";
          base_fee: number;
          seat_price: number;
          seats: number;
          trial_ends_on: string | null;
          referred_by_user_id: string | null;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          domain: string | null;
          slug: string | null;
          is_hq: boolean;
          card_payment_enabled: boolean;
          bank_transfer_info: BankTransferInfo;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["organizations"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["organizations"]["Row"]>;
        Relationships: [];
      };
      departments: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["departments"]["Row"]> & { org_id: string; name: string };
        Update: Partial<Database["public"]["Tables"]["departments"]["Row"]>;
        Relationships: [];
      };
      staff_departments: {
        Row: {
          profile_id: string;
          department_id: string;
        };
        Insert: Database["public"]["Tables"]["staff_departments"]["Row"];
        Update: Partial<Database["public"]["Tables"]["staff_departments"]["Row"]>;
        Relationships: [];
      };
      staff_invites: {
        Row: {
          id: string;
          org_id: string;
          role: AppRole;
          department_ids: string[];
          created_by: string | null;
          created_at: string;
          used_at: string | null;
          used_by: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["staff_invites"]["Row"]> & { org_id: string; role: AppRole };
        Update: Partial<Database["public"]["Tables"]["staff_invites"]["Row"]>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          org_id: string;
          role: AppRole;
          display_name: string;
          avatar_url: string | null;
          theme: "dark" | "light";
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & { id: string; org_id: string; role: AppRole; display_name: string };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
        Relationships: [];
      };
      customers: {
        Row: {
          id: string;
          org_id: string;
          profile_id: string | null;
          name: string;
          member_no: string | null;
          creator_id: string | null;
          active: boolean;
          converted_org_id: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["customers"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["customers"]["Row"]>;
        Relationships: [
          { foreignKeyName: "customers_creator_fk"; columns: ["creator_id"]; isOneToOne: false; referencedRelation: "creators"; referencedColumns: ["id"] },
          { foreignKeyName: "customers_converted_org_id_fkey"; columns: ["converted_org_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] },
        ];
      };
      creators: {
        Row: {
          id: string;
          org_id: string;
          profile_id: string;
          wip_limit: number;
          bio: string | null;
          joined_on: string | null;
          active: boolean;
        };
        Insert: Partial<Database["public"]["Tables"]["creators"]["Row"]> & { org_id: string; profile_id: string };
        Update: Partial<Database["public"]["Tables"]["creators"]["Row"]>;
        Relationships: [{ foreignKeyName: "creators_profile_id_fkey"; columns: ["profile_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }];
      };
      customer_vault_items: {
        Row: {
          id: string;
          customer_id: string;
          label: string;
          value: string;
          sort: number;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["customer_vault_items"]["Row"]> & { customer_id: string; label: string };
        Update: Partial<Database["public"]["Tables"]["customer_vault_items"]["Row"]>;
        Relationships: [];
      };
      menus: {
        Row: {
          id: string;
          org_id: string;
          label: string;
          note: string | null;
          icon: string | null;
          price: number;
          payout: number;
          lead_hours: number;
          sort: number;
          active: boolean;
          department_id: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["menus"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["menus"]["Row"]>;
        Relationships: [];
      };
      menu_questions: {
        Row: { id: string; menu_id: string; label: string; sort: number };
        Insert: Partial<Database["public"]["Tables"]["menu_questions"]["Row"]> & { menu_id: string; label: string };
        Update: Partial<Database["public"]["Tables"]["menu_questions"]["Row"]>;
        Relationships: [{ foreignKeyName: "menu_questions_menu_id_fkey"; columns: ["menu_id"]; isOneToOne: false; referencedRelation: "menus"; referencedColumns: ["id"] }];
      };
      refund_policies: {
        Row: { org_id: string; stage: RefundStage; mode: RefundMode; pct: number };
        Insert: Partial<Database["public"]["Tables"]["refund_policies"]["Row"]> & { org_id: string; stage: RefundStage; mode: RefundMode };
        Update: Partial<Database["public"]["Tables"]["refund_policies"]["Row"]>;
        Relationships: [];
      };
      card_payment_links: {
        Row: { id: string; org_id: string; title: string; url: string; created_at: string };
        Insert: Partial<Database["public"]["Tables"]["card_payment_links"]["Row"]> & { org_id: string; title: string; url: string };
        Update: Partial<Database["public"]["Tables"]["card_payment_links"]["Row"]>;
        Relationships: [];
      };
      intake_forms: {
        Row: {
          id: string;
          org_id: string;
          label: string;
          note: string | null;
          icon: string | null;
          body: string | null;
          sort: number;
        };
        Insert: Partial<Database["public"]["Tables"]["intake_forms"]["Row"]> & { org_id: string; label: string };
        Update: Partial<Database["public"]["Tables"]["intake_forms"]["Row"]>;
        Relationships: [];
      };
      intake_fields: {
        Row: {
          id: string;
          form_id: string;
          key: string;
          label: string;
          kind: string;
          required: boolean;
          sort: number;
        };
        Insert: Partial<Database["public"]["Tables"]["intake_fields"]["Row"]> & { form_id: string; key: string; label: string };
        Update: Partial<Database["public"]["Tables"]["intake_fields"]["Row"]>;
        Relationships: [{ foreignKeyName: "intake_fields_form_id_fkey"; columns: ["form_id"]; isOneToOne: false; referencedRelation: "intake_forms"; referencedColumns: ["id"] }];
      };
      agreements: {
        Row: {
          id: string;
          org_id: string;
          label: string;
          kind: AgreementKind;
          start_on: string | null;
          open_term: boolean;
          end_on: string | null;
          scope: string | null;
          pay_mode: PayMode;
          pay_fixed: number | null;
          pay_pct: number | null;
          close_day: string | null;
          pay_day: string | null;
          pay_method: string | null;
          body_text: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["agreements"]["Row"]> & { org_id: string; label: string };
        Update: Partial<Database["public"]["Tables"]["agreements"]["Row"]>;
        Relationships: [];
      };
      agreement_extras: {
        Row: { agreement_id: string; clause: string };
        Insert: Partial<Database["public"]["Tables"]["agreement_extras"]["Row"]> & { agreement_id: string; clause: string };
        Update: Partial<Database["public"]["Tables"]["agreement_extras"]["Row"]>;
        Relationships: [{ foreignKeyName: "agreement_extras_agreement_id_fkey"; columns: ["agreement_id"]; isOneToOne: false; referencedRelation: "agreements"; referencedColumns: ["id"] }];
      };
      requests: {
        Row: {
          id: string;
          org_id: string;
          customer_id: string;
          creator_id: string | null;
          title: string;
          note: string | null;
          phase: RequestPhase;
          amount: number;
          payout: number;
          work_minutes: number | null;
          lead_hours: number | null;
          due_at: string | null;
          refund_pct: number | null;
          quoted_at: string | null;
          accepted_at: string | null;
          pay_method: PaymentMethod | null;
          pay_status: PaymentStatus;
          stripe_payment_intent_id: string | null;
          stripe_fee_amount: number | null;
          paid_at: string | null;
          paid_marked_by: string | null;
          refunded_amount: number;
          started_at: string | null;
          completed_at: string | null;
          cancelled_at: string | null;
          payment_timing: PaymentTiming;
          deposit_percent: number | null;
          deposit_amount: number | null;
          deposit_paid_at: string | null;
          deposit_paid_marked_by: string | null;
          bank_transfer_info: BankTransferInfo | null;
          card_payment_link: string | null;
          final_card_payment_link: string | null;
          reminder_sent_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["requests"]["Row"]> & { customer_id: string; title: string };
        Update: Partial<Database["public"]["Tables"]["requests"]["Row"]>;
        Relationships: [{ foreignKeyName: "requests_customer_id_fkey"; columns: ["customer_id"]; isOneToOne: false; referencedRelation: "customers"; referencedColumns: ["id"] }];
      };
      request_items: {
        Row: {
          id: string;
          request_id: string;
          menu_id: string | null;
          label: string;
          price: number;
          payout: number;
          qty: number;
          sort: number;
        };
        Insert: Partial<Database["public"]["Tables"]["request_items"]["Row"]> & { request_id: string; label: string };
        Update: Partial<Database["public"]["Tables"]["request_items"]["Row"]>;
        Relationships: [{ foreignKeyName: "request_items_request_id_fkey"; columns: ["request_id"]; isOneToOne: false; referencedRelation: "requests"; referencedColumns: ["id"] }];
      };
      case_staff: {
        Row: {
          request_id: string;
          profile_id: string;
          assigned_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["case_staff"]["Row"]> & { request_id: string; profile_id: string };
        Update: Partial<Database["public"]["Tables"]["case_staff"]["Row"]>;
        Relationships: [
          { foreignKeyName: "case_staff_request_id_fkey"; columns: ["request_id"]; isOneToOne: false; referencedRelation: "requests"; referencedColumns: ["id"] },
          { foreignKeyName: "case_staff_profile_id_fkey"; columns: ["profile_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };
      threads: {
        Row: {
          id: string;
          org_id: string;
          kind: ThreadKind;
          customer_id: string | null;
          request_id: string | null;
          creator_id: string | null;
          department_id: string | null;
          staff_profile_id: string | null;
          last_msg_at: string | null;
          archived_at: string | null;
          last_read_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["threads"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["threads"]["Row"]>;
        Relationships: [{ foreignKeyName: "threads_customer_id_fkey"; columns: ["customer_id"]; isOneToOne: false; referencedRelation: "customers"; referencedColumns: ["id"] }];
      };
      messages: {
        Row: {
          id: string;
          thread_id: string;
          sender_id: string | null;
          sender_role: AppRole | null;
          kind: MessageKind;
          body: string | null;
          payload: QuotePayload | Record<string, unknown>;
          request_id: string | null;
          sent_at: string;
          edited_at: string | null;
          deleted_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["messages"]["Row"]> & { thread_id: string; kind: MessageKind };
        Update: Partial<Database["public"]["Tables"]["messages"]["Row"]>;
        Relationships: [
          { foreignKeyName: "messages_request_id_fkey"; columns: ["request_id"]; isOneToOne: false; referencedRelation: "requests"; referencedColumns: ["id"] },
          { foreignKeyName: "messages_thread_id_fkey"; columns: ["thread_id"]; isOneToOne: false; referencedRelation: "threads"; referencedColumns: ["id"] },
          { foreignKeyName: "messages_sender_id_fkey"; columns: ["sender_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };
      message_attachments: {
        Row: {
          id: string;
          message_id: string;
          file_path: string;
          file_name: string;
          mime: string | null;
          bytes: number | null;
        };
        Insert: Partial<Database["public"]["Tables"]["message_attachments"]["Row"]> & { message_id: string; file_path: string; file_name: string };
        Update: Partial<Database["public"]["Tables"]["message_attachments"]["Row"]>;
        Relationships: [{ foreignKeyName: "message_attachments_message_id_fkey"; columns: ["message_id"]; isOneToOne: false; referencedRelation: "messages"; referencedColumns: ["id"] }];
      };
      completion_reports: {
        Row: {
          id: string;
          request_id: string;
          creator_id: string | null;
          summary: string;
          details: ReportDetail[];
          revisions_left: number | null;
          note_to_customer: string | null;
          delivery_url: string | null;
          delivery_expires_on: string | null;
          delivery_note: string | null;
          submitted_at: string;
          sent_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["completion_reports"]["Row"]> & { request_id: string; summary: string };
        Update: Partial<Database["public"]["Tables"]["completion_reports"]["Row"]>;
        Relationships: [{ foreignKeyName: "completion_reports_request_id_fkey"; columns: ["request_id"]; isOneToOne: false; referencedRelation: "requests"; referencedColumns: ["id"] }];
      };
      ratings: {
        Row: {
          id: string;
          request_id: string;
          customer_id: string;
          stars: number | null;
          comment: string | null;
          skipped: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["ratings"]["Row"]> & { request_id: string; customer_id: string };
        Update: Partial<Database["public"]["Tables"]["ratings"]["Row"]>;
        Relationships: [{ foreignKeyName: "ratings_request_id_fkey"; columns: ["request_id"]; isOneToOne: true; referencedRelation: "requests"; referencedColumns: ["id"] }];
      };
      app_config: {
        Row: { id: boolean; default_org_id: string | null };
        Insert: Partial<Database["public"]["Tables"]["app_config"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["app_config"]["Row"]>;
        Relationships: [];
      };
      work_memos: {
        Row: {
          id: string;
          customer_id: string;
          request_id: string | null;
          author_id: string;
          body: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["work_memos"]["Row"]> & { customer_id: string; author_id: string; body: string };
        Update: Partial<Database["public"]["Tables"]["work_memos"]["Row"]>;
        Relationships: [{ foreignKeyName: "work_memos_author_id_fkey"; columns: ["author_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }];
      };
      referral_leads: {
        Row: {
          id: string;
          org_id: string;
          customer_id: string;
          customer_name: string;
          customer_email: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["referral_leads"]["Row"]> & { org_id: string; customer_id: string; customer_name: string };
        Update: Partial<Database["public"]["Tables"]["referral_leads"]["Row"]>;
        Relationships: [];
      };
      referral_credits: {
        Row: {
          id: string;
          referrer_user_id: string;
          referrer_org_id: string;
          referred_org_id: string;
          status: ReferralStatus;
          confirmed_at: string | null;
          consumed_billing_month: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["referral_credits"]["Row"]> & { referrer_user_id: string; referrer_org_id: string; referred_org_id: string };
        Update: Partial<Database["public"]["Tables"]["referral_credits"]["Row"]>;
        Relationships: [];
      };
      staff_org_links: {
        Row: { user_id: string; org_id: string; role: AppRole; display_name: string; created_at: string };
        Insert: Partial<Database["public"]["Tables"]["staff_org_links"]["Row"]> & { user_id: string; org_id: string; display_name: string };
        Update: Partial<Database["public"]["Tables"]["staff_org_links"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      my_customer_id: { Args: Record<string, never>; Returns: string };
      auth_org: { Args: Record<string, never>; Returns: string };
      org_id_by_domain: { Args: { p_domain: string }; Returns: string };
      org_id_by_slug: { Args: { p_slug: string }; Returns: string | null };
      ensure_customer_for_org: { Args: { p_org_id: string }; Returns: string };
      my_companies: {
        Args: Record<string, never>;
        Returns: { org_id: string; display_name: string; domain: string | null; slug: string | null }[];
      };
      my_staff_orgs: {
        Args: Record<string, never>;
        Returns: { org_id: string; role: AppRole; display_name: string; is_primary: boolean; slug: string | null }[];
      };
      staff_context: {
        Args: Record<string, never>;
        Returns: {
          org_id: string;
          org_display_name: string;
          solo: boolean;
          is_hq: boolean;
          role: AppRole;
          display_name: string;
          plan_status: "trial" | "active" | "past_due" | "paused" | "cancelled";
          trial_ends_on: string | null;
        }[];
      };
      unread_customer_count: { Args: { p_org_id: string }; Returns: number };
      customer_thread_summaries: {
        Args: { p_org_id: string };
        Returns: {
          customer_id: string;
          thread_id: string;
          archived: boolean;
          unread: boolean;
          department_id: string | null;
          last_message_kind: MessageKind | null;
          last_message_body: string | null;
          last_message_payload: unknown;
          last_message_deleted_at: string | null;
        }[];
      };
    };
    Enums: {
      app_role: AppRole;
      request_phase: RequestPhase;
      message_kind: MessageKind;
      thread_kind: ThreadKind;
      refund_stage: RefundStage;
      refund_mode: RefundMode;
      payment_method: PaymentMethod;
      payment_status: PaymentStatus;
      agreement_kind: AgreementKind;
      pay_mode: PayMode;
      plan_status: PlanStatus;
    };
  };
}
