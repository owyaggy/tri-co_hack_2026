# Security: running a public copy

Written Mon 16 Nov, when one copy of Dialectic went on the open internet (a DigitalOcean MicroVM behind Cloudflare, not on the tailnet, reseeded every night). Dialectic was built as a hackathon demo where "log in as" anyone was the point, so this note says what that copy protects, where each protection lives in the code, and what it still doesn't protect. If the code and this file disagree, the code wins: fix this file.

## Who we're defending against

**Anyone on the internet who opens the link.** They can read the JavaScript, send any request with any header (curl, not just the app), and try things for hours. We assume they will:

1. **Use the server as a springboard.** The server fetches web pages for us (a professor's "add source", and the pages Kagi finds for an Ask) and shows their text back. Without care, "add source `http://169.254.169.254/...`" would show the cloud's metadata (and its credentials), and `http://127.0.0.1:...` or a `100.x` tailnet address would reach things never meant to be public. **This was the one serious hole, and the main thing fixed.**
2. **Act as the professor.** Change the charter, delete the library, decline proposals, upload files.
3. **Spend our money.** Every uncached Ask costs AI and search money.
4. **Break the page for others.** Inject script through a note, frame the site, upload junk, send huge requests.

What we accept: the data is seeded demo data, and the copy is wiped every night. Nobody's real notes are on it.

## The protections, and where they live

| Protection | What it does | Where |
| --- | --- | --- |
| **Public-web-only fetcher** | Every page fetch goes through `get_public()`. It allows only `http`/`https` on ports 80/443; resolves the host and refuses the fetch if **any** of its addresses is loopback, private (10/8, 172.16/12, 192.168/16, fc00::/7), link-local (169.254/16 incl. the metadata address, fe80::/10), CGNAT/tailnet (100.64/10), multicast, reserved, unspecified, IPv4-mapped IPv6 of any of those, or NAT64/6to4. Odd spellings (`2130706433`, `0x7f.1`, `0`) resolve to their real address and are refused like it. It follows redirects itself (at most 5), checking every hop. It **connects to the IP it checked** (Host header and TLS SNI/certificate still the site's name), so a DNS answer that changes between check and connect (rebinding) can't send it elsewhere, and it ignores proxy settings from the environment. A page is cut off at 5 MB (after decompression) and a fetch at 30 s. | `search.py`: `is_public_ip`, `public_address`, `get_public`; constants at the top |
| Unsafe source URLs are a 400 | `POST /sources` checks the URL before even looking in `web_cache`, so an old cached page can't be replayed for a bad URL. | `main.py` `add_source` |
| Only http(s) links from Kagi | Search results with another scheme are dropped, so a `javascript:` URL can never become a link in the answer card. | `search.py` `search` |
| **Professor password** | With `PROFESSOR_PASSWORD` set, `POST /api/login` swaps the right password for a token `user_id.expiry.HMAC-SHA256(password, user_id.expiry)` (7 days). `current_user()` refuses a professor without a valid token (401), so **every** route acting as a professor needs it, not only the professor-only ones. Changing the password signs every professor out. A wrong password waits 1 s. Students stay passwordless. Unset (local development), nothing changes. | `main.py`: `professor_token`, `valid_professor_token`, `current_user`, `log_in`; `api.js` sends `X-Professor-Token`; `Login.jsx` asks for the password |
| Nobody acts as the AI | `X-User-Id` of the AI user is a 401: only `ask.py` writes as the AI. | `main.py` `current_user` |
| **Request size limits** | Bodies over 1 MB are a 413 (50 MB for `POST /readings`), judged by `Content-Length` before anything reads them; a body without one (chunked) is a 411. Notes, replies, questions, quotes, comments and the hotkey's text are at most 10,000 characters (422), because they end up in AI prompts the budget pays for. | `main.py`: `LimitBodySize`, `MAX_*` constants, the `Text` type |
| **Uploads off** | `UPLOADS_ENABLED=0` makes `POST /readings` a 403 and hides the upload card (`/course` says `uploads_enabled`). Uploads are the riskiest input: untrusted PDFs go through pypdf, pikepdf, pdfplumber, ocrmypdf and Tesseract. | `main.py` `upload_reading`; `Course.jsx` |
| **Security headers** | Every response has a CSP (`script-src 'self'`; inline styles and Google Fonts allowed; pdf.js worker from `/assets`; `connect-src 'self'`; `object-src 'none'`; `frame-ancestors 'none'`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`. Checked in headless Chromium: the reader, notes and the streamed Ask work with no CSP violations. | `main.py`: `SECURITY_HEADERS`, `AddSecurityHeaders` |
| pdf.js without eval | react-pdf gets `isEvalSupported: false`: no code generated from a PDF's fonts. pdf.js is 4.4.168, past the 2024 font-code-execution fix (4.2.67). | `Reader.jsx` `PDF_OPTIONS` |
| **Text is never HTML** | No `dangerouslySetInnerHTML` or `innerHTML` anywhere. Search snippets mark hits as `[[word]]` and are split into `<mark>`s; charter rules are split into list items; AI text is plain text with `[1]` chips. React escapes everything else. | frontend, by convention: keep it that way |
| Spending limits | Lifetime budgets per service, a per-device hourly cap, and an emergency stop, checked before every paid call. | `spend.py` (SPEC §9.1) |
| Course and ownership checks | Every reading, PDF and question is looked up through the user's course (another course's is a 404). Deleting or changing sharing of an annotation is only for its author (403). A reply's parent must be on the same reading. Charter proposals and sources are changed only within the professor's course. | `main.py`: `get_reading_or_404`, `delete_annotation`, `update_sharing`, `create_annotation` |
| No cross-site requests | The API needs custom headers (`X-User-Id`), which another site's page can't send without a CORS preflight, and the backend allows no CORS. So there's no CSRF. | by construction |
| Files | The PDF route serves the path stored in the database, never one from the request. The frontend catch-all resolves the path and serves it only if it's inside `dist/` (tried `..`, `%2e%2e`, `%2f`: all get `index.html` or 404). Upload names are reduced to `[A-Za-z0-9._-]`. | `main.py` `reading_pdf`, `frontend`, `upload_reading` |
| SQL | Every value is a `?`/`:name` parameter. The f-strings in SQL only paste in constants (`VISIBLE_SQL`), column names from the `CharterUpdate` model, or `?` placeholders. | `main.py`, `db.py`, `ask.py` |

## What is NOT protected

- **Anyone can be any student.** That's the demo. A visitor can post notes, questions and charter proposals as Ana, delete Ana's notes, and dismiss charter gaps. The nightly reseed is the cleanup. There's no limit on how many notes or proposals someone posts, other than the 10,000-character cap on each.
- **The per-device Ask limit is a courtesy.** `X-Device-Id` is whatever the browser sends; a script sends a new one each time. **The lifetime budgets are the real cap**: when they're used up, the copy keeps working from the cache and the library, with no AI.
- **Password guessing** is slowed only by the 1 s wait, and requests run in parallel. Use a long random password, and a Cloudflare rate-limit rule on `/api/login` if you can.
- **The professor token is a bearer token in `localStorage`.** Script injected into the page could read it. The CSP and React's escaping are what stop that.
- **Load.** One process with 40 worker threads. Slow Asks and page fetches (up to 30 s each), `POST /readings/{id}/box-text` (Tesseract at 300 DPI on demand) and meaning search can tie it up. Cloudflare in front absorbs floods; nothing in the app rate-limits.
- **Prompt injection.** Pages Kagi finds are fed to the AI. A page could try to steer the explanation. The output is shown as text (no links but the source chips, no HTML), and the AI can't quote what the page doesn't say (`ai.pick_sentences`), but its wording can be steered.
- **Error messages are shown in full** (CLAUDE.md: fail loudly), so a 500 can name a file path or a library. Nothing secret is in them, but they're more than a stranger needs.
- **The Mac and iPhone apps can't act as a professor** on a copy with a password: they only send `X-User-Id`, so they get a 401. They're meant for students anyway.
- **Pages cached before this fix.** `web_cache` keeps fetched pages across `seed.py --reset`. A copy whose database dates from before this change could hold a page fetched from an internal address; the Ask path would replay it. A freshly built copy doesn't. To be sure on an old database: `DELETE FROM web_cache WHERE key LIKE 'page:%'` (they're fetched again as needed).
- **HTTPS and HSTS** are Cloudflare's job, not the app's.
- **Dependencies** (`uvx pip-audit` on the lock: none known; `npm audit --omit=dev`, Mon 16 Nov): `tar` / `@mapbox/node-pre-gyp` come in only through `canvas`, an optional Node-side dependency of pdfjs-dist that isn't installed or shipped. React Router 6.30.6 still has two advisories fixed only in v7 (a backslash open-redirect in `<Link>`/`navigate` with untrusted paths, and SSR error hydration); the app navigates only to paths it builds itself and doesn't use SSR. Moving to v7 is a bigger job than it's worth for the demo.

## Settings for the public copy

In that copy's `.env` (names in `.env.example`), then restart it:

| Setting | Public copy | Why |
| --- | --- | --- |
| `PROFESSOR_PASSWORD` | a long random string (`openssl rand -base64 18`), shared only with whoever demos as the professor | Visitors can't act as the professor |
| `UPLOADS_ENABLED` | `0` | No untrusted PDFs, no disk filling |
| `AI_BUDGET_USD`, `SEARCH_BUDGET_USD` | small lifetime numbers | The real cap on what strangers can spend |
| `DEVICE_ASKS_PER_HOUR` | a small number, e.g. `5` | Slows a casual visitor (not a script) |
| `AI_OFF` | `0`; `1` to stop all paid calls at once | Emergency stop |
| API keys | only `DO_INFERENCE_*` and `KAGI_API_KEY`, ideally keys made for this copy, with the provider's own spending limits | A leaked key from this machine costs only what that key allows |

Around it:

- Run uvicorn on `127.0.0.1` only (as `deploy/dialectic@.service` does), with Caddy or a Cloudflare Tunnel in front, and let only Cloudflare reach the machine.
- Nothing else of ours on the machine or its network: no tailnet, no other services, no credentials it doesn't need. The fetcher refuses private addresses, but there should be nothing there to find anyway.
- A Cloudflare rate-limit rule on `/api/login` and `/api/*ask*` if the plan allows it.
- Keep the nightly `seed.py --reset --with-reading`.

## Checking it

With the copy running (`B=https://…/api`):

```bash
# Professor without the password: 401. With a token: 200.
curl -s -o /dev/null -w '%{http_code}\n' -H 'X-User-Id: 1' $B/course
TOKEN=$(curl -s -X POST $B/login -H 'Content-Type: application/json' -d '{"user_id":1,"password":"…"}' | jq -r .professor_token)
# Fetching an internal address: 400 "… is not on the public internet …"
curl -s -X POST $B/sources -H 'X-User-Id: 1' -H "X-Professor-Token: $TOKEN" -H 'Content-Type: application/json' \
  -d '{"url":"http://169.254.169.254/latest/meta-data/"}'
# Uploads off: 403. Headers: the CSP line.
curl -sI https://…/ | grep -i content-security
```
