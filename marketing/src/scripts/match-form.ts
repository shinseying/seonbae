import { submitForm } from '../lib/forms';

const DRAFT_KEY = 'seonbae-match-draft';
const MANAGER = 'Manager consultation';
const CURRICULA = new Set([
  'ib-diploma', 'advanced-placement', 'a-level', 'igcse',
  'standardized-tests', 'english-writing',
]);

type Tutor = {
  registry_id: string;
  name: string;
  name_en?: string;
  exam: string;
  score: string;
  category?: string;
  university?: string;
  university_en?: string;
  photo_url?: string | null;
};

type Draft = {
  version: 1;
  step: number;
  values: Record<string, string[]>;
};

const form = document.getElementById('match-form') as HTMLFormElement | null;
const steps = [...(form?.querySelectorAll<HTMLElement>('.step') ?? [])];
const segs = [...document.querySelectorAll<HTMLElement>('.progress-seg')];
const back = document.getElementById('btn-back') as HTMLButtonElement | null;
const next = document.getElementById('btn-next') as HTMLButtonElement | null;
const done = document.getElementById('match-done') as HTMLElement | null;
const nextLabel = next?.querySelector<HTMLElement>('[data-next-label]') ?? null;
const stepLive = form?.querySelector<HTMLElement>('[data-step-live]') ?? null;
let stepIndex = 0;

const language = () => document.documentElement.dataset.lang === 'en' ? 'en' : 'ko';
const tr = (en: string, ko: string) => language() === 'en' ? en : ko;
const setText = (node: HTMLElement | null, en: string, ko: string) => {
  if (node) node.textContent = tr(en, ko);
};

const refreshDynamicLanguage = () => {
  if (pickerLabel?.dataset.manager === 'true' || pickerValue?.value === MANAGER) {
    setText(pickerLabel, 'Consult with the team', '매니저와 상담');
  }
  if (nextLabel && !next?.disabled) {
    nextLabel.textContent = stepIndex === steps.length - 1 ? tr('Submit', '상담 신청') : tr('Continue', '계속하기');
  }
  const doneNote = document.getElementById('match-done-note');
  if (doneNote && !doneNote.dataset.state) {
    doneNote.textContent = language() === 'en' ? (doneNote.dataset.defaultEn || '') : (doneNote.dataset.defaultKo || '');
  }
};

const showStep = (nextStep: number, announce = true) => {
  const safeStep = Math.max(0, Math.min(steps.length - 1, nextStep));
  steps.forEach((step, index) => {
    step.hidden = index !== safeStep;
    step.classList.toggle('is-current', index === safeStep);
  });
  segs.forEach((segment, index) => {
    segment.classList.toggle('is-active', index === safeStep);
    segment.classList.toggle('is-done', index < safeStep);
  });
  if (back) back.hidden = safeStep === 0;
  stepIndex = safeStep;
  refreshDynamicLanguage();
  if (announce && stepLive) {
    const label = segs[safeStep]?.querySelector('.progress-label')?.textContent?.trim() || '';
    stepLive.textContent = tr(`Step ${safeStep + 1} of ${steps.length}: ${label}`, `${steps.length}단계 중 ${safeStep + 1}단계: ${label}`);
  }
};

const valuesForDraft = (): Record<string, string[]> => {
  if (!form) return {};
  const values: Record<string, string[]> = {};
  new FormData(form).forEach((value, key) => {
    if (key === 'company' || typeof value !== 'string') return;
    (values[key] ||= []).push(value);
  });
  return values;
};

const saveDraft = (furthestStep = stepIndex + 1) => {
  try {
    const previous = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null') as Draft | null;
    const draft: Draft = {
      version: 1,
      step: Math.max(previous?.step || 1, furthestStep),
      values: valuesForDraft(),
    };
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {}
};

const restoreDraft = (): Draft | null => {
  if (!form) return null;
  try {
    const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null') as Draft | null;
    if (!draft || draft.version !== 1 || !draft.values) return null;
    [...form.elements].forEach((element) => {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) return;
      if (!element.name || element.name === 'company') return;
      const values = draft.values[element.name] || [];
      if (element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio')) {
        element.checked = values.includes(element.value);
      } else if (values.length) {
        element.value = values[0];
      }
    });
    return draft;
  } catch {
    return null;
  }
};

