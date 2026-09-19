// Server Actionが投げた例外が、こちらが意図した日本語メッセージではなく
// Reactの想定外エラー（本番では "Minified React error #441" のような
// 読めないダイジェストに置き換わることがある）だった場合に備え、日本語の
// 文言だけをそのまま表示し、それ以外は分かりやすい文言に差し替える。
export function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof Error && /[ぁ-んァ-ヶ一-龠]/.test(e.message)) return e.message;
  return fallback;
}
