// Dialectic's front door: a Cloudflare Worker in front of the on-demand MicroVM.
//
// Visitors first get a small static page with a "Start the demo" button behind Cloudflare
// Turnstile. Passing it sets a signed cookie (a "pass"); requests with a pass are proxied to the
// MicroVM's endpoint with the DO token added, and the VM resumes itself on the first one
// (DO auto-resume) and pauses itself when quiet (DO auto-pause). Bots never get past the page,
// so they never wake the VM.
//
// Spending guards, on top of the app's own lifetime budgets:
//   - MONTHLY_LIMIT_USD: the DO team's month-to-date usage (billing API). At or over it, no new
//     passes are given out until next month.
//   - WAKES_PER_DAY: at most this many passes a day.
// Notifications go to ntfy (NTFY_URL): 50/80/100% of the monthly limit (this DO team: the
// MicroVM), 50/80/100% of the app's lifetime AI and search budgets (checkAppSpend), the daily cap
// reached, and (if NOTIFY_STARTS=1) each day's first start.
//
// Bindings (wrangler.toml): STATE (KV); vars VM_HOST, MONTHLY_LIMIT_USD, WAKES_PER_DAY,
// TURNSTILE_SITEKEY, NOTIFY_STARTS; secrets DO_TOKEN (microvm:access + billing:read),
// TURNSTILE_SECRET, COOKIE_SECRET, NTFY_URL.

const PASS_COOKIE = "dia_pass";
const PASS_HOURS = 4;
const START_PATH = "/__dialectic/start";
const USAGE_CACHE_S = 900; // billing API at most every 15 min

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/robots.txt") return text("User-agent: *\nDisallow: /\n");
    if (url.pathname === START_PATH && request.method === "POST") return start(request, env, ctx);
    if (await hasPass(request, env)) return proxy(request, env, url, ctx);
    if (isPage(request)) return page(env, "start");
    return json({ detail: "Start the demo first: open this site in a browser.", code: "no_pass" }, 401);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(checkUsage(env, { notify: true }));
  },
};

// --- The start button ---------------------------------------------------------------------

async function start(request, env, ctx) {
  const form = await request.formData();
  const ok = await turnstileOk(env, form.get("cf-turnstile-response"), request.headers.get("CF-Connecting-IP"));
  if (!ok) return page(env, "start", "That check didn't go through. Please try again.");

  const usage = await checkUsage(env, { notify: true });
  if (usage !== null && usage >= limit(env)) return page(env, "resting");

  const day = new Date().toISOString().slice(0, 10);
  const key = `wakes:${day}`;
  const wakes = Number((await env.STATE.get(key)) || 0);
  if (wakes >= Number(env.WAKES_PER_DAY || 20)) {
    ctx.waitUntil(notifyOnce(env, `capnote:${day}`, "Dialectic: daily start cap reached",
      `${wakes} starts today; new visitors see "come back tomorrow".`));
    return page(env, "busy");
  }
  await env.STATE.put(key, String(wakes + 1), { expirationTtl: 3 * 86400 });
  if (wakes === 0 && env.NOTIFY_STARTS === "1") {
    ctx.waitUntil(notify(env, "Dialectic demo started", `First start today. Usage this month: ${fmt(usage)} of $${limit(env)}.`));
  }

  const expires = Date.now() + PASS_HOURS * 3600 * 1000;
  const pass = `${expires}.${await sign(env, String(expires))}`;
  return new Response(null, {
    status: 303,
    headers: {
      Location: "/",
      "Set-Cookie": `${PASS_COOKIE}=${pass}; Max-Age=${PASS_HOURS * 3600}; Path=/; Secure; HttpOnly; SameSite=Lax`,
    },
  });
}

async function turnstileOk(env, token, ip) {
  if (!token) return false;
  const body = new FormData();
  body.append("secret", env.TURNSTILE_SECRET);
  body.append("response", token);
  if (ip) body.append("remoteip", ip);
  const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
  return resp.ok && (await resp.json()).success === true;
}

// --- The pass cookie ----------------------------------------------------------------------

