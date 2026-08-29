/**
 * 上传前图片压缩：Vercel Serverless 请求体上限 4.5MB，手机拍摄的照片常超限，
 * 且超大分辨率对识别无益。等比缩放到长边 ≤2000px、JPEG 质量 0.85。
 */

export interface CompressResult {
  file: File;
  compressed: boolean;
  originalSize: number;
}

const MAX_EDGE = 2000;
const JPEG_QUALITY = 0.85;

export const compressImageFile = async (file: File): Promise<CompressResult> => {
  if (!file.type.startsWith("image/") || file.type === "image/gif") {
    // GIF 压缩会丢动画，直接原样返回
    return { file, compressed: false, originalSize: file.size };
  }
  if (file.size <= 2 * 1024 * 1024) {
    // 已足够小，不重编码（避免无损图转 JPEG 反而变大或损失质量）
    return { file, compressed: false, originalSize: file.size };
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return { file, compressed: false, originalSize: file.size };
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob || blob.size >= file.size) {
      return { file, compressed: false, originalSize: file.size };
    }
    const compressedName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return {
      file: new File([blob], compressedName, { type: "image/jpeg", lastModified: Date.now() }),
      compressed: true,
      originalSize: file.size,
    };
  } catch {
    // 解码失败等异常：回退原文件，让后端返回明确的错误信息
    return { file, compressed: false, originalSize: file.size };
  }
};
