import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const baseUrl = process.env.SEONBAE_QA_URL || 'http://127.0.0.1:4174';
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const debugPort = 9337;
const profile = await mkdtemp(join(tmpdir(), 'seonbae-chrome-qa-'));
const artifactDir = process.env.SEONBAE_QA_ARTIFACTS;
let chrome;
let cdp;

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

class Cdp {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.ws = new WebSocket(url);
    this.ws.addEventListener('message', async (event) => {
      const raw = typeof event.data === 'string'
        ? event.data
        : event.data instanceof Blob
          ? await event.data.text()
          : Buffer.from(event.data).toString('utf8');
      const message = JSON.parse(raw);
      if (!message.id) return;
      const handler = this.pending.get(message.id);
      if (!handler) return;
      this.pending.delete(message.id);
      clearTimeout(handler.timeout);
      if (message.error) handler.reject(new Error(message.error.message));
      else handler.resolve(message.result);
    });
    this.ws.addEventListener('close', () => {
      for (const handler of this.pending.values()) {
        clearTimeout(handler.timeout);
        handler.reject(new Error('Chrome debugging connection closed'));
      }
      this.pending.clear();
    });
  }
  async ready() {
    if (this.ws.readyState === WebSocket.OPEN) return;
    await new Promise((resolvePromise, reject) => {
      this.ws.addEventListener('open', resolvePromise, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
  }
  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolvePromise, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Chrome debugging command timed out: ${method}`));
      }, 5000);
      this.pending.set(id, { resolve: resolvePromise, reject, timeout });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Browser evaluation failed');
    return result.result.value;
  }
  close() { this.ws.close(); }
}

async function waitForChrome() {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const tabs = await fetch(`http://127.0.0.1:${debugPort}/json`).then((response) => response.json());
      const page = tabs.find((tab) => tab.type === 'page' && !tab.url.startsWith('chrome-extension://'));
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(100);
  }
  throw new Error('Chrome debugging endpoint did not become ready');
}

async function navigate(cdp, path) {
  const target = new URL(path, baseUrl);
  const targetPath = target.pathname.length > 1 ? target.pathname.replace(/\/+$/, '') : '/';
  await cdp.send('Page.navigate', { url: target.href });
  for (let attempt = 0; attempt < 80; attempt++) {
    if (await cdp.evaluate(`document.readyState === "complete" && (location.pathname.length > 1 ? location.pathname.replace(/\\\/+$/, '') : '/') === ${JSON.stringify(targetPath)}`)) {
      await sleep(250);
      return;
    }
    await sleep(100);
  }
  const state = await cdp.evaluate('({ href: location.href, ready: document.readyState, title: document.title })');
  throw new Error(`Page did not load: ${path}; ${JSON.stringify(state)}`);
}

async function capture(name) {
  if (!artifactDir) return;
  await mkdir(artifactDir, { recursive: true });
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  await writeFile(join(artifactDir, `${name}.png`), Buffer.from(shot.data, 'base64'));
}

const mockTutors = [
  {
    registry_id: 'P-QA1', name: '김아이비', name_en: 'Ivy Kim', exam: 'IB', score: '44/45',
    category: 'IB', university: '고려대학교', university_en: 'Korea University',
    subject_scores: [
      { subject: 'IB Chemistry HL', score: '7' },
      { subject: 'IB Mathematics AA HL', score: '7' },
      { subject: 'IB Physics HL', score: '6' },
    ],
    bio: '학생이 스스로 풀이의 논리를 설명할 수 있도록 개념과 기출을 연결합니다. 긴 소개글도 카드에서는 두 줄까지만 보여야 합니다. 이 문장은 줄임 처리를 검증하기 위해 일부러 더 길게 작성했습니다.',
    bio_en: 'I connect concepts with past-paper reasoning until students can explain each step independently. This deliberately long biography must stay clamped to two lines on the directory card.',
    video_url: '/sample.mp4', languages: 'Korean, English', lesson_format: 'Online 1:1',
    availability: { mon: ['09:00-10:30', '17:00-18:00'], wed: ['12:00-13:00'] },
    display_order: 1, created_at: '2026-08-01T00:00:00Z', active: true,
  },
  {
    registry_id: 'P-QA2', name: '박에이레벨', name_en: 'Alex Park', exam: 'A Level', score: '.',
    category: 'A Level', university: '서울대학교', university_en: 'Seoul National University',
    subject_scores: [{ subject: 'A Level Mathematics', score: 'A*' }, { subject: 'A Level Chemistry', score: 'A*' }],
    availability: {}, display_order: 2, created_at: '2026-08-03T00:00:00Z', active: true,
  },
  {
    registry_id: 'P-QA3', name: '최에이피', name_en: 'April Choi', exam: 'AP', score: '.',
    category: 'AP', university: '연세대학교', university_en: 'Yonsei University',
    subject_scores: [{ subject: 'AP Calculus BC', score: '5/5' }, { subject: 'AP Chemistry', score: '5/5' }],
    availability: {}, display_order: 3, created_at: '2026-08-04T00:00:00Z', active: true,
  },
  {
    registry_id: 'P-QA4', name: '정경제', name_en: 'Econ Jung', exam: 'IB', score: '42/45',
    category: 'IB', university: '서울대학교', university_en: 'Seoul National University',
    subject_scores: [{ subject: 'IB Economics HL', score: '7' }],
    availability: {}, display_order: 4, created_at: '2026-08-05T00:00:00Z', active: true,
  },
  {
    registry_id: 'P-QA5', name: '한테스트', name_en: 'Test Han', exam: 'SAT', score: '1540',
    category: 'SAT', university: '고려대학교', university_en: 'Korea University',
    subject_scores: [{ subject: 'SAT Math', score: '790' }, { subject: 'SAT Reading and Writing', score: '750' }],
    availability: {}, display_order: 5, created_at: '2026-08-06T00:00:00Z', active: true,
  },
  {
    registry_id: 'P-QA6', name: '윤생물', name_en: 'Bio Yoon', exam: 'AP', score: '5/5',
    category: 'AP', university: '고려대학교', university_en: 'Korea University',
    subject_scores: [{ subject: 'AP Biology', score: '5/5' }],
    availability: {}, display_order: 6, created_at: '2026-08-07T00:00:00Z', active: true,
  },
];

try {
  chrome = spawn(chromePath, [
    '--headless=new', '--disable-gpu', '--disable-gpu-sandbox', '--no-sandbox',
    '--no-first-run', '--no-default-browser-check',
    '--remote-allow-origins=*',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore', windowsHide: true });
  const wsUrl = await waitForChrome();
  cdp = new Cdp(wsUrl);
  await cdp.ready();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Page.bringToFront');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 3, mobile: true });
  await cdp.send('Emulation.setTimezoneOverride', { timezoneId: 'Europe/London' });
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `{
      const nativeFetch = window.fetch.bind(window);
      const tutors = ${JSON.stringify(mockTutors)};
      window.__bookingRequests = [];
      window.fetch = (input, init) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url === '/api/tutors') return Promise.resolve(new Response(JSON.stringify(tutors), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        if (url === '/api/auth/session') {
          const signedOut = new URLSearchParams(location.search).get('qa-auth') === 'out';
          return Promise.resolve(new Response(JSON.stringify(signedOut
            ? { authenticated: false }
            : { authenticated: true, role: 'student' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        if (url === '/api/bookings') {
          window.__bookingRequests.push(JSON.parse(init?.body || '{}'));
          return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        if (url === '/api/consultations') return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        return nativeFetch(input, init);
      };
    }`,
  });

  for (const width of [375, 390, 430]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 812, deviceScaleFactor: 3, mobile: true });
    await navigate(cdp, '/pricing/');
    const mobile = await cdp.evaluate(`(async () => {
      const input = document.querySelector('.rb__input');
      const tabs = document.querySelector('.rb__tabs');
      const header = document.querySelector('.site-header');
      const sticky = document.querySelector('.rb__head');
      const reveal = sticky.closest('.reveal');
      reveal?.classList.add('is-in');
      if (reveal) { reveal.style.transition = 'none'; reveal.style.transform = 'none'; }
      document.documentElement.style.scrollBehavior = 'auto';
      const stickyDocumentTop = sticky.getBoundingClientRect().top + scrollY;
      scrollTo(0, stickyDocumentTop + 500);
      await new Promise(r => setTimeout(r, 80));
      return {
        font: getComputedStyle(input).fontSize,
        wrap: getComputedStyle(tabs).flexWrap,
        scrollable: tabs.scrollWidth > tabs.clientWidth,
        bodyFits: document.documentElement.scrollWidth <= innerWidth,
        gap: Math.abs(sticky.getBoundingClientRect().top - header.getBoundingClientRect().bottom),
        stickyTop: sticky.getBoundingClientRect().top,
        headerTop: header.getBoundingClientRect().top,
        headerBottom: header.getBoundingClientRect().bottom,
        headerHeight: header.getBoundingClientRect().height,
        headerVar: getComputedStyle(document.documentElement).getPropertyValue('--header-h'),
        computedTop: getComputedStyle(sticky).top,
        marginTop: getComputedStyle(sticky).marginTop,
        parentTransform: getComputedStyle(sticky.parentElement).transform,
        scrollY,
        scrollHeight: document.documentElement.scrollHeight,
        rows: document.querySelectorAll('.rb__row:not(.is-hidden)').length,
        viewport: document.querySelector('meta[name="viewport"]').content,
      };
    })()`);
    assert.equal(mobile.font, '16px');
    assert.equal(mobile.wrap, 'nowrap');
    assert.equal(mobile.scrollable, true);
    assert.equal(mobile.bodyFits, true);
    assert.ok(mobile.gap <= 1.5, `${width}px sticky metrics ${JSON.stringify(mobile)}`);
    assert.doesNotMatch(mobile.viewport, /maximum-scale|user-scalable/i);
  }

  await navigate(cdp, '/pricing/');
  const priceResult = await cdp.evaluate(`(async () => {
    const search = document.querySelector('.rb__input');
    const counts = {};
    for (const q of ['물리', '수학', '화학', '미적분', 'maths']) {
      search.value = q;
      search.dispatchEvent(new Event('input', { bubbles: true }));
      counts[q] = Number(document.querySelector('.rb__n').textContent);
    }
    search.value = '';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    const tab = document.querySelector('[data-cur="a-level"]');
    tab.click();
    await new Promise(r => setTimeout(r, 30));
    const filteredUrl = location.search;
    location.reload();
    return { counts, filteredUrl };
  })()`);
  for (const [query, count] of Object.entries(priceResult.counts)) assert.ok(count > 0, `${query} returned no rates`);
  assert.match(priceResult.filteredUrl, /c=a-level/);
  await sleep(350);
  assert.equal(await cdp.evaluate(`document.querySelector('[data-cur="a-level"]').getAttribute('aria-pressed')`), 'true');
  await cdp.evaluate(`history.back()`);
  await sleep(120);
  assert.equal(await cdp.evaluate(`new URLSearchParams(location.search).has('c')`), false);
  assert.equal(await cdp.evaluate(`document.querySelector('[data-cur="all"]').getAttribute('aria-pressed')`), 'true');
  await navigate(cdp, '/pricing/?c=a-level');
  assert.equal(await cdp.evaluate(`document.querySelector('[data-cur="a-level"]').getAttribute('aria-pressed')`), 'true');
  const row = await cdp.evaluate(`(() => { const a=document.querySelector('.rb__row:not(.is-hidden) .rb__row-link'); return { href:a.getAttribute('href'), h:a.getBoundingClientRect().height }; })()`);
  assert.match(row.href, /get-matched\?subject=/);
  assert.ok(row.h >= 44);

  await navigate(cdp, '/get-matched/?subject=ib-diploma--physics-hl-sl');
  const carriedSubject = await cdp.evaluate(`({
    name: document.querySelector('[data-subject-value]').value,
    curriculum: document.querySelector('[data-curriculum-value]').value,
    price: document.querySelector('[data-subject-confirm-price]').textContent,
    local: document.querySelector('[data-local-time]').textContent,
    zone: document.querySelector('[data-timezone-note]').textContent,
    submittedSlot: document.querySelector('input[name="times"]').value,
  })`);
  assert.equal(carriedSubject.name, 'Physics HL / SL');
  assert.equal(carriedSubject.curriculum, 'ib-diploma');
  assert.match(carriedSubject.price, /100,000/);
  assert.match(carriedSubject.local, /09:00/);
  assert.match(carriedSubject.zone, /Europe\/London/);
  assert.equal(carriedSubject.submittedSlot, '17:00');

  await cdp.evaluate(`sessionStorage.removeItem('seonbae-match-draft')`);
  await navigate(cdp, '/get-matched/');
  const stepFlow = await cdp.evaluate(`(async () => {
    const student = document.querySelector('#m-student');
    student.value = 'QA student'; student.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#btn-next').click();
    const subject = document.querySelector('[data-slug="ib-diploma--physics-hl-sl"]'); subject.click();
    const goal = document.querySelector('#m-goal'); goal.value = 'Reach a 7'; goal.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#btn-next').click();
    await new Promise(r => setTimeout(r, 30));
    const before = location.hash;
    history.back();
    await new Promise(r => setTimeout(r, 50));
    return { before, after: location.hash, student: student.value, goal: goal.value };
  })()`);
  assert.equal(stepFlow.before, '#step-3');
  assert.equal(stepFlow.after, '#step-2');
  assert.equal(stepFlow.student, 'QA student');
  assert.equal(stepFlow.goal, 'Reach a 7');
  await cdp.evaluate(`history.forward()`);
  await sleep(80);
  await cdp.evaluate(`location.reload()`);
  await sleep(350);
  assert.equal(await cdp.evaluate(`location.hash`), '#step-3');
  assert.equal(await cdp.evaluate(`document.querySelector('#m-student').value`), 'QA student');
  const submitted = await cdp.evaluate(`(async () => {
    document.querySelector('#btn-next').click();
    const email = document.querySelector('#m-email');
    email.value = 'qa@example.com'; email.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#btn-next').click();
    await new Promise(r => setTimeout(r, 80));
    return {
      draft: sessionStorage.getItem('seonbae-match-draft'),
      done: !document.querySelector('#match-done').hidden,
    };
  })()`);
  assert.equal(submitted.draft, null);
  assert.equal(submitted.done, true);
  await navigate(cdp, '/get-matched/');
  assert.equal(await cdp.evaluate(`location.hash`), '#step-1');
  assert.equal(await cdp.evaluate(`document.querySelector('#m-student').value`), '');

  await navigate(cdp, '/subjects/ib-diploma/');
  const subjectLinks = await cdp.evaluate(`[...document.querySelectorAll('.subj-hero a.btn[href*="get-matched"], .subject-cta a.btn[href*="get-matched"]')].map(a => a.getAttribute('href'))`);
  assert.ok(subjectLinks.length >= 2);
  assert.ok(subjectLinks.every((href) => href.includes('curriculum=ib-diploma')));

  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
  await navigate(cdp, '/pricing/?qa-auth=out');
  const signedOutHeader = await cdp.evaluate(`(() => {
    const auth = document.querySelector('.header-auth-link');
    const cta = document.querySelector('.header-cta');
    const disc = auth.querySelector('.btn__disc');
    const authBox = auth.getBoundingClientRect();
    const ctaBox = cta.getBoundingClientRect();
    const authStyle = getComputedStyle(auth);
    const discStyle = getComputedStyle(disc);
    return {
      label: auth.querySelector('[data-auth-primary-label]').textContent.trim(),
      visible: authBox.width > 0 && authBox.height > 0,
      heightDelta: Math.abs(authBox.height - ctaBox.height),
      separated: authBox.right <= ctaBox.left,
      radius: parseFloat(authStyle.borderTopLeftRadius),
      discRound: discStyle.borderTopLeftRadius,
      noWrap: authStyle.whiteSpace,
    };
  })()`);
  assert.equal(signedOutHeader.label, '로그인');
  assert.equal(signedOutHeader.visible, true);
  assert.ok(signedOutHeader.heightDelta <= 1, JSON.stringify(signedOutHeader));
  assert.equal(signedOutHeader.separated, true, JSON.stringify(signedOutHeader));
  assert.ok(signedOutHeader.radius >= 20, JSON.stringify(signedOutHeader));
  assert.equal(signedOutHeader.discRound, '50%');
  assert.equal(signedOutHeader.noWrap, 'nowrap');

  await navigate(cdp, '/tutors/');
  await cdp.evaluate(`(async () => {
    for (let i = 0; i < 80 && document.querySelectorAll('.tcardx:not(.tcardx--skeleton)').length < ${mockTutors.length}; i++) {
      await new Promise(r => setTimeout(r, 50));
    }
  })()`);
  const desktopDirectory = await cdp.evaluate(`(() => {
    const cards = [...document.querySelectorAll('.tcardx:not(.tcardx--skeleton)')];
    const cells = [...document.querySelectorAll('.tutor-cell:not(.tutor-cell--skeleton)')];
    const heights = cards.map(card => card.getBoundingClientRect().height);
    const rowTops = [...new Set(cells.map(cell => Math.round(cell.getBoundingClientRect().top)))];
    const firstRowTop = Math.round(cells[0].getBoundingClientRect().top);
    return {
      count: Number(document.querySelector('#tutor-count').textContent),
      columns: cells.filter(cell => Math.round(cell.getBoundingClientRect().top) === firstRowTop).length,
      rowsForFirstSix: new Set(cells.slice(0, 6).map(cell => Math.round(cell.getBoundingClientRect().top))).size,
      minHeight: Math.min(...heights), maxHeight: Math.max(...heights),
      overflows: cards.map(card => card.scrollHeight - card.clientHeight),
      roles: cards.map(card => [card.getAttribute('role'), card.getAttribute('tabindex')]),
      cardSurfaces: cards.map(card => {
        const surface = card.querySelector('.tcardx__surface');
        const cardBox = card.getBoundingClientRect();
        const surfaceBox = surface.getBoundingClientRect();
        return {
          tag: surface.tagName,
          widthDelta: Math.abs(cardBox.width - surfaceBox.width),
          heightDelta: Math.abs(cardBox.height - surfaceBox.height),
        };
      }),
      controls: cards.map(card => card.querySelectorAll('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])').length),
      periods: [...document.querySelectorAll('.tcardx__scores b')].map(node => node.textContent.trim()).filter(value => value === '.'),
      cardTimetables: document.querySelectorAll('.tcardx .weekgrid').length,
      scoreRows: document.querySelectorAll('.tcardx__scores li').length,
      curriculumBadges: document.querySelectorAll('.tcardx__curricula li').length,
      hasSidebar: Boolean(document.querySelector('aside.rail')),
      firstTutor: document.querySelector('.tcardx__profile-label > span')?.textContent.trim(),
      bioClamp: getComputedStyle(document.querySelector('.tcardx__bio')).webkitLineClamp,
      igcsePresent: Boolean(document.querySelector('[data-filter="igcse"]')),
      igcseCount: document.querySelector('[data-filter="igcse"] .rail__n').textContent,
    };
  })()`);
  assert.equal(desktopDirectory.count, mockTutors.length);
  assert.equal(desktopDirectory.columns, 3, JSON.stringify(desktopDirectory));
  assert.ok(desktopDirectory.rowsForFirstSix <= 2, JSON.stringify(desktopDirectory));
  assert.ok(desktopDirectory.minHeight >= 260 && desktopDirectory.maxHeight <= 560, JSON.stringify(desktopDirectory));
  assert.ok(desktopDirectory.overflows.every(value => value <= 1), JSON.stringify(desktopDirectory));
  assert.ok(desktopDirectory.roles.every(([role, tabIndex]) => role === null && tabIndex === null));
  assert.ok(desktopDirectory.cardSurfaces.every(({ tag, widthDelta, heightDelta }) => tag === 'BUTTON' && widthDelta <= 1 && heightDelta <= 1), JSON.stringify(desktopDirectory));
  assert.ok(desktopDirectory.controls.every(count => count === 1), JSON.stringify(desktopDirectory));
  assert.deepEqual(desktopDirectory.periods, []);
  assert.equal(desktopDirectory.cardTimetables, 0);
  assert.equal(desktopDirectory.scoreRows, mockTutors.reduce((total, tutor) => total + tutor.subject_scores.length, 0));
  assert.ok(desktopDirectory.curriculumBadges >= mockTutors.length);
  assert.equal(desktopDirectory.hasSidebar, false);
  assert.equal(desktopDirectory.firstTutor, '김아이비');
  assert.equal(desktopDirectory.bioClamp, '2');
  assert.equal(desktopDirectory.igcsePresent, true);
  assert.equal(desktopDirectory.igcseCount, '0');
  await cdp.evaluate(`document.querySelector('.filter-strip').scrollIntoView({ block: 'start' })`);
  await sleep(80);
  await capture('tutors-desktop');

  const searchResult = async (query) => cdp.evaluate(`(async () => {
    const input = document.querySelector('#tutor-search');
    input.value = ${JSON.stringify(query)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(requestAnimationFrame);
    return {
      count: Number(document.querySelector('#tutor-count').textContent),
      names: [...document.querySelectorAll('.tcardx__profile-label > span')].map(node => node.textContent.trim()),
      highlighted: [...document.querySelectorAll('.tcardx__scores .is-match span')].map(node => node.textContent.trim()),
    };
  })()`);
  const chemistry = await searchResult('chemistry');
  assert.equal(chemistry.count, 3, JSON.stringify(chemistry));
  assert.ok(chemistry.highlighted.every(subject => /chemistry/i.test(subject)), JSON.stringify(chemistry));
  const koreanChemistry = await searchResult('화학');
  assert.equal(koreanChemistry.count, 3, JSON.stringify(koreanChemistry));
  const ibCurriculum = await searchResult('IB');
  assert.equal(ibCurriculum.count, 2, JSON.stringify(ibCurriculum));
  assert.ok(ibCurriculum.highlighted.length > 0 && ibCurriculum.highlighted.every(subject => /^IB\b/i.test(subject)), JSON.stringify(ibCurriculum));
  const calculus = await searchResult('calculus');
  assert.deepEqual(calculus.names, ['최에이피']);
  assert.deepEqual(calculus.highlighted, ['AP Calculus BC']);
  const tutorName = await searchResult('Ivy Kim');
  assert.deepEqual(tutorName.names, ['김아이비']);
  assert.deepEqual(tutorName.highlighted, []);

  await searchResult('');
  const recentlyAdded = await cdp.evaluate(`(() => {
    const select = document.querySelector('#tutor-sort');
    select.value = 'recent';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return [...document.querySelectorAll('.tcardx__profile-label > span')].map(node => node.textContent.trim());
  })()`);
  assert.equal(recentlyAdded[0], '윤생물');

  await searchResult('chemistry');
  await cdp.evaluate(`document.querySelector('[data-filter="ap"]').click()`);
  const composed = await cdp.evaluate(`({
    count: Number(document.querySelector('#tutor-count').textContent),
    chips: [...document.querySelectorAll('[data-active-filters] button')].map(node => node.textContent.replace('×', '').trim()),
    names: [...document.querySelectorAll('.tcardx__profile-label > span')].map(node => node.textContent.trim()),
  })`);
  assert.equal(composed.count, 1, JSON.stringify(composed));
  assert.equal(composed.chips.length, 2, JSON.stringify(composed));
  assert.deepEqual(composed.names, ['최에이피']);
  await cdp.evaluate(`document.querySelector('[data-remove-filter="search"]').click()`);
  assert.equal(await cdp.evaluate(`Number(document.querySelector('#tutor-count').textContent)`), 2);

  await navigate(cdp, '/tutors/');
  await sleep(250);
  await cdp.evaluate(`document.querySelector('[data-filter="ib"]').click()`);
  assert.match(await cdp.evaluate(`location.search`), /c=ib/);
  await cdp.evaluate(`history.back()`);
  await sleep(100);
  assert.equal(await cdp.evaluate(`document.querySelector('[data-filter="all"]').getAttribute('aria-pressed')`), 'true');
  await navigate(cdp, '/tutors/?c=ib');
  await sleep(250);
  const tutors = await cdp.evaluate(`(async () => {
    const profileButton = document.querySelector('.tcardx__surface');
    profileButton.click();
    await new Promise(r => setTimeout(r, 50));
    const ranges=[...document.querySelectorAll('#profile-dialog .availability-list__ranges span')];
    const rateItems=[...document.querySelectorAll('#profile-dialog .pf__rate-list li')];
    const profileAside = document.querySelector('#profile-dialog .pf__aside');
    const profileMatchButton = profileAside?.querySelector('.tcardx__book');
    const matchButtonBox = profileMatchButton?.getBoundingClientRect();
    const result = {
      active: document.querySelector('[data-filter="ib"]').getAttribute('aria-pressed'),
      count: Number(document.querySelector('#tutor-count').textContent),
      totalCards: document.querySelectorAll('.tutor-cell').length,
      fullScreen: document.querySelector('#profile-dialog').getBoundingClientRect().width === innerWidth,
      rangeCount: ranges.length,
      ranges: ranges.map(node => node.textContent.trim()),
      rateCount: rateItems.length,
      rates: rateItems.map(node => node.textContent.replace(/\\s+/g, ' ').trim()),
      cardMatchButtons: document.querySelectorAll('.tcardx .tcardx__book[data-book]').length,
      consultationLinks: document.querySelectorAll('.tcardx .tcardx__book[href*="get-matched"]').length,
      matchButtonOnTop: matchButtonBox
        ? document.elementFromPoint(matchButtonBox.left + matchButtonBox.width / 2, matchButtonBox.top + matchButtonBox.height / 2)?.closest('.tcardx__book') === profileMatchButton
        : false,
    };
    document.querySelector('[data-close-profile]').click();
    await new Promise(requestAnimationFrame);
    result.focusRestored = document.activeElement === profileButton;
    return result;
  })()`);
  assert.equal(tutors.active, 'true');
  assert.equal(tutors.count, 2);
  assert.equal(tutors.totalCards, 2);
  assert.equal(tutors.fullScreen, true);
  assert.equal(tutors.rangeCount, 3);
  assert.ok(tutors.ranges.includes('09:00–10:30'), JSON.stringify(tutors));
  assert.equal(tutors.rateCount, 3);
  assert.ok(tutors.rates.every(value => /₩100,000/.test(value)), JSON.stringify(tutors));
  assert.equal(tutors.focusRestored, true);
  assert.equal(tutors.cardMatchButtons, 0);
  assert.equal(tutors.consultationLinks, 0);
  assert.equal(tutors.matchButtonOnTop, true, JSON.stringify(tutors));
  await cdp.evaluate(`document.querySelector('.tcardx__surface').click()`);
  await sleep(80);
  await capture('tutor-profile');
  await cdp.evaluate(`document.querySelector('[data-close-profile]').click()`);

  const matchRequest = await cdp.evaluate(`(async () => {
    document.querySelector('[data-registry-id="P-QA1"] .tcardx__surface').click();
    await new Promise(r => setTimeout(r, 30));
    document.querySelector('#profile-dialog .tcardx__book[data-book="P-QA1"]').click();
    await new Promise(r => setTimeout(r, 40));
    const dialog = document.querySelector('#book-dialog');
    const form = dialog.querySelector('.book__form');
    form.querySelector('[name="subject"]').value = 'IB Chemistry HL';
    form.querySelector('[name="preferredDay"]').value = 'mon';
    form.querySelector('[name="preferredTime"]').value = '09:00';
    form.querySelector('[name="note"]').value = 'QA match request';
    form.requestSubmit();
    const status = dialog.querySelector('[data-book-status]');
    for (let i = 0; i < 30 && (!window.__bookingRequests.length || !status.textContent.trim()); i++) await new Promise(r => setTimeout(r, 20));
    return {
      open: dialog.open,
      hidden: form.hidden,
      requests: window.__bookingRequests,
      success: status.textContent,
    };
  })()`);
  assert.equal(matchRequest.open, true);
  assert.equal(matchRequest.hidden, false);
  assert.equal(matchRequest.requests.length, 1);
  assert.deepEqual(matchRequest.requests[0], {
    tutorRegistryId: 'P-QA1',
    subject: 'IB Chemistry HL',
    preferredDay: 'mon',
    preferredTime: '09:00',
    note: 'QA match request',
  });
  assert.match(matchRequest.success, /Match requested|매칭 요청/);

  await cdp.send('Emulation.clearDeviceMetricsOverride');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 3, mobile: true });
  await navigate(cdp, '/tutors/');
  await sleep(250);
  const mobileDirectory = await cdp.evaluate(`(() => {
    const cards = [...document.querySelectorAll('.tcardx:not(.tcardx--skeleton)')];
    const heights = cards.map(card => card.getBoundingClientRect().height);
    const list = document.querySelector('.rail__list');
    const cells = [...document.querySelectorAll('.tutor-cell')];
    const firstRowTop = Math.round(cells[0].getBoundingClientRect().top);
    return {
      columns: cells.filter(cell => Math.round(cell.getBoundingClientRect().top) === firstRowTop).length,
      minHeight: Math.min(...heights), maxHeight: Math.max(...heights),
      filterWrap: getComputedStyle(list).flexWrap,
      filterScrollable: list.scrollWidth > list.clientWidth,
      chipMinHeight: Math.min(...[...document.querySelectorAll('.rail__btn')].map(button => button.getBoundingClientRect().height)),
      bodyFits: document.documentElement.scrollWidth <= innerWidth,
      innerWidth,
      gridWidth: document.querySelector('#tutor-grid').getBoundingClientRect().width,
      gridTemplate: getComputedStyle(document.querySelector('#tutor-grid')).gridTemplateColumns,
      positions: cells.slice(0, 3).map(cell => ({ left: cell.getBoundingClientRect().left, top: cell.getBoundingClientRect().top })),
    };
  })()`);
  assert.equal(mobileDirectory.columns, 1, JSON.stringify(mobileDirectory));
  assert.equal(mobileDirectory.filterWrap, 'nowrap');
  assert.equal(mobileDirectory.filterScrollable, true);
  assert.ok(mobileDirectory.chipMinHeight >= 44);
  assert.equal(mobileDirectory.bodyFits, true);
  await cdp.evaluate(`document.querySelector('.filter-strip').scrollIntoView({ block: 'start' })`);
  await sleep(80);
  await capture('tutors-mobile');

  await cdp.send('Emulation.setEmulatedMedia', {
    media: '',
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  assert.ok(await cdp.evaluate(`parseFloat(getComputedStyle(document.querySelector('.tcardx')).transitionDuration) < 0.001`));
  await cdp.send('Emulation.setEmulatedMedia', { media: '', features: [] });

  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 812, height: 375, deviceScaleFactor: 2, mobile: true });
  await navigate(cdp, '/tutors/');
  await sleep(250);
  const landscapeDirectory = await cdp.evaluate(`({
    bodyFits: document.documentElement.scrollWidth <= innerWidth,
    searchVisible: document.querySelector('#tutor-search').getBoundingClientRect().width > 0,
    filterVisible: document.querySelector('.filter-strip').getBoundingClientRect().width > 0,
  })`);
  assert.equal(landscapeDirectory.bodyFits, true, JSON.stringify(landscapeDirectory));
  assert.equal(landscapeDirectory.searchVisible, true);
  assert.equal(landscapeDirectory.filterVisible, true);

  await cdp.evaluate(`sessionStorage.removeItem('seonbae-match-draft')`);
  await navigate(cdp, '/get-matched/?tutor=P-QA1');
  await sleep(350);
  const tutorCarry = await cdp.evaluate(`({
    context: document.querySelector('[data-match-context]').hidden,
    name: document.querySelector('[data-context-name]').textContent,
    value: document.querySelector('[data-tutor-value]').value,
    options: document.querySelectorAll('.tutor-option:not([data-value="Manager consultation"])').length,
  })`);
  assert.equal(tutorCarry.context, false);
  assert.equal(tutorCarry.name, '김아이비');
  assert.equal(tutorCarry.value, '김아이비');
  assert.equal(tutorCarry.options, mockTutors.length);

  console.log('Marketing browser QA passed: mobile layout, search/deep links, roster density, profile rates and availability, and match requests.');
} finally {
  try { await cdp?.send('Browser.close'); } catch {}
  if (chrome && chrome.exitCode === null) {
    await Promise.race([
      new Promise((resolvePromise) => chrome.once('exit', resolvePromise)),
      sleep(1200),
    ]);
  }
  if (chrome && chrome.exitCode === null) chrome.kill('SIGKILL');
  const safeProfile = resolve(profile);
  if (safeProfile.startsWith(resolve(tmpdir()))) {
    for (let attempt = 0; attempt < 8; attempt++) {
      try { await rm(safeProfile, { recursive: true, force: true }); break; }
      catch (error) {
        if (attempt === 7) throw error;
        await sleep(250);
      }
    }
  }
}
