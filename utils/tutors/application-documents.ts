type ApplicationDocumentPaths = {
  acceptance_letter_path: string | null;
  credential_path: string | null;
};

type NormalizedDocumentPath = {
  storage_path: string | null;
};

export function collectApplicationDocumentPaths(
  application: ApplicationDocumentPaths,
  normalizedDocuments: NormalizedDocumentPath[],
) {
  const paths = [
    application.acceptance_letter_path,
    application.credential_path,
    ...normalizedDocuments.map((document) => document.storage_path),
  ];

  return [...new Set(paths.flatMap((path) => {
    return typeof path === "string" && path.trim() ? [path] : [];
  }))];
}
