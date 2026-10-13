// 送信前にブラウザ側で画像を縮小する。写真はスマホのカメラだと数十MBになることがあり、
// そのまま送るとアップロードが遅い/失敗しやすいため、辺の長さと画質を落として軽量化する。
export async function compressImage(file: File, maxDimension = 1600, quality = 0.82): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("圧縮に失敗しました");
  ctx.drawImage(bitmap, 0, 0, width, height);

  // PNG/WEBPはそのまま維持（PNGは画質指定が効かないが解像度を落とすだけでも軽くなる）、
  // それ以外（JPEGやMIME不明のもの）はJPEGに変換して圧縮する。
  const mime = file.type === "image/png" || file.type === "image/webp" ? file.type : "image/jpeg";
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("圧縮に失敗しました"))), mime, quality);
  });

  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const base = file.name.replace(/\.[^.]+$/, "");
  return new File([blob], `${base}.${ext}`, { type: mime });
}