const stepFromHash = () => {
  const match = location.hash.match(/^#step-(\d)$/);
  const step = match ? Number(match[1]) : 1;
  return step >= 1 && step <= steps.length ? step : 1;
};

const initialiseStepHistory = (targetStep: number) => {
  const base = `${location.pathname}${location.search}`;
  history.replaceState({ ...(history.state || {}), matchStep: 1 }, '', `${base}#step-1`);
  for (let step = 2; step <= targetStep; step++) {
    history.pushState({ matchStep: step }, '', `${base}#step-${step}`);
  }
  showStep(targetStep - 1, false);
};

// ----- Subject picker ------------------------------------------------------
const subjectBox = form?.querySelector<HTMLElement>('[data-subject-combobox]') ?? null;
const subjectSearch = subjectBox?.querySelector<HTMLInputElement>('[data-subject-search]') ?? null;
const subjectMenu = subjectBox?.querySelector<HTMLElement>('[data-subject-menu]') ?? null;
const subjectOptions = [...(subjectMenu?.querySelectorAll<HTMLButtonElement>('[data-subject-option]') ?? [])];
const subjectEmpty = subjectMenu?.querySelector<HTMLElement>('[data-subject-empty]') ?? null;
const subjectValue = form?.querySelector<HTMLInputElement>('[data-subject-value]') ?? null;
const subjectSlug = form?.querySelector<HTMLInputElement>('[data-subject-slug]') ?? null;
const curriculumValue = form?.querySelector<HTMLInputElement>('[data-curriculum-value]') ?? null;
const subjectConfirm = form?.querySelector<HTMLElement>('[data-subject-confirm]') ?? null;
const subjectConfirmName = subjectConfirm?.querySelector<HTMLElement>('[data-subject-confirm-name]') ?? null;
const subjectConfirmPrice = subjectConfirm?.querySelector<HTMLElement>('[data-subject-confirm-price]') ?? null;

const selectedLevel = () => (form?.querySelector<HTMLInputElement>('input[name="level"]:checked')?.value || 'unsure');
const activeCurriculum = () => curriculumValue?.value || (CURRICULA.has(selectedLevel()) ? selectedLevel() : '');

const setSubjectMenu = (open: boolean) => {
  if (!subjectMenu || !subjectSearch) return;
  subjectMenu.hidden = !open;
  subjectSearch.setAttribute('aria-expanded', String(open));
};

const formatWon = (value: string) => `₩${new Intl.NumberFormat('ko-KR').format(Number(value))}`;

const selectSubject = (option: HTMLButtonElement, save = true) => {
  const slug = option.dataset.slug || '';
  const name = option.dataset.name || '';
  const displayName = language() === 'en' ? name : (option.dataset.nameKo || name);
  const curriculum = option.dataset.curriculum || '';
  const price = option.dataset.price || '';
  if (subjectSearch) {
    subjectSearch.value = displayName;
    subjectSearch.setCustomValidity('');
  }
  if (subjectValue) subjectValue.value = name;
  if (subjectSlug) subjectSlug.value = slug;
  if (curriculumValue) curriculumValue.value = curriculum || (CURRICULA.has(selectedLevel()) ? selectedLevel() : '');
  subjectOptions.forEach((item) => item.setAttribute('aria-selected', String(item === option)));
  if (curriculum) {
    const radio = form?.querySelector<HTMLInputElement>(`input[name="level"][value="${curriculum}"]`);
    if (radio) radio.checked = true;
  }
  if (subjectConfirm && subjectConfirmName && subjectConfirmPrice) {
    subjectConfirm.hidden = false;
    subjectConfirmName.textContent = displayName;
    subjectConfirmPrice.textContent = price ? `${formatWon(price)} ${tr('/ hr', '/ 시간')}` : tr('We will help you choose', '상담에서 함께 선택');
  }
  setSubjectMenu(false);
  renderTutorOptions();
  if (save) saveDraft();
};

const filterSubjects = () => {
  const query = subjectSearch?.value.trim().toLowerCase() || '';
  let shown = 0;
  subjectOptions.forEach((option) => {
    const match = !query || (option.dataset.search || '').includes(query);
    option.hidden = !match;
    if (match) shown++;
  });
  subjectMenu?.querySelectorAll<HTMLElement>('[data-subject-group]').forEach((group) => {
    group.hidden = !group.querySelector('[data-subject-option]:not([hidden])');
  });
  if (subjectEmpty) subjectEmpty.hidden = shown > 0;
};

subjectSearch?.addEventListener('focus', () => { filterSubjects(); setSubjectMenu(true); });
subjectSearch?.addEventListener('input', () => {
  if (subjectSlug?.value) {
    if (subjectSlug) subjectSlug.value = '';
    if (subjectValue) subjectValue.value = '';
    if (curriculumValue) curriculumValue.value = CURRICULA.has(selectedLevel()) ? selectedLevel() : '';
    if (subjectConfirm) subjectConfirm.hidden = true;
  }
  filterSubjects();
  setSubjectMenu(true);
  saveDraft();
});
subjectSearch?.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') { setSubjectMenu(false); return; }
  if (event.key !== 'ArrowDown') return;
  event.preventDefault();
  subjectOptions.find((option) => !option.hidden)?.focus();
});
subjectOptions.forEach((option) => {
  option.addEventListener('click', () => selectSubject(option));
  option.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { setSubjectMenu(false); subjectSearch?.focus(); return; }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const visible = subjectOptions.filter((item) => !item.hidden);
    const index = visible.indexOf(option);
    visible[(index + (event.key === 'ArrowDown' ? 1 : -1) + visible.length) % visible.length]?.focus();
  });
});

