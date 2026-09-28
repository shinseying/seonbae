export const HOMEWORK_STATUSES = ["todo", "submitted", "graded", "needs_revision"] as const;

export type HomeworkStatus = (typeof HOMEWORK_STATUSES)[number];
export type HomeworkGroup = "assigned" | "submitted" | "returned";

export function homeworkGroup(status: HomeworkStatus): HomeworkGroup {
  if (status === "submitted") return "submitted";
  if (status === "graded") return "returned";
  return "assigned";
}

export function canTurnIn(status: HomeworkStatus) {
  return status === "todo" || status === "needs_revision";
}

export function canUndoTurnIn(status: HomeworkStatus) {
  return status === "submitted";
}

// Work that is turned in but not yet returned can be replaced: the new file
// overwrites the previous submission.
export function canReplaceSubmission(status: HomeworkStatus) {
  return status === "submitted";
}
