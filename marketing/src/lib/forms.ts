// ---------------------------------------------------------------------------
// One submission path for every form on the site.
//
// The marketing shell submits to the production Next.js API. The API applies
// the same rate limits, Supabase persistence, and admissions notification used
// by the existing site.
// ---------------------------------------------------------------------------

export const FORM_ENDPOINT = '/api/consultations';

export type SubmitMode = 'posted';

// The merged goal field opens with the subject, so its first line is the best
// short label for the admin list.
const firstLine = (value?: string) =>
  (value || '').split('\n')[0].trim().slice(0, 120);

export const readForm = (form: HTMLFormElement): Record<string, string> => {
  const out: Record<string, string> = {};
  new FormData(form).forEach((value, key) => {
    if (typeof value !== 'string') return;
    out[key] = out[key] ? `${out[key]}, ${value}` : value;
  });
  return out;
};

/**
 * Sends the form through the production consultation endpoint. Page-specific
 * data attributes allow each visual form to keep its own field names while the
 * API receives the stable consultation contract.
 */
export async function submitForm(form: HTMLFormElement, subject: string): Promise<SubmitMode> {
  const data = readForm(form);

  // Honeypot: bots fill hidden fields, people do not.
  if (data.company) return 'posted';

  // The level answer is the curriculum now: the matching form no longer asks a
  // separate subject, and the goal field carries the subject with it.
  const curriculum = data.curriculum || data.level || data.subject || 'General enquiry';
  const detailLines = [
    data.goal && `Subject and goal: ${data.goal}`,

    data.preference && `Lesson preference: ${data.preference}`,
    data.context && `Context: ${data.context}`,
    data.note && `Additional note: ${data.note}`,
  ].filter(Boolean);
  const goals = detailLines.join('\n') || subject;

  const res = await fetch(FORM_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({
      name: data.student || data.name || 'Newsletter subscriber',
      email: data.email,
      phone: data.phone || '',
      curriculum,
      preferredTutor: data.preferredTutor || 'Manager consultation',
      preferredTimes: data.times || '',
      subject: data.subject || firstLine(data.goal) || subject,
      goals,
      language: document.documentElement.dataset.lang === 'en' ? 'en' : 'ko',
      source: 'website',
      website: data.company || '',
    }),
  });

  const result = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof result.error === 'string' ? result.error : 'The request could not be saved.');
  }
  return 'posted';
}

/** Marks the first invalid control, focuses it, and returns whether the form passed. */
export function validate(form: HTMLFormElement, scope: ParentNode = form): boolean {
  const controls = [...scope.querySelectorAll('input, select, textarea')] as HTMLInputElement[];
  for (const c of controls) {
    if (c.type === 'hidden' || c.disabled) continue;
    if (!c.checkValidity()) {
      c.reportValidity();
      c.focus();
      return false;
    }
  }
  return true;
}