// ----- Tutor picker --------------------------------------------------------
const picker = document.querySelector<HTMLElement>('[data-tutor-picker]');
const pickerTrigger = picker?.querySelector<HTMLButtonElement>('.tutor-picker__trigger') ?? null;
const pickerMenu = picker?.querySelector<HTMLElement>('.tutor-picker__menu') ?? null;
const pickerOptions = picker?.querySelector<HTMLElement>('[data-tutor-options]') ?? null;
const pickerSearch = picker?.querySelector<HTMLInputElement>('[data-tutor-search]') ?? null;
const pickerValue = picker?.querySelector<HTMLInputElement>('[data-tutor-value]') ?? null;
const pickerLabel = picker?.querySelector<HTMLElement>('[data-tutor-label]') ?? null;
const pickerEmpty = picker?.querySelector<HTMLElement>('[data-tutor-empty]') ?? null;
const matchContext = form?.querySelector<HTMLElement>('[data-match-context]') ?? null;
const contextName = matchContext?.querySelector<HTMLElement>('[data-context-name]') ?? null;
const clearTutor = matchContext?.querySelector<HTMLButtonElement>('[data-clear-tutor]') ?? null;
let tutors: Tutor[] = [];

const curriculumAliases: Record<string, string[]> = {
  'ib-diploma': ['IB'],
  'advanced-placement': ['AP', 'ADVANCED PLACEMENT'],
  'a-level': ['A LEVEL', 'A-LEVEL'],
  igcse: ['IGCSE', 'GCSE'],
  'standardized-tests': ['SAT', 'ACT', 'TOEFL', 'IELTS'],
  'english-writing': ['ENGLISH', 'IELTS', 'TOEFL'],
};

const matchingTutors = () => {
  const aliases = curriculumAliases[activeCurriculum()] || [];
  if (!aliases.length) return tutors;
  return tutors.filter((tutor) => {
    const haystack = `${tutor.exam} ${tutor.category || ''}`.toUpperCase();
    return aliases.some((alias) => haystack.includes(alias));
  });
};

