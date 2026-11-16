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

// ---------- the on-demand server (deploy/microvm, deploy/worker) ----------
// The public copy runs on a MicroVM that pauses when nobody's using it, behind a Worker that
// gives out a 4-hour "Start the demo" pass. That brings two states an always-on server didn't
// have: the server waking up (502/503/504, or no answer, for ~1 s after a pause and up to a
// minute on a first boot or the daily reseed), and the pass running out (the Worker's 401).
// ServerBanner.jsx shows both.
const WAKING_STATUSES = [502, 503, 504];
const GET_RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 8000, 8000, 8000, 8000]; // ~47 s in all
const WAKING_MESSAGE = "Dialectic's server is starting up. Try again in a few seconds.";
const ASK_WAKING_MESSAGE = "Dialectic's server was starting up and may not have got your question. Ask again in a few seconds.";
const STREAM_CUT_MESSAGE = 'The connection dropped before the answer finished.';
const NO_PASS_DETAIL = 'Start the demo first'; // how the Worker's 401 begins (deploy/worker/worker.js)

let serverState = 'ok'; // 'ok' | 'waking' | 'ended' (the demo pass ran out; only a page load fixes it)
const serverListeners = new Set();

export function onServerState(listener) {
  serverListeners.add(listener);
  listener(serverState);
  return () => { serverListeners.delete(listener); };
}

function setServerState(state) {
  if (serverState === state || serverState === 'ended') return;
  serverState = state;
  serverListeners.forEach((listener) => listener(state));
}

export function sessionEnded() {
  return serverState === 'ended';
}

function wakingError() {
  const error = new Error(WAKING_MESSAGE);
  error.waking = true;
  return error;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function failure(res) {
  if (WAKING_STATUSES.includes(res.status)) return wakingError();
  let detail = `${res.status} ${res.statusText}`;
  let code = null;
  try {
    const body = await res.json();
    code = body.code || null;
    if (body.detail) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
  } catch {
    // not JSON: keep the status line
  }
  const error = new Error(detail);
  error.status = res.status; // pages use 404 to spot a note that's gone (the daily reseed)
  if (res.status === 401 && (code === 'no_pass' || detail.startsWith(NO_PASS_DETAIL))) {
    // The Worker's, not the app's: the demo pass ran out. Keep who you are; the banner offers a restart.
    error.sessionEnded = true;
    setServerState('ended');
  } else if (res.status === 401) {
    // Unknown user (e.g. after seed.py --reset), or a professor's password token expired: pick again.
    logOut();
    window.location.href = '/login';
  }
  return error;
}

// One fetch, or null if there was no answer at all (network error, server not up yet).
async function tryFetch(path, options) {
  try {
    return await fetch('/api' + path, options);
  } catch {
    return null;
  }
}

async function request(method, path, body) {
  const options = { method, headers: headers() };
  if (body instanceof FormData) {
    options.body = body; // the browser sets the multipart Content-Type itself
  } else if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  // Only GETs are retried while the server wakes: a POST may have run (and an Ask costs money).
  const delays = method === 'GET' ? GET_RETRY_DELAYS_MS : [];
  for (let attempt = 0; ; attempt++) {
    const res = await tryFetch(path, options);
    const waking = !res || WAKING_STATUSES.includes(res.status);
    if (!waking || attempt >= delays.length) {
      if (delays.length) setServerState('ok'); // answered, or gave up: either way stop saying "waking"
      if (!res) throw wakingError();
      if (!res.ok) throw await failure(res);
      return res.json();
    }
    setServerState('waking');
    await sleep(delays[attempt]);
  }
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
  // Never retried: it may have run, and it costs money. A waking server gets ASK_WAKING_MESSAGE
  // and the answer card's Ask again button.
  const res = await tryFetch(path, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (!res || WAKING_STATUSES.includes(res.status)) throw new Error(ASK_WAKING_MESSAGE);
  if (!res.ok) throw await failure(res);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffered = '';
  while (true) {
    let chunk;
    try {
      chunk = await reader.read();
    } catch {
      throw new Error(STREAM_CUT_MESSAGE);
    }
    const { value, done } = chunk;
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
