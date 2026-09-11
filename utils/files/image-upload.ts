// Keep the complete multipart request below Vercel's 4.5 MB function limit.
export const MAX_TUTOR_PHOTO_BYTES = 4 * 1024 * 1024;

const PHOTO_SIGNATURES: Record<string, number[][]> = {
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "image/png": [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  "image/webp": [[0x52, 0x49, 0x46, 0x46]],
};

export async function tutorPhotoUploadError(value: FormDataEntryValue | null) {
  if (!(value instanceof File) || value.size === 0) return "프로필 사진을 선택해 주세요.";
  if (value.size > MAX_TUTOR_PHOTO_BYTES || !(value.type in PHOTO_SIGNATURES)) {
    return "프로필 사진은 4MB 이하 JPG, PNG 또는 WebP만 사용할 수 있습니다.";
  }

  const alternatives = PHOTO_SIGNATURES[value.type];
  const headerLength = Math.max(...alternatives.map((signature) => signature.length));
  const header = new Uint8Array(await value.slice(0, Math.max(headerLength, 12)).arrayBuffer());
  const validPrefix = alternatives.some((signature) => signature.every((byte, index) => header[index] === byte));
  const validWebp = value.type !== "image/webp"
    || String.fromCharCode(...header.slice(8, 12)) === "WEBP";
  return validPrefix && validWebp ? null : "프로필 사진 파일의 실제 형식을 확인해 주세요.";
}

export function tutorPhotoExtension(mime: string) {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return null;
}
