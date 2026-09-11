import "server-only";

import { hasDocumentMagic } from "../files/document-rules";
import { createAdminClient } from "../supabase/admin";
import {
  TUTOR_UPLOAD_BUCKET,
  type TutorUploadDocument,
  type TutorUploadTicket,
} from "./tutor-upload-ticket";

type AdminClient = ReturnType<typeof createAdminClient>;

export async function validateUploadedTutorDocuments(
  admin: AdminClient,
  ticket: TutorUploadTicket,
): Promise<{ documents: TutorUploadDocument[]; error: string | null }> {
  const storage = admin.storage.from(TUTOR_UPLOAD_BUCKET);
  for (const document of ticket.documents) {
    const { data: info, error: infoError } = await storage.info(document.storagePath);
    const actualSize = Number(info?.size ?? info?.metadata?.size ?? info?.metadata?.contentLength);
    const actualMime = String(info?.contentType ?? info?.metadata?.mimetype ?? "")
      .split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (
      infoError
      || info?.bucketId !== TUTOR_UPLOAD_BUCKET
      || actualSize !== document.sizeBytes
      || actualMime !== document.mimeType
    ) {
      return { documents: [], error: "업로드한 서류의 파일 정보가 신청 내용과 일치하지 않습니다." };
    }

    const header = await readDocumentHeader(admin, document.storagePath);
    if (!header || !hasDocumentMagic(header, document.mimeType)) {
      return { documents: [], error: "업로드한 서류의 실제 파일 형식을 확인해 주세요." };
    }
  }
  return { documents: ticket.documents, error: null };
}

export async function cleanupTutorUploadPaths(admin: AdminClient, paths: string[]) {
  const uniquePaths = [...new Set(paths.filter(Boolean))];
  if (!uniquePaths.length) return true;
  const { error } = await admin.storage.from(TUTOR_UPLOAD_BUCKET).remove(uniquePaths);
  if (error) {
    console.error("[tutor upload cleanup]", { code: error.name, message: error.message });
    return false;
  }
  return true;
}

async function readDocumentHeader(admin: AdminClient, path: string) {
  const { data, error } = await admin.storage
    .from(TUTOR_UPLOAD_BUCKET)
    .createSignedUrl(path, 60);
  if (error || !data?.signedUrl) return null;

  try {
    const response = await fetch(data.signedUrl, {
      cache: "no-store",
      headers: { Range: "bytes=0-15" },
    });
    if (!response.ok || !response.body) return null;

    const reader = response.body.getReader();
    const bytes: number[] = [];
    while (bytes.length < 16) {
      const chunk = await reader.read();
      if (chunk.done) break;
      for (const byte of chunk.value) {
        bytes.push(byte);
        if (bytes.length === 16) break;
      }
    }
    await reader.cancel().catch(() => undefined);
    return new Uint8Array(bytes);
  } catch {
    return null;
  }
}
