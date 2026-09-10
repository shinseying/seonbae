export type TutorCardChoice =
  | { mode: "create"; registryId: null }
  | { mode: "link"; registryId: string };

export function parseTutorCardChoice(
  mode: unknown,
  registryId: unknown,
): TutorCardChoice | null {
  if (mode === "create") return { mode, registryId: null };
  if (mode !== "link" || typeof registryId !== "string") return null;

  const cleanRegistryId = registryId.trim().slice(0, 24);
  return cleanRegistryId ? { mode, registryId: cleanRegistryId } : null;
}
