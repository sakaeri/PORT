import { redirect } from "next/navigation";
import { getStaffContext } from "@/lib/data";

export default async function AppIndexPage() {
  const ctx = await getStaffContext();
  // スタッフ（dept_leader）は依頼主一覧を使わないので、今日やることから始める。
  redirect(ctx?.role === "dept_leader" ? "/today" : "/customers");
}
