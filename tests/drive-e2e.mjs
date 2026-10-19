import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
let pw;
try { pw = await import('@playwright/test'); }
catch { pw = await import(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright/index.mjs'); }
const server = spawn(process.execPath, ['scripts/serve.mjs'], { env: { ...process.env, PORT: '4193' }, stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(Error('server timeout')), 15000);
  server.stdout.on('data', d => { if (String(d).includes('http://localhost')) { clearTimeout(timer); resolve(); } });
});
const errors = [], cloudFiles = [];
let browser, debugPage, expired = false;
const metadata = file => ({ id: file.id, name: file.name, size: String(JSON.stringify(file.data).length), createdTime: file.createdTime, appProperties: file.appProperties });
async function session(configured = true) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route('**/src/drive-config.js', route => route.fulfill({ contentType: 'text/javascript', body: `export const GOOGLE_DRIVE_CLIENT_ID = '${configured ? '123456-test-client.apps.googleusercontent.com' : ''}';` }));
  await context.route('https://accounts.google.com/gsi/client', route => route.fulfill({ contentType: 'text/javascript', body: `window.google = {accounts: {oauth2: {
    initTokenClient(config) { return { requestAccessToken() { setTimeout(() => config.callback({access_token: 'simulated-test-token', expires_in: 3600}), 0); } }; },
    hasGrantedAllScopes(response, scope) { return scope === 'https://www.googleapis.com/auth/drive.appdata'; }
  }}};` }));
  await context.route('https://www.googleapis.com/**', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    const reply = data => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    if (expired) return route.fulfill({ status: 401, body: '{}' });
    assert.equal(request.headers().authorization, 'Bearer simulated-test-token');
    if (method === 'POST') {
      assert.equal(url.searchParams.get('uploadType'), 'resumable');
      const data = request.postDataJSON();
      assert.deepEqual(data.parents, ['appDataFolder']);
      const id = 'snapshot-' + (cloudFiles.length + 1);
      cloudFiles.push({ ...data, id, createdTime: '2026-10-20T00:00:00Z', data: null });
      return route.fulfill({ status: 200, headers: { Location: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=' + id, 'Access-Control-Expose-Headers': 'Location' }, body: '' });
    }
    if (method === 'PUT') {
      const file = cloudFiles.find(f => f.id === url.searchParams.get('upload_id'));
      file.data = request.postDataJSON();
      return reply(metadata(file));
    }
    if (url.pathname === '/drive/v3/files') return reply({ files: cloudFiles.filter(f => f.data).map(metadata) });
    const file = cloudFiles.find(f => f.id === url.pathname.split('/').at(-1));
    assert(file);
    return reply(url.searchParams.get('alt') === 'media' ? file.data : metadata(file));
  });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  debugPage = page;
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://localhost:4193');
  await page.getByRole('heading', { name: 'مساحة معلمك', exact: true }).waitFor();
  return { context, page };
}
const settings = page => page.locator('[data-action="nav"][data-route="settings"]').first().click();
async function connect(page) {
  const button = page.locator('[data-action="drive-connect"]');
  await button.click();
  await page.getByRole('button', { name: 'ربط Google Drive', exact: true }).waitFor();
  await button.click();
  await page.getByRole('button', { name: 'حفظ نسخة على Google Drive', exact: true }).waitFor();
}
try {
  browser = await pw.chromium.launch({ headless: true, executablePath: process.env.CHROME_EXECUTABLE || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const unconfigured = await session(false);
  const remote = [];
  unconfigured.page.on('request', r => { if (r.url().includes('google')) remote.push(r.url()); });
  await settings(unconfigured.page);
  assert((await unconfigured.page.locator('#drive-panel').innerText()).includes('لم يُفعّل'));
  assert.deepEqual(remote, []);
  await unconfigured.context.close();

  const first = await session();
  await first.page.evaluate(async () => {
    const storage = await import('/src/storage.js'), state = await storage.readState();
    state.students = [1,2].map(i => ({ id: 'student-' + i, name: 'طالب تجريبي ' + i, grade: 2, section: 'أ' }));
    state.settings.school = 'مدرسة تجربة درايف';
    await storage.writeState(state);
  });
  await first.page.reload(); await settings(first.page); await connect(first.page);
  assert.equal(cloudFiles.length, 0, 'connecting must never upload student data');
  await first.page.getByRole('button', { name: 'حفظ نسخة على Google Drive', exact: true }).click();
  await first.page.getByRole('button', { name: 'معاينة الاستعادة', exact: true }).waitFor();
  assert.equal(cloudFiles[0].data.students.length, 2);
  assert(!JSON.stringify(cloudFiles[0].data).includes('simulated-test-token'));
  assert(!(await first.page.evaluate(async () => JSON.stringify(await (await import('/src/storage.js')).readState()))).includes('simulated-test-token'));
  await first.page.getByRole('button', { name: 'حفظ نسخة على Google Drive', exact: true }).click();
  await first.page.waitForFunction(() => document.querySelectorAll('[data-action="drive-read"]').length === 2);
  assert.equal(cloudFiles.length, 2, 'second save preserves first snapshot');
  await first.context.close();

  const second = await session();
  await settings(second.page); await connect(second.page);
  await second.page.locator('[data-action="drive-read"]').first().click();
  await second.page.getByRole('button', { name: 'دمج النسخة مع هذا الجهاز', exact: true }).waitFor();
  assert.equal(await second.page.evaluate(async () => (await (await import('/src/storage.js')).readState()).students.length), 0);
  await second.page.locator('#drive-restore-settings').check();
  await second.page.getByRole('button', { name: 'دمج النسخة مع هذا الجهاز', exact: true }).click();
  await second.page.getByRole('dialog').waitFor({ state: 'detached' });
  const restored = await second.page.evaluate(async () => (await import('/src/storage.js')).readState());
  assert.equal(restored.students.length, 2);
  assert.equal(restored.settings.school, 'مدرسة تجربة درايف');
  await second.page.locator('[data-action="drive-read"]').first().click();
  await second.page.getByRole('button', { name: 'دمج النسخة مع هذا الجهاز', exact: true }).click();
  await second.page.getByRole('dialog').waitFor({ state: 'detached' });
  assert.equal(await second.page.evaluate(async () => (await (await import('/src/storage.js')).readState()).students.length), 2);
  expired = true;
  await second.page.getByRole('button', { name: 'عرض النسخ المحفوظة', exact: true }).click();
  await second.page.getByRole('button', { name: 'ربط Google Drive', exact: true }).waitFor();
  assert((await second.page.locator('#drive-panel').innerText()).includes('انتهت جلسة'));
  await second.page.reload(); await settings(second.page);
  assert.equal(await second.page.locator('[data-action="drive-save"]').count(), 0);
  assert.equal(await second.page.evaluate(async () => (await (await import('/src/storage.js')).readState()).students.length), 2);
  assert.deepEqual(errors, []);
  await second.context.close();
  console.log('PASS: simulated Google flow, opt-in upload, separate snapshots, two-device restore preview/settings, no duplicates, session expiry/reload, local persistence, no token storage. Real OAuth remains unconfigured.');
} catch (error) {
  console.log('Drive panel on failure:', await debugPage?.locator('#drive-panel').innerText().catch(() => 'not available'));
  throw error;
} finally { await browser?.close(); server.kill(); }