const initials = (name: string) => name.trim().slice(0, 1).toUpperCase() || 'S';
const escapeHtml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');

const filterTutorOptions = () => {
  const query = pickerSearch?.value.trim().toLowerCase() || '';
  let shown = 0;
  pickerOptions?.querySelectorAll<HTMLElement>('.tutor-option').forEach((option) => {
    const match = !query || (option.dataset.search || '').includes(query);
    option.hidden = !match;
    if (match && option.dataset.value !== MANAGER) shown++;
  });
  if (pickerEmpty) pickerEmpty.hidden = shown > 0;
};

const setTutorMenu = (open: boolean) => {
  if (!pickerTrigger || !pickerMenu) return;
  pickerTrigger.setAttribute('aria-expanded', String(open));
  pickerMenu.hidden = !open;
  if (open) requestAnimationFrame(() => pickerSearch?.focus());
};

const selectTutorOption = (option: HTMLButtonElement, fromQuery = false) => {
  pickerOptions?.querySelectorAll('.tutor-option').forEach((node) => {
    node.classList.remove('is-selected');
    node.setAttribute('aria-selected', 'false');
  });
  option.classList.add('is-selected');
  option.setAttribute('aria-selected', 'true');
  const value = option.dataset.value || MANAGER;
  if (pickerValue) pickerValue.value = value;
  if (pickerLabel) {
    pickerLabel.dataset.manager = String(value === MANAGER);
    pickerLabel.textContent = option.querySelector('strong')?.textContent || value;
  }
  const tutor = tutors.find((row) => row.registry_id === option.dataset.tutorId);
  if (matchContext && contextName) {
    matchContext.hidden = !tutor;
    contextName.textContent = tutor ? (language() === 'en' ? (tutor.name_en || tutor.name) : tutor.name) : '';
  }
  if (!fromQuery) saveDraft();
  setTutorMenu(false);
  refreshDynamicLanguage();
};

const resetTutor = (updateUrl = false) => {
  const manager = pickerOptions?.querySelector<HTMLButtonElement>('[data-value="Manager consultation"]');
  if (manager) selectTutorOption(manager);
  if (matchContext) matchContext.hidden = true;
  if (updateUrl) {
    const url = new URL(location.href);
    url.searchParams.delete('tutor');
    history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }
};

const renderTutorOptions = () => {
  if (!pickerOptions) return;
  pickerOptions.querySelectorAll('.tutor-option:not([data-value="Manager consultation"])').forEach((node) => node.remove());
  const fragment = document.createDocumentFragment();
  matchingTutors().forEach((tutor) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tutor-option';
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', 'false');
    button.dataset.value = tutor.name;
    button.dataset.tutorId = tutor.registry_id;
    button.dataset.search = `${tutor.name} ${tutor.name_en || ''} ${tutor.university || ''} ${tutor.university_en || ''} ${tutor.exam} ${tutor.score}`.toLowerCase();
    const avatar = tutor.photo_url
      ? `<span class="tutor-option__avatar"><img src="${escapeHtml(tutor.photo_url)}" alt="" /></span>`
      : `<span class="tutor-option__avatar">${escapeHtml(initials(tutor.name))}</span>`;
    const name = language() === 'en' ? (tutor.name_en || tutor.name) : tutor.name;
    button.innerHTML = `${avatar}<span><strong>${escapeHtml(name)}</strong><small>${escapeHtml(tutor.university || tutor.university_en || '')} · ${escapeHtml(tutor.exam)} ${escapeHtml(tutor.score)}</small></span>`;
    fragment.append(button);
  });
  pickerOptions.append(fragment);
  if (pickerEmpty) pickerEmpty.hidden = matchingTutors().length > 0;
  filterTutorOptions();
};

