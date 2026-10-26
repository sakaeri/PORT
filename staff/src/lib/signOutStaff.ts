"use client";

import { createClient } from "@/lib/supabase/client";

// ログアウトの本体。Shell.tsxのサイドバーからのログアウトと、
// 「権限がありません」画面からの「ログイン画面に戻る」の両方から使う。
export async function signOutStaff() {
  const supabase = createClient();
  await supabase.auth.signOut();
}
