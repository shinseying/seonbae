export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export const DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

export type DocumentMimeType = (typeof DOCUMENT_MIME_TYPES)[number];

const DOCUMENT_SIGNATURES: Record<DocumentMimeType, readonly number[]> = {
  "application/pdf": [0x25, 0x50, 0x44, 0x46, 0x2d],
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
};

export function isDocumentMimeType(value: unknown): value is DocumentMimeType {
  return typeof value === "string" && DOCUMENT_MIME_TYPES.includes(value as DocumentMimeType);
}

export function documentExtension(mimeType: DocumentMimeType) {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "image/jpeg") return "jpg";
  return "png";
}

export function hasDocumentMagic(bytes: Uint8Array, mimeType: DocumentMimeType) {
  const signature = DOCUMENT_SIGNATURES[mimeType];
  return bytes.length >= signature.length
    && signature.every((byte, index) => bytes[index] === byte);
}