pickerTrigger?.addEventListener('click', () => setTutorMenu(Boolean(pickerMenu?.hidden)));
pickerSearch?.addEventListener('input', filterTutorOptions);
pickerSearch?.addEventListener('keydown', (event) => { if (event.key === 'Escape') { setTutorMenu(false); pickerTrigger?.focus(); } });
pickerOptions?.addEventListener('click', (event) => {
  const option = (event.target as HTMLElement).closest<HTMLButtonElement>('.tutor-option');
  if (option) selectTutorOption(option);
});
clearTutor?.addEventListener('click', () => resetTutor(true));

// ----- Timezone-aware consultation slots ---------------------------------
const dateField = form?.querySelector<HTMLInputElement>('#m-date') ?? null;
const timezoneNote = form?.querySelector<HTMLElement>('[data-timezone-note]') ?? null;
const localTimes = [...(form?.querySelectorAll<HTMLElement>('[data-local-time]') ?? [])];
let visitorTimezone = '';
try { visitorTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch {}

const kstDate = () => {
  if (dateField?.value) return dateField.value;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const pick = (type: string) => parts.find((part) => part.type === type)?.value || '';
    return `${pick('year')}-${pick('month')}-${pick('day')}`;
  } catch { return new Date().toISOString().slice(0, 10); }
};

const refreshSlotTimes = () => {
  if (!visitorTimezone) {
    localTimes.forEach((node) => { node.textContent = ''; });
    if (timezoneNote) timezoneNote.hidden = true;
    return;
  }
  if (timezoneNote) {
    timezoneNote.hidden = false;
    timezoneNote.textContent = tr(`Your local timezone: ${visitorTimezone}`, `현재 기기 시간대: ${visitorTimezone}`);
  }
  const [year, month, day] = kstDate().split('-').map(Number);
  localTimes.forEach((node) => {
    const [hour, minute] = (node.dataset.slot || '').split(':').map(Number);
    if (![year, month, day, hour, minute].every(Number.isFinite)) { node.textContent = ''; return; }
    const instant = new Date(Date.UTC(year, month - 1, day, hour - 9, minute));
    try {
      const local = new Intl.DateTimeFormat(language() === 'en' ? 'en-GB' : 'ko-KR', {
        timeZone: visitorTimezone,
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }).format(instant);
      node.textContent = visitorTimezone === 'Asia/Seoul' ? tr('your time', '현지 시간') : `${local} ${tr('your time', '현지')}`;
    } catch { node.textContent = ''; }
  });
};

if (dateField) dateField.min = kstDate();
dateField?.addEventListener('change', refreshSlotTimes);

// ----- Initial data, query context, and form navigation -------------------
const draft = restoreDraft();
const savedSubject = subjectOptions.find((option) => option.dataset.slug === subjectSlug?.value);
if (savedSubject) selectSubject(savedSubject, false);

const params = new URLSearchParams(location.search);
const incomingCurriculum = params.get('curriculum');
if (incomingCurriculum && CURRICULA.has(incomingCurriculum)) {
  const radio = form?.querySelector<HTMLInputElement>(`input[name="level"][value="${incomingCurriculum}"]`);
  if (radio) radio.checked = true;
  if (curriculumValue) curriculumValue.value = incomingCurriculum;
}
const incomingSubject = params.get('subject');
const incomingSubjectOption = subjectOptions.find((option) => option.dataset.slug === incomingSubject);
if (incomingSubjectOption) selectSubject(incomingSubjectOption, false);

form?.querySelectorAll<HTMLInputElement>('input[name="level"]').forEach((input) => input.addEventListener('change', () => {
  if (!subjectSlug?.value || subjectSlug.value === 'not-sure') {
    if (curriculumValue) curriculumValue.value = CURRICULA.has(input.value) ? input.value : '';
    renderTutorOptions();
  }
  saveDraft();
}));

