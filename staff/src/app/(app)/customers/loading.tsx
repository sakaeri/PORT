// 一覧 ⇄ 詳細の移動（同じ階層の中での切り替え）でも、待っている間に
// スピナーを出す。上の (app)/loading.tsx だけだと、メニュー間の移動でしか出ない。
export { default } from "../loading";
