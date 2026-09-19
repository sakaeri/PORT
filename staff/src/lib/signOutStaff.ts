"use client";

import { createClient } from "@/lib/supabase/client";
import { clearStaffOrgCookie } from "@/app/actions";

// ログアウトの本体。signOut()だけではstaff_org_id（httpOnly）が残るため、
// 必ずこの2つをセットで呼ぶ。Shell.tsxのサイドバーからのログアウトと、
// 「権限がありません」画面からの「ログイン画面に戻る」の両方から使う。
export async function signOutStaff() {
  const supabase = createClient();
  await supabase.auth.signOut();
  await clearStaffOrgCookie();
}
