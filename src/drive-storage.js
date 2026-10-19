import { validateBackup } from './domain.js';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const DRIVE_LIMIT = 20_000_000;
const DRIVE_FIELDS = 'id,name,createdTime,size,appProperties';
let driveIdentityPromise;

function loadDriveIdentity() {
  if (globalThis.google?.accounts?.oauth2) return Promise.resolve();
  if (driveIdentityPromise) return driveIdentityPromise;
  driveIdentityPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    const timer = setTimeout(() => {
      script.remove();
      reject(Error('تعذر تحميل تسجيل دخول Google. تحقق من الاتصال وحاول مجددًا.'));
    }, 15000);
    script.onload = () => { clearTimeout(timer); resolve(); };
    script.onerror = () => {
      clearTimeout(timer);
      script.remove();
      reject(Error('تعذر تحميل تسجيل دخول Google. تحقق من الاتصال وحاول مجددًا.'));
    };
    document.head.append(script);
  }).catch((error) => { driveIdentityPromise = null; throw error; });
  return driveIdentityPromise;
}

// Access tokens live only inside this closure; they never enter app state/backups.
export function createDriveStorage({
  clientId,
  fetchImpl = (...args) => fetch(...args),
  identity = () => globalThis.google?.accounts?.oauth2,
  loadIdentity = loadDriveIdentity,
  now = () => Date.now(),
  onChange = () => {},
} = {}) {
  let accessToken = '', expiresAt = 0, ready = false, connecting = false, generation = 0;
  const configured = /^\d+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId || '');
  const status = () => ({ configured, ready, connecting, connected: Boolean(accessToken && now() < expiresAt) });
  const notify = () => onChange(status());
  const disconnect = () => {
    generation++;
    accessToken = '';
    expiresAt = 0;
    connecting = false;
    notify();
  };
  async function prepare() {
    if (!configured) throw Error('لم يُفعّل ربط Google Drive لهذا الإصدار بعد.');
    await loadIdentity();
    if (!identity()?.initTokenClient) throw Error('تعذر تحميل تسجيل دخول Google.');
    ready = true;
    notify();
  }
  // Called directly from a click, after prepare(), to preserve popup user activation.
  function connect() {
    if (!configured || !ready) return Promise.reject(Error('تسجيل دخول Google غير جاهز بعد.'));
    if (connecting) return Promise.reject(Error('أكمل نافذة تسجيل الدخول الحالية.'));
    accessToken = ''; expiresAt = 0;
    const requestGeneration = ++generation;
    connecting = true;
    notify();
    return new Promise((resolve, reject) => {
      const finishError = (message) => {
        if (generation === requestGeneration) { connecting = false; notify(); }
        reject(Error(message));
      };
      try {
        const oauth = identity();
        const client = oauth.initTokenClient({
          client_id: clientId,
          scope: DRIVE_SCOPE,
          include_granted_scopes: false,
          callback: (response) => {
            if (generation !== requestGeneration) return finishError('أُلغيت جلسة الربط.');
            if (response.error || !response.access_token || !oauth.hasGrantedAllScopes(response, DRIVE_SCOPE))
              return finishError('لم توافق Google على حفظ بيانات المساعد. يمكنك متابعة العمل محليًا.');
            const seconds = Number(response.expires_in);
            if (!Number.isFinite(seconds) || seconds <= 30) return finishError('جلسة Google غير صالحة. أعد الربط.');
            accessToken = response.access_token;
            expiresAt = now() + (seconds - 30) * 1000;
            connecting = false;
            notify();
            resolve(status());
          },
          error_callback: () => finishError('أُغلقت نافذة Google أو تعذر فتحها. اضغط ربط Google Drive للمحاولة مجددًا.'),
        });
        client.requestAccessToken({ prompt: 'select_account' });
      } catch { finishError('تعذر بدء تسجيل دخول Google.'); }
    });
  }
  async function request(url, options = {}) {
    if (!status().connected) { disconnect(); throw Error('انتهت جلسة Google. اضغط ربط Google Drive مجددًا.'); }
    const requestGeneration = generation;
    let response;
    try {
      response = await fetchImpl(url, {
        ...options,
        headers: { ...options.headers, Authorization: 'Bearer ' + accessToken },
        credentials: 'omit', cache: 'no-store', redirect: 'error',
        signal: AbortSignal.timeout(30000),
      });
    } catch { throw Error('تعذر الاتصال بـGoogle Drive. تظل بياناتك محفوظة على هذا الجهاز.'); }
    if (requestGeneration !== generation) throw Error('تغيّرت جلسة Google؛ أعد العملية في الحساب الحالي.');
    if (response.status === 401) { disconnect(); throw Error('انتهت جلسة Google. اضغط ربط Google Drive مجددًا.'); }
    if (!response.ok) throw Error(response.status === 403
      ? 'رفض Google Drive العملية. تحقق من تفعيل Drive API وصلاحية التطبيق ومساحة الحساب.'
      : 'لم يؤكد Google Drive نجاح العملية. تظل نسختك المحلية كما هي.');
    return response;
  }
  const fileId = (id) => {
    if (!/^[a-zA-Z0-9_-]{1,200}$/.test(id || '')) throw Error('معرّف النسخة غير صالح.');
    return encodeURIComponent(id);
  };
  async function saveBackup(state) {
    const snapshot = validateBackup({ app: 'al-musaed', schemaVersion: state.schemaVersion,
      exportedAt: new Date(now()).toISOString(), students: state.students, results: state.results,
      drafts: state.drafts, settings: state.settings });
    const payload = JSON.stringify(snapshot);
    const size = new TextEncoder().encode(payload).byteLength;
    if (size > DRIVE_LIMIT) throw Error('النسخة أكبر من ٢٠ ميجابايت. صدّرها محليًا وقلّل الملفات الصوتية المرفقة.');
    const metadata = {
      name: 'المساعد-نسخة-' + snapshot.exportedAt.replace(/[:.]/g, '-') + '.json',
      mimeType: 'application/json', parents: ['appDataFolder'],
      appProperties: { application: 'al-musaed', schema: '1' },
    };
    // A new immutable snapshot avoids overwriting another device's saved work.
    const start = await request(DRIVE_UPLOAD + '?uploadType=resumable&fields=' + DRIVE_FIELDS, {
      method: 'POST', headers: { 'Content-Type': 'application/json',
        'X-Upload-Content-Type': 'application/json', 'X-Upload-Content-Length': String(size) },
      body: JSON.stringify(metadata),
    });
    const location = start.headers.get('Location');
    let upload;
    try { upload = new URL(location); } catch { throw Error('لم يُرجع Google جلسة رفع صالحة.'); }
    if (upload.origin !== 'https://www.googleapis.com' || upload.pathname !== '/upload/drive/v3/files')
      throw Error('أُوقف الرفع لأن عنوان جلسة Google غير متوقع.');
    const complete = await request(upload.href, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: payload });
    const file = await complete.json();
    fileId(file.id);
    return { id: file.id, name: file.name || metadata.name, createdTime: file.createdTime || snapshot.exportedAt };
  }
  async function listBackups(pageToken = '') {
    const query = new URLSearchParams({ spaces: 'appDataFolder',
      q: "trashed = false and appProperties has { key='application' and value='al-musaed' }",
      fields: 'nextPageToken,files(' + DRIVE_FIELDS + ')', orderBy: 'createdTime desc', pageSize: '30' });
    if (pageToken) query.set('pageToken', pageToken);
    const response = await request(DRIVE_API + '?' + query);
    const data = await response.json();
    return { files: (data.files || []).filter((f) => f.appProperties?.application === 'al-musaed'), nextPageToken: data.nextPageToken || '' };
  }
  async function readBackup(id) {
    const path = DRIVE_API + '/' + fileId(id);
    const metadata = await (await request(path + '?fields=' + DRIVE_FIELDS)).json();
    if (metadata.appProperties?.application !== 'al-musaed') throw Error('هذا الملف ليس نسخة للمساعد.');
    if (!Number.isFinite(Number(metadata.size)) || Number(metadata.size) > DRIVE_LIMIT)
      throw Error('حجم نسخة Google Drive غير صالح أو يتجاوز ٢٠ ميجابايت.');
    const text = await (await request(path + '?alt=media')).text();
    if (new TextEncoder().encode(text).byteLength > DRIVE_LIMIT) throw Error('النسخة أكبر من الحد المسموح.');
    let data;
    try { data = JSON.parse(text); } catch { throw Error('ملف النسخة غير صالح؛ لم تتغير بيانات هذا الجهاز.'); }
    return validateBackup(data);
  }
  return { status, prepare, connect, disconnect, saveBackup, listBackups, readBackup };
}
