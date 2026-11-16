// Every request to the backend goes through here. It adds X-User-Id (who you've
// "logged in as", SPEC §3.1) and turns a failed response into an Error carrying
// the server's real message (`detail`), so pages can show it (fail loudly).

const USER_KEY = 'dialectic_user'; // the whole user object from GET /api/users
// When the server has a professor password (explainers/security.md), POST /login gives a
// professor a signed token, sent as X-Professor-Token on every request.
const PROFESSOR_TOKEN_KEY = 'dialectic_professor_token';

export function me() {
  const saved = localStorage.getItem(USER_KEY);
  return saved ? JSON.parse(saved) : null;
}

export function logIn(user, professorToken = null) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  if (professorToken) localStorage.setItem(PROFESSOR_TOKEN_KEY, professorToken);
  else localStorage.removeItem(PROFESSOR_TOKEN_KEY);
}

export function logOut() {
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(PROFESSOR_TOKEN_KEY);
}

export function isProfessor() {
  return me()?.role === 'professor';
}

// This browser's device ID (SPEC §9.1): a random ID made once and kept apart from the
// logged-in user, so logging out or switching users doesn't reset the per-device Ask
// limit. If storage is unavailable (private mode, blocked site data), keep one for the session.
const DEVICE_KEY = 'dialectic_device';
let sessionDeviceId = null;

// crypto.randomUUID only exists on secure origins (https or localhost); a plain-http
// address gets a random ID made the old way.
function newDeviceId() {
  if (window.crypto?.randomUUID) return crypto.randomUUID();
  return 'dev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
}

function deviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = newDeviceId();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    if (!sessionDeviceId) sessionDeviceId = newDeviceId();
    return sessionDeviceId;
  }
}

function headers(extra = {}) {
  const user = me();
  const base = { 'X-Device-Id': deviceId() };
  if (user) base['X-User-Id'] = String(user.id);
  const professorToken = localStorage.getItem(PROFESSOR_TOKEN_KEY);
  if (professorToken) base['X-Professor-Token'] = professorToken;
  return { ...base, ...extra };
}

async function failure(res) {
  let detail = `${res.status} ${res.statusText}`;
  try {
    const body = await res.json();
    if (body.detail) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
  } catch {
    // not JSON: keep the status line
  }
  if (res.status === 401) {
    // Unknown user (e.g. after seed.py --reset), or a professor's password token expired: pick again.
    logOut();
    window.location.href = '/login';
  }
  return new Error(detail);
}

async function request(method, path, body) {
  const options = { method, headers: headers() };
  if (body instanceof FormData) {
    options.body = body; // the browser sets the multipart Content-Type itself
  } else if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const res = await fetch('/api' + path, options);
  if (!res.ok) throw await failure(res);
  return res.json();
}

export const get = (path) => request('GET', path);
export const post = (path, body) => request('POST', path, body);
export const put = (path, body) => request('PUT', path, body);
export const patch = (path, body) => request('PATCH', path, body);
export const del = (path) => request('DELETE', path);

// The PDF is fetched by react-pdf, not by request(), so it needs the header handed to it.
export function pdfFile(readingId) {
  return { url: `/api/readings/${readingId}/pdf`, httpHeaders: headers() };
}

// POST to a streamed ask route (SPEC §6): the reply is newline-delimited JSON, one event
// per line. EventSource can't POST, so read the body ourselves. Calls onEvent(event) for
// each line; resolves when the stream ends.
export async function askStream(path, body, onEvent) {
  const res = await fetch('/api' + path, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await failure(res);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffered = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffered += decoder.decode(value, { stream: true });
    const lines = buffered.split('\n');
    buffered = lines.pop(); // the last piece may be half a line
    for (const line of lines) {
      if (line.trim()) onEvent(JSON.parse(line));
    }
  }
  if (buffered.trim()) onEvent(JSON.parse(buffered));
}
