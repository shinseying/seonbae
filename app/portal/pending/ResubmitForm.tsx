"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient as createBrowserSupabaseClient } from "../../../utils/supabase/client";
import styles from "./pending.module.css";

const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = ["application/pdf", "image/jpeg", "image/png"];

// The answer to a 보완 요청. Files go straight to storage through signed URLs,
// then the application returns to the admissions queue.
export default function ResubmitForm() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  function pick(list: FileList | null) {
    const picked = Array.from(list ?? []);
    if (picked.length > MAX_FILES) return setMessage(`파일은 ${MAX_FILES}개까지 올릴 수 있습니다.`);
    if (picked.some((file) => !TYPES.includes(file.type))) return setMessage("PDF, JPG, PNG 파일만 올릴 수 있습니다.");
    if (picked.some((file) => file.size > MAX_BYTES)) return setMessage("파일당 10MB 이하로 올려 주세요.");
    setMessage("");
    setFiles(picked);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!files.length || busy) return;
    setBusy(true);
    const documents = files.map((file) => ({ originalName: file.name, mimeType: file.type, sizeBytes: file.size }));
    try {
      setMessage("업로드를 준비하고 있습니다…");
      const prepared = await post({ step: "prepare", documents });
      const uploads = prepared.uploads as Array<{ path: string; token: string }>;
      const storage = createBrowserSupabaseClient().storage.from("account-documents");
      for (let index = 0; index < files.length; index += 1) {
        setMessage(`서류를 올리고 있습니다 (${index + 1}/${files.length})…`);
        const { error } = await storage.uploadToSignedUrl(uploads[index].path, uploads[index].token, files[index], {
          cacheControl: "0",
          contentType: files[index].type,
          upsert: false,
        });
        if (error) throw new Error("서류를 올리지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.");
      }
      setMessage("제출하고 있습니다…");
      await post({
        step: "submit",
        note,
        documents: documents.map((document, index) => ({ ...document, path: uploads[index].path })),
      });
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "제출하지 못했습니다. 다시 시도해 주세요.");
      setBusy(false);
    }
  }

  return (
    <form className={styles.resubmit} onSubmit={submit}>
      <b>보완 서류 제출</b>
      <label>
        <span>서류 (PDF, JPG, PNG · 최대 {MAX_FILES}개 · 파일당 10MB)</span>
        <input
          type="file"
          multiple
          accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
          disabled={busy}
          onChange={(event) => pick(event.target.files)}
        />
      </label>
      {files.length > 0 && <ul>{files.map((file) => <li key={file.name}>{file.name}</li>)}</ul>}
      <label>
        <span>심사팀에 남길 메모 (선택)</span>
        <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={2000} disabled={busy} />
      </label>
      <button type="submit" disabled={busy || !files.length}>{busy ? "제출 중…" : "보완 서류 제출하기"}</button>
      {message && <p aria-live="polite">{message}</p>}
    </form>
  );
}

async function post(body: Record<string, unknown>) {
  const response = await fetch("/api/tutor-applications/resubmit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error || "제출하지 못했습니다. 다시 시도해 주세요.");
  return result;
}
