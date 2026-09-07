import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const baseUrl = process.env.SEONBAE_QA_URL || 'http://127.0.0.1:4174';
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const debugPort = 9337;
const profile = await mkdtemp(join(tmpdir(), 'seonbae-chrome-qa-'));
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

const mockTutors = [
  {
    registry_id: 'P-QA1', name: '김아이비', name_en: 'Ivy Kim', exam: 'IB', score: '44/45',
    category: 'IB', university: '고려대학교', university_en: 'Korea University',
    availability: { mon: ['09:00-10:30', '17:00-18:00'], wed: ['12:00-13:00'] }, active: true,
  },
  {
    registry_id: 'P-QA2', name: '박에이레벨', name_en: 'Alex Park', exam: 'A Level', score: 'A*A*A*',
    category: 'A Level', university: '서울대학교', university_en: 'Seoul National University',
    availability: {}, active: true,
  },
];

try {
  chrome = spawn(chromePath, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
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
      window.fetch = (input, init) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url === '/api/tutors') return Promise.resolve(new Response(JSON.stringify(tutors), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        if (url === '/api/auth/session') return Promise.resolve(new Response(JSON.stringify({ authenticated: false }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
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

  await navigate(cdp, '/tutors/');
  await sleep(350);
  await cdp.evaluate(`document.querySelector('[data-filter="ib"]').click()`);
  assert.match(await cdp.evaluate(`location.search`), /c=ib/);
  await cdp.evaluate(`history.back()`);
  await sleep(100);
  assert.equal(await cdp.evaluate(`document.querySelector('[data-filter="all"]').getAttribute('aria-pressed')`), 'true');
  await navigate(cdp, '/tutors/?c=ib');
  await sleep(350);
  const tutors = await cdp.evaluate(`(async () => {
    const blocks=[...document.querySelectorAll('.weekgrid__slot')];
    const first=blocks[0]; first?.focus();
    await new Promise(r => setTimeout(r, 160));
    return {
      active: document.querySelector('[data-filter="ib"]').getAttribute('aria-pressed'),
      count: Number(document.querySelector('#tutor-count').textContent),
      totalCards: document.querySelectorAll('.tutor-cell').length,
      blockCount: blocks.length,
      colors: new Set(blocks.map(b => getComputedStyle(b).backgroundColor)).size,
      tooltip: first ? getComputedStyle(first, '::after').content : '',
      tooltipVisible: first ? getComputedStyle(first, '::after').opacity : '0',
      focused: first ? first.matches(':focus') : false,
      tabIndex: first?.tabIndex,
      tutorHref: document.querySelector('.tcardx__book[href]')?.getAttribute('href') || '',
    };
  })()`);
  assert.equal(tutors.active, 'true');
  assert.equal(tutors.count, 1);
  assert.equal(tutors.totalCards, 2);
  assert.ok(tutors.blockCount >= 3);
  assert.ok(tutors.colors > 1);
  assert.match(tutors.tooltip, /09:00-10:30/);
  assert.equal(tutors.tooltipVisible, '1', JSON.stringify(tutors));
  assert.match(tutors.tutorHref, /get-matched\?tutor=P-QA1/);

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

  console.log('Marketing browser QA passed: mobile layout, search/deep links, form history/draft, timezone, roster, and timetable tooltips.');
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
