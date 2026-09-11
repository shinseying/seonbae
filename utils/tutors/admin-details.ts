export type TutorDocumentKind = "school_proof" | "credential";

export type TutorDocumentRecord = {
  kind: TutorDocumentKind;
  storage_path: string;
  original_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

type LegacyTutorDocument = {
  kind: TutorDocumentKind;
  path: string | null;
  name: string | null;
};

/** Combines multi-file rows with legacy singular columns without listing a file twice. */
export function mergeTutorDocumentRecords(
  normalized: TutorDocumentRecord[],
  legacy: LegacyTutorDocument[],
) {
  const documents = new Map<string, TutorDocumentRecord>();
  for (const document of normalized) {
    if (!document.storage_path || documents.has(document.storage_path)) continue;
    documents.set(document.storage_path, document);
  }
  for (const document of legacy) {
    if (!document.path || documents.has(document.path)) continue;
    documents.set(document.path, {
      kind: document.kind,
      storage_path: document.path,
      original_name: document.name || defaultDocumentName(document.kind),
      mime_type: null,
      size_bytes: null,
      created_at: "",
    });
  }
  return [...documents.values()];
}

export function isMissingDocumentsRelation(error: { code?: string; message?: string }) {
  return error.code === "42P01"
    || error.code === "PGRST205"
    || /account_request_documents.*(?:not find|does not exist)/i.test(error.message || "");
}

export function readSubjectScores(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const subject = String((row as Record<string, unknown>).subject || "").trim().slice(0, 80);
    const score = String((row as Record<string, unknown>).score || "").trim().slice(0, 24);
    return subject && score ? [{ subject, score }] : [];
  });
}

export function readContractSnapshot(value: unknown) {
  const empty = {
    title: "",
    intro: "",
    clauses: [] as Array<{ title: string; paragraphs: string[] }>,
    company: [] as Array<[string, string]>,
  };
  if (!value || typeof value !== "object" || Array.isArray(value)) return empty;
  const record = value as Record<string, unknown>;
  const clauses = Array.isArray(record.clauses)
    ? record.clauses.flatMap((rawClause) => {
        if (!rawClause || typeof rawClause !== "object" || Array.isArray(rawClause)) return [];
        const clause = rawClause as Record<string, unknown>;
        const title = String(clause.title || "").trim();
        const paragraphs = Array.isArray(clause.paragraphs)
          ? clause.paragraphs.map((paragraph) => String(paragraph || "").trim()).filter(Boolean)
          : [];
        return title || paragraphs.length ? [{ title, paragraphs }] : [];
      })
    : [];
  const company = record.company && typeof record.company === "object" && !Array.isArray(record.company)
    ? Object.entries(record.company as Record<string, unknown>)
        .map(([key, raw]) => [key, String(raw || "").trim()] as [string, string])
        .filter((entry) => entry[1])
    : [];
  return {
    title: String(record.title || "").trim(),
    intro: String(record.intro || "").trim(),
    clauses,
    company,
  };
}

function defaultDocumentName(kind: TutorDocumentKind) {
  return kind === "school_proof" ? "학적증명서" : "성적·자격 증빙";
}
