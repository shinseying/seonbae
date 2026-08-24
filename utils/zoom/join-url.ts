// Prefer the stored join_url (it embeds the encrypted passcode). Legacy
// meetings saved before join_url was persisted fall back to a bare meeting
// link; the desktop app then prompts for the passcode shown on the page.
export function zoomJoinUrl(
  joinUrl: string | null | undefined,
  meetingNumber: string | null | undefined,
) {
  if (joinUrl) return joinUrl;
  if (meetingNumber) return `https://zoom.us/j/${meetingNumber}`;
  return null;
}
