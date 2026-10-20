import test from 'node:test';
import assert from 'node:assert/strict';
import { createDriveStorage, DRIVE_SCOPE } from '../src/drive-storage.js';
import { emptyState } from '../src/domain.js';

const clientId = '123456-test-client.apps.googleusercontent.com';
const json = (value, init = {}) => new Response(JSON.stringify(value), { status: 200, ...init });
function harness(fetchImpl = async () => { throw Error('unexpected network'); }, options = {}) {
  let clock = 100000, config, grant = true;
  const oauth = { initTokenClient(value) { config = value; return { requestAccessToken(request) {
    assert.equal(request.prompt, 'select_account');
    queueMicrotask(() => config.callback({ access_token: 'test-session-token', expires_in: 3600 }));
  } }; }, hasGrantedAllScopes: (_, scope) => grant && scope === DRIVE_SCOPE };
  const drive = createDriveStorage({ clientId, fetchImpl, identity: () => oauth,
    loadIdentity: async () => {}, now: () => clock, ...options });
  return { drive, oauth, getConfig: () => config, tick: (ms) => { clock += ms; }, deny: () => { grant = false; } };
}
async function connected(fetchImpl) {
  const h = harness(fetchImpl); await h.drive.prepare(); await h.drive.connect(); return h;
}
function sampleState() {
  return { ...emptyState(), students: [{ id: 'drive-student', name: 'طالب تجريبي', grade: 2, section: 'أ' }] };
}

test('missing configuration never loads identity or sends data', async () => {
  const h = harness(undefined, { clientId: '', loadIdentity: () => { throw Error('must not load'); } });
  assert.equal(h.drive.status().configured, false);
  await assert.rejects(h.drive.prepare(), /لم يُفعّل/);
  await assert.rejects(h.drive.connect(), /غير جاهز/);
});
test('explicit sign in requests only appdata; tokens are absent from public status and expire', async () => {
  const h = await connected();
  assert.equal(h.getConfig().scope, DRIVE_SCOPE);
  assert.equal(h.getConfig().include_granted_scopes, false);
  assert.equal(h.drive.status().connected, true);
  assert(!JSON.stringify(h.drive.status()).includes('test-session-token'));
  h.tick(3600 * 1000);
  await assert.rejects(h.drive.listBackups(), /انتهت جلسة/);
  assert.equal(h.drive.status().connected, false);
});
test('denied consent and popup closure do not create a connected session', async () => {
  const h = harness(); await h.drive.prepare(); h.deny();
  await assert.rejects(h.drive.connect(), /لم توافق/);
  h.oauth.initTokenClient = (config) => ({ requestAccessToken: () => config.error_callback() });
  await assert.rejects(h.drive.connect(), /أُغلقت نافذة/);
  assert.equal(h.drive.status().connected, false);
});
test('backup uses a new resumable upload and includes only app data, not unrelated state or session tokens', async () => {
  const calls = [];
  const h = await connected(async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.credentials, 'omit');
    assert.equal(options.headers.Authorization, 'Bearer test-session-token');
    return options.method === 'POST'
      ? new Response(null, { status: 200, headers: { Location: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=one' } })
      : json({ id: 'snapshot-one' });
  });
  const state = { ...sampleState(), unrelatedSecret: 'must-not-upload' };
  const original = structuredClone(state);
  const file = await h.drive.saveBackup(state);
  assert.equal(file.id, 'snapshot-one');
  assert.deepEqual(JSON.parse(calls[0].options.body).parents, ['appDataFolder']);
  const snapshot = JSON.parse(calls[1].options.body);
  assert.equal(snapshot.students[0].name, 'طالب تجريبي');
  assert(!calls[1].options.body.includes('must-not-upload'));
  assert(!calls[1].options.body.includes('test-session-token'));
  assert.deepEqual(state, original);
  await h.drive.saveBackup(state);
  assert.equal(calls.filter(c => c.options.method === 'POST').length, 2);
  assert(!calls.some(c => c.options.method === 'PATCH' || c.options.method === 'DELETE'));
});
test('unexpected upload hosts are rejected before sending data or a bearer token', async () => {
  let calls = 0;
  const h = await connected(async () => {
    calls++; return new Response(null, { status: 200, headers: { Location: 'https://example.invalid/upload' } });
  });
  await assert.rejects(h.drive.saveBackup(sampleState()), /عنوان جلسة/);
  assert.equal(calls, 1);
});
test('listing stays inside appdata, filters app namespace and preserves pagination', async () => {
  const h = await connected(async (url) => {
    const query = new URL(url).searchParams;
    assert.equal(query.get('spaces'), 'appDataFolder');
    assert.equal(query.get('pageToken'), 'opaque next page');
    assert(query.get('q').includes("value='al-musaed'"));
    return json({ files: [{ id: 'a', appProperties: { application: 'al-musaed' } }, { id: 'b' }], nextPageToken: 'next2' });
  });
  const page = await h.drive.listBackups('opaque next page');
  assert.deepEqual(page.files.map(f => f.id), ['a']); assert.equal(page.nextPageToken, 'next2');
});
test('restore validates metadata and backup content before the application can merge it', async () => {
  let invalid = false;
  const state = sampleState();
  const h = await connected(async (url) => url.includes('alt=media')
    ? json(invalid ? { app: 'different-app' } : { ...state, app: 'al-musaed' })
    : json({ size: '1500', appProperties: { application: 'al-musaed' } }));
  assert.equal((await h.drive.readBackup('valid-id')).students.length, 1);
  invalid = true;
  await assert.rejects(h.drive.readBackup('valid-id'), /نسخة احتياطية صالحة/);
  await assert.rejects(h.drive.readBackup('../other-file'), /معرّف/);
  assert.equal(state.students.length, 1);
});
test('401 invalidates the session; disconnect cancels in-flight reads', async () => {
  const expired = await connected(async () => new Response('', { status: 401 }));
  await assert.rejects(expired.drive.listBackups(), /انتهت جلسة/);
  assert.equal(expired.drive.status().connected, false);
  let finish;
  const h = await connected(() => new Promise(resolve => { finish = resolve; }));
  const pending = h.drive.listBackups();
  h.drive.disconnect(); finish(json({ files: [] }));
  await assert.rejects(pending, /تغيّرت جلسة/);
});