async function hasPass(request, env) {
  const value = cookie(request, PASS_COOKIE);
  if (!value) return false;
  const [expires, sig] = value.split(".");
  if (!expires || !sig || Number(expires) < Date.now()) return false;
  return timingSafeEqual(sig, await sign(env, expires));
}

async function sign(env, message) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.COOKIE_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(mac))).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" })[c]);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function cookie(request, name) {
  for (const part of (request.headers.get("Cookie") || "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

// --- Proxying to the MicroVM --------------------------------------------------------------

async function proxy(request, env, url, ctx) {
  const headers = new Headers(request.headers);
  headers.delete("Cookie"); // the app uses headers, not cookies; the pass stays here
  headers.delete("Authorization");
  // DO's endpoint strips X-User-Id before the VM sees it; guard.py in the image renames this back.
  const userId = headers.get("X-User-Id");
  headers.delete("X-User-Id");
  if (userId) headers.set("X-Dialectic-User-Id", userId);
  headers.set("Authorization", `Bearer ${env.DO_TOKEN}`);
  headers.set("Host", env.VM_HOST);
  const target = `https://${env.VM_HOST}${url.pathname}${url.search}`;
  let resp;
  try {
    resp = await fetch(target, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      redirect: "manual",
    });
  } catch (e) {
    resp = null;
  }
  // While the VM resumes or first boots, the endpoint may refuse or 5xx: show a waiting page
  // for page loads; API calls get the error as-is (the frontend retries its polling).
  if (!resp || resp.status >= 500) {
    if (isPage(request)) return page(env, "waking");
    return resp || json({ detail: "Dialectic is starting up; try again in a few seconds." }, 503);
  }
  const out = new Response(resp.body, resp);
  out.headers.delete("WWW-Authenticate");
  // The VM is awake (it just answered), so reading its spend now costs nothing extra.
  ctx.waitUntil(checkAppSpend(env));
  return out;
}

// --- Spending -----------------------------------------------------------------------------

function limit(env) {
  return Number(env.MONTHLY_LIMIT_USD || 5);
}

// The team's month-to-date usage in USD (cached), or null if the billing API didn't answer.
// With notify, sends each of 50/80/100% of the monthly limit once a month.
async function checkUsage(env, { notify: shouldNotify = false } = {}) {
  let usage = null;
  const cached = await env.STATE.get("usage", "json");
  if (cached && Date.now() - cached.at < USAGE_CACHE_S * 1000) {
    usage = cached.usd;
  } else {
    const resp = await fetch("https://api.digitalocean.com/v2/customers/my/balance", {
      headers: { Authorization: `Bearer ${env.DO_TOKEN}` },
    });
    if (resp.ok) {
      usage = Number((await resp.json()).month_to_date_usage);
      await env.STATE.put("usage", JSON.stringify({ usd: usage, at: Date.now() }));
    } else if (shouldNotify) {
      await notifyOnce(env, `billerr:${new Date().toISOString().slice(0, 10)}`, "Dialectic: billing check failed",
        `DigitalOcean's billing API answered ${resp.status}. Starts are still allowed; check the token.`);
    }
  }
  if (shouldNotify && usage !== null) {
    const month = new Date().toISOString().slice(0, 7);
    for (const pct of [50, 80, 100]) {
      if (usage >= (limit(env) * pct) / 100) {
        await notifyOnce(env, `usage:${month}:${pct}`, `Dialectic: ${pct}% of the monthly limit`,
          pct === 100
            ? `Usage this month is ${fmt(usage)}, at the $${limit(env)} limit: no new starts until next month.`
            : `Usage this month is ${fmt(usage)} of the $${limit(env)} limit.`);
      }
    }
  }
  return usage;
}

// The app's own lifetime AI and search budgets (spend.py): the AI key is billed to another DO
// team, so the billing check above can't see it, but the app counts every paid call. At most
// every APP_SPEND_CHECK_S, and only while the VM is awake; 50/80/100% each notify once, ever.
const APP_SPEND_CHECK_S = 600;

async function checkAppSpend(env) {
  const last = Number((await env.STATE.get("appspend:at")) || 0);
  if (Date.now() - last < APP_SPEND_CHECK_S * 1000) return;
  await env.STATE.put("appspend:at", String(Date.now()));
  const resp = await fetch(`https://${env.VM_HOST}/api/spend`, {
    headers: { Authorization: `Bearer ${env.DO_TOKEN}`, "User-Agent": "dialectic-front-door" },
  });
  if (!resp.ok) return;
  const spend = await resp.json();
  for (const [name, label] of [["ai", "AI"], ["search", "search"]]) {
    const { usd, budget_usd: budget } = spend[name] || {};
    if (!budget) continue;
    for (const pct of [50, 80, 100]) {
      if (usd >= (budget * pct) / 100) {
        await notifyOnce(env, `appspend:${name}:${budget}:${pct}`, `Dialectic: ${pct}% of the ${label} budget`,
          pct === 100
            ? `The app has spent $${usd.toFixed(2)} on ${label}, its whole $${budget} budget: ${label} answers are off until the budget is raised.`
            : `The app has spent $${usd.toFixed(2)} of its $${budget} ${label} budget (lifetime).`,
          null);
      }
    }
  }
}

// ttlDays null: remember forever (lifetime budgets).
async function notifyOnce(env, key, title, message, ttlDays = 40) {
  if (await env.STATE.get(key)) return;
  await env.STATE.put(key, "1", ttlDays ? { expirationTtl: ttlDays * 86400 } : {});
  await notify(env, title, message);
}

async function notify(env, title, message) {
  if (!env.NTFY_URL) return;
  await fetch(env.NTFY_URL, { method: "POST", body: message, headers: { Title: title, Tags: "books" } });
}

function fmt(usd) {
  return usd === null ? "unknown" : `$${usd.toFixed(2)}`;
}

// --- Pages --------------------------------------------------------------------------------

function isPage(request) {
  return request.method === "GET" && (request.headers.get("Accept") || "").includes("text/html");
}

function page(env, kind, error = "") {
  const bodies = {
    start: `<p>A shared reader for hard texts: classmates answer first, and AI helps only the way the class allows.</p>
      <p class="muted">This demo starts on demand, which takes a few seconds the first time.</p>
      <form method="post" action="${START_PATH}">
        <div class="cf-turnstile" data-sitekey="${env.TURNSTILE_SITEKEY}"></div>
        ${error ? `<p class="error">${error}</p>` : ""}
        <button type="submit">Start the demo</button>
      </form>`,
    waking: `<p>Starting Dialectic…</p><p class="muted">This page refreshes itself.</p>`,
    busy: `<p>The demo has been started a lot today, so it's resting until tomorrow.</p><p class="muted">Please come back tomorrow.</p>`,
    resting: `<p>The demo has used its budget for this month, so it's resting until next month.</p><p class="muted">The project's write-up and video are still on the project page.</p>`,
  };
  const refresh = kind === "waking" ? `<meta http-equiv="refresh" content="3">` : "";
  const turnstile = kind === "start" ? `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>` : "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
${refresh}<title>Dialectic</title>${turnstile}
<style>
  :root { --bg: #faf8f4; --fg: #222; --muted: #666; --accent: #2f5d50; }
  @media (prefers-color-scheme: dark) { :root { --bg: #1b1c1e; --fg: #eee; --muted: #aaa; --accent: #7fb8a6; } }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 17px/1.5 Georgia, serif; }
  main { max-width: 32rem; margin: 18vh auto 0; padding: 0 16px; }
  h1 { font-weight: normal; letter-spacing: .02em; }
  .muted { color: var(--muted); font-size: 15px; }
  .error { color: #b3261e; }
  button { margin-top: 12px; padding: 10px 18px; font: inherit; border: 0; border-radius: 6px; background: var(--accent); color: var(--bg); cursor: pointer; }
</style></head><body><main><h1>Dialectic</h1>${bodies[kind]}</main></body></html>`;
  return new Response(html, {
    status: kind === "start" ? 200 : 503,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...(kind === "waking" ? { "Retry-After": "3" } : {}) },
  });
}

function text(body) {
  return new Response(body, { headers: { "Content-Type": "text/plain" } });
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
