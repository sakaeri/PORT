// 入口のフォームに書いたご相談内容を、送信からログインまでの間だけ覚えておく。
// 登録済みのアドレスで送った人は、ログイン用のメールからトークに入り直すので、
// そのときに入力欄へ戻す（トークに届いている場合は何もしない）。
const KEY = "vid_pending_inquiry";

export function savePendingInquiry(text: string) {
  try {
    localStorage.setItem(KEY, text);
  } catch {}
}

export function takePendingInquiry(): string | null {
  try {
    const text = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
    return text;
  } catch {
    return null;
  }
}
