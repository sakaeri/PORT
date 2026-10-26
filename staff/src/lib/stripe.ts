import "server-only";
import Stripe from "stripe";

// STRIPE_SECRET_KEY が未設定の間はここで呼び出し元にエラーを返す
// （import時点で例外を投げるとビルド自体が壊れるため、使う側で遅延させる）。
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("決済機能の準備ができていません。しばらくしてから再度お試しください。");
  return new Stripe(key);
}
