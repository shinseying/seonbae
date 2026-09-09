import "server-only";

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

const signatures: Record<string, number[]> = {
  "application/pdf": [0x25, 0x50, 0x44, 0x46, 0x2d],
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
};

export async function documentUploadError(
  value: FormDataEntryValue | null,
  label: string,
  required: boolean,
) {
  if (!(value instanceof File) || value.size === 0) {
    return required ? `${label}를 첨부해 주세요.` : null;
  }
  if (value.size > MAX_DOCUMENT_BYTES || !(value.type in signatures)) {
    return `${label}는 10MB 이하 PDF, JPG 또는 PNG만 제출할 수 있습니다.`;
  }

  const expected = signatures[value.type];
  const header = new Uint8Array(await value.slice(0, expected.length).arrayBuffer());
  if (header.length !== expected.length || expected.some((byte, index) => header[index] !== byte)) {
    return `${label} 파일의 실제 형식을 확인해 주세요.`;
  }
  return null;
}