const requestedTutor = params.get('tutor');
fetch('/api/tutors', { cache: 'no-store', headers: { Accept: 'application/json' } })
  .then((response) => response.ok ? response.json() : [])
  .then((rows) => {
    tutors = Array.isArray(rows) ? rows : [];
    renderTutorOptions();
    if (requestedTutor) {
      const tutor = tutors.find((row) => row.registry_id === requestedTutor);
      const option = tutor ? pickerOptions?.querySelector<HTMLButtonElement>(`[data-tutor-id="${tutor.registry_id}"]`) : null;
      if (option) selectTutorOption(option, true);
    } else if (pickerValue?.value && pickerValue.value !== MANAGER) {
      const option = [...(pickerOptions?.querySelectorAll<HTMLButtonElement>('.tutor-option') ?? [])]
        .find((item) => item.dataset.value === pickerValue.value);
      if (option) selectTutorOption(option, true);
      else resetTutor();
    }
  })
  .catch(() => { tutors = []; renderTutorOptions(); });

document.addEventListener('click', (event) => {
  const target = event.target as Node;
  if (subjectBox && !subjectBox.contains(target)) setSubjectMenu(false);
  if (picker && !picker.contains(target)) setTutorMenu(false);
});

const validStep = () => {
  if (!steps[stepIndex]) return false;
  if (stepIndex === 1 && !subjectValue?.value) {
    subjectSearch?.setCustomValidity(tr('Choose a subject from the list or select “Not sure yet”.', '목록에서 과목을 고르거나 ‘아직 잘 모르겠어요’를 선택해 주세요.'));
  }
  const controls = steps[stepIndex].querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input[required], textarea[required], select[required]');
  for (const control of controls) {
    if (!control.checkValidity()) { control.reportValidity(); control.focus(); return false; }
  }
  return true;
};

form?.addEventListener('input', () => saveDraft());
form?.addEventListener('change', () => saveDraft());

next?.addEventListener('click', async () => {
  if (!validStep()) return;
  if (stepIndex < steps.length - 1) {
    const nextStep = stepIndex + 2;
    saveDraft(nextStep);
    history.pushState({ matchStep: nextStep }, '', `${location.pathname}${location.search}#step-${nextStep}`);
    showStep(nextStep - 1);
    steps[nextStep - 1]?.querySelector<HTMLElement>('input:not([type="hidden"]), textarea, button')?.focus({ preventScroll: true });
    return;
  }
  if (!form) return;
  next.disabled = true;
  if (nextLabel) nextLabel.textContent = tr('Sending…', '전송 중…');
  let failed = false;
  try {
    await submitForm(form, 'New matching request from seonbaetutor.com');
    sessionStorage.removeItem(DRAFT_KEY);
  } catch { failed = true; }
  next.disabled = false;
  if (nextLabel) nextLabel.textContent = tr('Submit', '상담 신청');
  const note = document.getElementById('match-done-note');
  if (note && failed) {
    note.dataset.state = 'failed';
    note.textContent = tr(
      'Something went wrong on our side. Please email admissions@seonbaetutor.com with your subject and level, and we will match you straight away.',
      '처리 중 문제가 생겼습니다. 과목과 학년을 admissions@seonbaetutor.com으로 보내주시면 바로 매칭을 도와드리겠습니다.',
    );
  }
  form.hidden = true;
  const progress = document.getElementById('progress');
  if (progress) progress.hidden = true;
  if (done) { done.hidden = false; done.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
});

back?.addEventListener('click', () => { if (stepIndex > 0) history.back(); });
window.addEventListener('popstate', (event) => {
  const stateStep = Number(event.state?.matchStep || stepFromHash());
  if (stateStep >= 1 && stateStep <= steps.length) showStep(stateStep - 1);
});

const initialStep = Math.max(stepFromHash(), Math.min(steps.length, Math.max(1, draft?.step || 1)));
initialiseStepHistory(initialStep);
if (pickerLabel) pickerLabel.dataset.manager = String(!pickerValue?.value || pickerValue.value === MANAGER);
if (pickerValue && !pickerValue.value) pickerValue.value = MANAGER;
refreshSlotTimes();
refreshDynamicLanguage();
