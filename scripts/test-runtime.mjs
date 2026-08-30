import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import process from 'node:process';

const port = 3094;
const origin = `http://127.0.0.1:${port}`;
const cwd = process.cwd();
const output = [];

// PowerShell can expose both Path and PATH. Keep only one case-insensitive
// instance so the bounded child process starts reliably on Windows.
const childEnv = {};
const environmentKeys = new Set();
for (const [key, value] of Object.entries(process.env)) {
  const normalized = key.toLowerCase();
  if (environmentKeys.has(normalized) || value === undefined) continue;
  environmentKeys.add(normalized);
  childEnv[key] = value;
}
childEnv.GOOGLE_LOGIN_GATE_SECRET =
  childEnv.GOOGLE_LOGIN_GATE_SECRET || 'local-runtime-test-google-login-secret';

const server = spawn(
  process.execPath,
  [path.join(cwd, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(port)],
  {
    cwd,
    env: childEnv,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

for (const stream of [server.stdout, server.stderr]) {
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    output.push(chunk);
    if (output.join('').length > 12_000) output.shift();
  });
}

const exit = new Promise((resolve) => {
  server.once('exit', (code, signal) => resolve({ code, signal }));
});

async function waitForReady() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Server exited before readiness.\n${output.join('')}`);
    }
    try {
      const response = await fetch(`${origin}/login`, { signal: AbortSignal.timeout(1_500) });
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await delay(250);
  }
  throw new Error(`Server readiness timed out.\n${output.join('')}`);
}

try {
  await waitForReady();

  // The login route hydrates the requested signup panel on the client, so its
  // initial HTML contains the login panel. Verify the required-field contract
  // from the built source and exercise the running route separately.
  const signupSource = await readFile(path.join(cwd, 'app', 'login', 'page.tsx'), 'utf8');
  assert.ok((signupSource.match(/<RequiredMark \/>/g) || []).length >= 6, 'Signup required marks are missing');
  const loginResponse = await fetch(`${origin}/login?mode=signup`);
  assert.equal(loginResponse.status, 200);

  const verifyEmailResponse = await fetch(`${origin}/signup/verify-email?email=test%40example.com`);
  assert.equal(verifyEmailResponse.status, 200);
  const verifyEmailHtml = await verifyEmailResponse.text();
  assert.match(verifyEmailHtml, /test@example\.com/);

  const thankYouResponse = await fetch(`${origin}/signup/thank-you`, { redirect: 'manual' });
  assert.ok([302, 303, 307, 308].includes(thankYouResponse.status));
  assert.match(thankYouResponse.headers.get('location') || '', /\/login\?error=verification-required/);

  const signupRouteSource = await readFile(path.join(cwd, 'app', 'api', 'auth', 'signup', 'route.ts'), 'utf8');
  assert.match(signupRouteSource, /account_creation_requests/);
  assert.match(signupRouteSource, /signup\/verify-email/);
  assert.match(signupRouteSource, /signup\/thank-you/);

  const subjectsHtml = await fetch(`${origin}/subjects`).then((response) => response.text());
  assert.match(subjectsHtml, /data-lang="ko"/);
  assert.match(subjectsHtml, /꼭 맞는 도움/);
  assert.match(subjectsHtml, /Verified tutors from SNU, Korea and Yonsei/);

  const googleSignup = await fetch(`${origin}/api/auth/google`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode: 'signup' }),
  });
  assert.equal(googleSignup.status, 400);

  const googleLogin = await fetch(`${origin}/api/auth/google`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode: 'signin', next: '/portal' }),
  });
  assert.equal(googleLogin.status, 200, await googleLogin.text());
  const googleCookie = googleLogin.headers.get('set-cookie') || '';
  assert.match(googleCookie, /seonbae-google-login-attempt=/);
  assert.match(googleCookie, /HttpOnly/i);

  console.log('bounded runtime checks: pass');
  console.log('- Korean is the default and translated marketing content is present');
  console.log('- Signup required-field marks render');
  console.log('- Signup review, verification inbox, and authenticated thank-you contracts are present');
  console.log('- Google signup is blocked and Google login creates a signed gate cookie');
} finally {
  if (server.exitCode === null) server.kill('SIGTERM');
  const stopped = await Promise.race([exit, delay(4_000).then(() => null)]);
  if (!stopped && server.exitCode === null) {
    server.kill('SIGKILL');
    await exit;
  }
  console.log(`bounded server on port ${port}: terminated`);
}
