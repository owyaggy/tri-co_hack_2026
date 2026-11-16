# How the frontend works

A high-level tour of `app/frontend/`, written Saturday 05:07 after building it. `SPEC.md` says *what* we're building, `ideas/02-frontend-screens.md` says *what each screen looks like* (frames S01–S21), and this explains *how the code is arranged* so you can find your way around and change it. If the code and this file disagree, the code wins: fix this file.

## The shape of it

The frontend is a **React single-page app built with Vite**: `react-router-dom` for pages, `react-pdf` (which wraps pdf.js) for the reading, **one plain CSS file** and **no state library**. Each page fetches what it needs when it mounts and keeps it in `useState`. Every request goes through one small file, `api.js`.

```
browser
  └─ React app
       pages/*.jsx ──▶ api.js ──HTTP + X-User-Id + X-Device-Id──▶ /api/... (FastAPI, see explainers/backend.md)
       Reader ──▶ react-pdf ──▶ GET /api/readings/{id}/pdf
```

- **In development** Vite serves the app on `:5173` and **forwards `/api` to the backend on `:8000`** (`vite.config.js`). The backend has no CORS, so this forwarding is what makes development work.
- **In production** `npm run build` writes `app/frontend/dist/`. The backend serves it (the end of `main.py`): files from `dist/`, and `index.html` for any other non-`/api` path, so deep links like `/readings/1?page=2` work. One process, one port.

Dependencies: `react` + `react-dom`, `react-router-dom` (pages and links), `react-pdf` (draws PDF pages and their selectable text layer), `vite` + `@vitejs/plugin-react` (dev server and build). Versions are pinned in `package.json`.

## The files

| File | Lines | What it's for |
| --- | --- | --- |
| `src/main.jsx` | ~35 | The routes. Every page but `/login` is wrapped in `LoggedIn`, which sends you to `/login` if nobody is stored. |
| `src/api.js` | ~125 | `get` / `post` / `put` / `patch` / `del`, `askStream()` for the streamed Ask, `pdfFile()` for react-pdf, who's logged in (`me()`, `logIn()`, `logOut()`, `isProfessor()`), and this browser's device ID (`deviceId()`). |
| `src/colors.js` | ~40 | Person colours: `colorFor(person)` and `initial(name)`. |
| `src/styles.css` | ~310 | The only stylesheet. Colour tokens at the top, then one block per screen. |
| `src/pages/Login.jsx` | ~65 | `/login` (S01). |
| `src/pages/Course.jsx` | ~155 | `/` (S02): reading cards, the professor's upload card, charter and library cards. |
| `src/pages/Reader.jsx` | ~310 | `/readings/:id` (S03–S11): the core screen. Start reading here for anything about the demo. |
| `src/pages/Charter.jsx` | ~320 | `/charter` (S12, S13, S18): professor and student views, charter gaps, proposals. |
| `src/pages/Sources.jsx` | ~100 | `/sources` (S14): the course source library. |
| `src/pages/Search.jsx` | ~150 | `/search?q=` (S15), with a Words | Meaning (AI) switch (`&mode=meaning`). |
| `src/components/PdfPage.jsx` | ~65 | One PDF page, plus `rangeToRects()` (selection → boxes), `overlayStyle()` (where a popover goes) and `hits()` (was a click on a box). |
| `src/components/HighlightLayer.jsx` | ~30 | The coloured boxes on a page. |
| `src/components/Margin.jsx` | ~195 | The right-hand column: annotation cards, replies, lock cards. |
| `src/components/Composer.jsx` | ~80 | The popover over a selection: **Annotate** / **Ask** tabs. |
| `src/components/AskPanel.jsx` | ~315 | The answer card, and the functions that turn stream events into its state. |
| `src/components/NavHeader.jsx`, `UserMenu.jsx` | ~105 | The header on every page but the reader; the avatar menu (S19). |
| `src/components/Avatar.jsx`, `ErrorNotice.jsx`, `Icons.jsx` | ~70 | Small shared pieces. |
| `public/manifest.webmanifest`, `public/icon.svg` | | The whole PWA (SPEC §4). |

## Who you are

Students have no password (SPEC §3.1). `Login` lists `GET /api/users`. Clicking a person calls `POST /api/login` and stores **that whole user object** in `localStorage` (`dialectic_user`), and `api.js` sends its id as **`X-User-Id`** on every request. A professor whose row says `needs_password` (the server has `PROFESSOR_PASSWORD`) gets a password box under their row first; the token `/login` returns is kept as `dialectic_professor_token` and sent as **`X-Professor-Token`**, and `logOut()` drops it (`explainers/security.md`). The course page shows the upload card only when `/course` says `uploads_enabled`. The reader hands react-pdf `options={{ isEvalSupported: false }}` (one constant, `PDF_OPTIONS`), which the server's CSP needs anyway. Pages call `me()` to read it and `isProfessor()` to decide what to *show*. The server still checks every permission: a student's `PUT /charter` gets a 403 whatever the UI shows.

- A **401** means the stored id is unknown (e.g. after `seed.py --reset` renumbered users), or a professor's token has expired or the password changed. `api.js` clears it and goes to `/login`.
- `Login` also stores the user list (`dialectic_users`). Peer results in an Ask answer carry an author's name but not their id, so `colorFor` uses that list to look up their colour.

**This browser is a "device"** (SPEC §9.1, spending limits). `deviceId()` in `api.js` makes a random ID the first time it's needed (`crypto.randomUUID()`, or a Math.random one on a plain-http address where that doesn't exist) and keeps it in `localStorage` under `dialectic_device`, **separate from the user**, so logging out or switching users keeps it. Every request sends it as **`X-Device-Id`**: the JSON calls, the PDF fetch and the streamed Ask. If storage is unavailable (private window, blocked site data) the ID lives in memory for the session. The server uses it only to count paid Asks per device per hour; clearing storage gets round that, which is fine (the copy's budget is the real cap).

## How a request flows

1. A page calls e.g. `get('/course')` in a `useEffect`.
2. `api.js` adds `X-User-Id` and `X-Device-Id` (and `Content-Type: application/json` when there's a body; for `FormData`, like the PDF upload, it lets the browser set the multipart header).
3. On a non-2xx response it throws an `Error` whose message is the server's `detail` (for a 500 that's the real error, e.g. a missing API key).
4. The page catches it and shows it with `<ErrorNotice>`. Nothing is swallowed (CLAUDE.md: fail loudly).

## The reader

`Reader.jsx` holds all the state for the screen. The components below it only draw and report clicks.

```
Reader   state: reading, annotations, currentPage, scale, activeId, selection, tab, answer
 ├─ header: breadcrumb · Live dot · zoom · Class charter · avatar menu
 ├─ .pdf-column (scrolls)
 │    └─ Document (react-pdf)
 │         └─ PdfPage × page count
 │              ├─ canvas + text layer (react-pdf)
 │              ├─ HighlightLayer      ← this page's unlocked annotations (+ the pending selection)
 │              ├─ Composer            ← if the selection is on this page
 │              └─ AnswerCard          ← if the open answer is on this page
 └─ Margin       ← cards for currentPage
```

### Drawing the PDF and the highlights

The approach comes from spike S1 (`spikes/0306-pdf-selection/`), rebuilt here; `app/` doesn't import the spike.

- **Boxes are stored as fractions of the page** (`rects: [{x, y, w, h}]`, 0–1, top-left origin). `HighlightLayer` places them in `%`, so they stay on the right words at any zoom without recomputing anything. Zoom is just react-pdf redrawing the pages at a new `scale`.
- **Layer order matters.** react-pdf puts the text layer at `z-index: 2`. Our highlight layer is `z-index: 1`, so it's under the text and the text stays selectable. `mix-blend-mode: multiply` is on the **layer**, not on each box: S1 found that blending each box hides the text.
- **Popovers and the answer card are children of the page** (`.page-overlay`, positioned under the passage by `overlayStyle()`), so they scroll with it. A page with one open gets `z-index: 5` (`.pdf-page:has(.page-overlay)`), or the next page would paint over a tall card.
- The **current page** (which the margin shows) is worked out on scroll, in `onScroll`: it's the last page whose top is above a third of the way down the column.
- Opening `/readings/1?page=2&annotation=7` (from search, or the Mac app's "Open in reader") scrolls to page 2 once it has drawn, and rings annotation 7.

### Selecting text and clicking highlights

Mouse handling is `onMouseUp` on the PDF column (plus `onMouseDown`/`onMouseMove` while drawing a box):

- **Text selected:** `rangeToRects(range, pageEl)` turns the browser's selection into page-fraction boxes, merged to one box per line. The reader stores `{page, quote, rects}` as `selection`, which opens the `Composer` popover under it and draws the pending selection.
- **A plain click:** converts the click to page fractions and checks each unlocked annotation's boxes with `hits()`. A hit rings that highlight and scrolls the margin to its card. A miss closes the popover.
- Clicks inside a popover or card (`.page-overlay`) are ignored, so typing doesn't close it.
- `TODO(edge)`: a selection across two pages keeps only the first page's boxes.
- **Select area (a box, SPEC §3.3):** the **Select text / Select area** toggle (`.select-toggle`, a pill floating over the PDF column's top-left corner inside `.pdf-wrap`, so it doesn't scroll) sets `boxMode` (the column gets `.box-mode`: crosshair cursor, text layer ignores the mouse). Dragging keeps `draftBox` and draws it as the pending selection; on mouse-up (`finishBox`) the box becomes `selection` with `box: true` and an empty quote, the mode switches off (the toggle flips back to Select text), and `POST /readings/{id}/box-text` fills the quote. The final box is computed from the mouse-up event itself, because the last mouse move may not have re-rendered yet. `Composer` shows the quote as an editable **Passage in this box**; Ask stays disabled while it's empty. Esc cancels.

### The margin and the engagement lock

`GET /readings/{id}/annotations` returns everything you can see on every page, newest first. The reader keeps that whole list; `Margin` filters it to the current page and sorts the cards **by where they sit on the page** (top of their first box), top to bottom.

- A **full** annotation gets a card: avatar, name ("You" for your own), badge (`Professor`, `AI` or a past cohort, from the API's `badge`), "via the Mac hotkey" if `via` says so, body, and replies (a **Reply** link opens a reply box: `ReplyBox`, a textarea that grows to ~7 lines; Enter sends, Shift+Enter adds a line; the AI explanation's reply box is the same). Your own cards also get the "Shared with future classes" checkbox (`PATCH /annotations/{id}`) and **Delete**. A question with a saved answer shows "Answered: 2 classmates, 1 source, AI context" (from `answer_summary`); clicking it reopens the answer card from `GET /questions/{id}/answer`.
- A **locked** annotation arrives as only `{id, page, rects, locked: true, group, group_notes}`. It draws **no highlight**, and the margin shows **one lock card per `group`**: "N notes near here. Add a note or ask a question to see them." The server did the grouping; `Margin` just collects by `group`.
- When your current selection is near a lock card, the card turns blue and says saving a note or asking shows them. That uses `NEAR_DISTANCE` at the top of `Margin.jsx`, a copy of the server's 0.08. It only changes the wording; the server decides what unlocks.
- **Nothing about unlocking is worked out in the browser.** After you save a note, the reader fetches the annotations again; the server now sends the nearby ones in full, so the lock card turns into their cards. That's demo step 2.

### Live updates

While the tab is visible, the reader fetches the annotations again every **`POLL_MS`** (5 s), and also when the window gets focus or the tab becomes visible. Each fetch replaces the list. The green **Live** dot greys out while the tab is hidden. This is how a question asked from the Mac hotkey shows up without a reload.

## Asking a question

The **Ask** tab of the popover is a question box and an **Ask** button (Enter sends). **There are no suggested questions, "Try:" chips or rephrasing hints anywhere**: that's a product decision (students write their own).

### The streamed answer

`Reader.ask()` closes the popover, opens an empty answer card (`newAnswer()`), and calls `askStream('/readings/{id}/ask/stream', …)`. The reply is **newline-delimited JSON**: `askStream` reads the body with a stream reader, splits it into lines and hands each parsed event to a callback. `EventSource` can't be used because it can't POST.

Each event goes through **`applyEvent(answer, event)`** in `AskPanel.jsx`, a plain function that returns the new answer state:

| Event | What changes |
| --- | --- |
| `question` | `questionId` is set. The reader also fetches annotations again, so the question appears in the margin straight away. |
| `status` | Its label is added to the checklist (✓ for the earlier ones, a spinner on the latest). |
| `peer` | The *From your class* slot fills in. Usually under a second. |
| `blocked` | Added to the notices (it can come several times). |
| `sources` | *Sources* and the skipped results fill in. |
| `ai_answer` | The AI slot fills in (or stays empty if `null`). |
| `done` | `result` is the whole `/ask` response: it replaces everything, and the checklist goes away. |
| `error` | The whole request failed: what's shown stays, plus a red "Couldn't answer this question" with the real message and **Ask again**. |

A saved answer is reopened with `savedAnswer()`, which is just a `done` event with the saved result.

Measured with the real backend: about 25 s the first time a question is asked, about 7 s when it's asked again (the backend caches the AI's decisions).

### The answer card

`AnswerCard` shows the sections **always in this order**, each only if it has something, and numbered by what's shown:

1. **From your class**: classmates' notes that match, past cohorts with their badge. Clicking one scrolls to it in the reader. Its thread is unlocked in the margin too: the server counts a classmate's answer your Ask showed you as seen, and the reader reloads the margin when the peers arrive (SPEC §3.5).
2. **Sources**: a numbered chip, the title linked to the `#:~:text=` URL (opens the page scrolled to the quoted sentence), the site, and the sentence. Opening a source (its title or a `[1]` chip in the explanation) also copies its sentence to the clipboard, and a muted line under the list says so: some sites ignore sentence links and open at the top (#5, Cambridge Core), and ⌘F + paste finds it there. Then "N results skipped": ruled-out and not-covered results are shown **without a link**, because the charter excludes them; unreachable and no-answer ones are linked so the student can read them. If every result was skipped (and the library fallback found nothing either), a "No usable sources this time" notice takes the list's place and the skipped list opens by itself; when all of them were charter exclusions the notice says so and links the charter.
3. **AI explanation**: starts as the button **"Still stuck? Show the AI explanation"**. Opening it shrinks the first two sections to a summary row each, shows the text with `[1]`, `[2]` turned into linked source chips, and lets you reply.

**Charter notices** come from `blocked`, each shown in the slot of the layer it blocks (`CharterNotice`):

| `by` | Shown as |
| --- | --- |
| `toggle` | Amber: "Your class charter doesn't allow AI explanations." + the label + a link to the charter (S10). |
| `rule` | Amber: "No AI explanation for this question", the rule (`label`) and the gate's `reason` (S11). The other sections still show. |
| `no_sources` | Amber, the label only. |
| `error` | Red, with the real error in monospace (S20). On the source step it says the library was used instead. |
| `limit` | A spending limit (SPEC §9.1): this device's AI questions for the hour are used up, this copy's budget is used up, or AI is switched off on this copy. Amber, with a clock icon instead of the charter's scales, and the server's `label` shown **as-is**, with no charter link (the charter didn't cause it). Classmates and library sources still show around it. |

A toggle or rule on the *sources* layer shows no notice: the library was searched instead, and those results appear as normal sources. An `error` or `limit` there does show, in the Sources slot. A limit usually blocks both AI layers, so its notice appears twice: once in Sources, once in the AI slot.

## The other pages

- **Course** (`GET /course`, `/charter`, `/sources`): reading cards, sorted by title so "Week 1 · …" comes first whatever the upload order, ("7 pages · 2 notes · 0 questions"). The professor gets the dashed upload card: `POST /readings` with a `FormData` of `title` + `file`. An upload comes back `processing` (the server OCRs it, SPEC §3.11): its card says "Reading the scan…" and isn't a link, and the page polls `/course` every 3 s until it's `ready` (or `failed`, showing the error). The reader shows a notice instead of the PDF for a reading that isn't ready. The side cards show the charter's switches as pills and how big the library is.
- **Charter**: the professor sees the rules as the same numbered list students see, with an **Edit rules** button that swaps in the Markdown box (it stays open while there are unsaved rule changes, e.g. from **Add to rules**). The professor edits the rules and "Sources we trust" text, which save together with **Save charter** (the button shows "N unsaved changes"). The **switches save the moment you click them**: they're hard limits, and demo step 4 flips one live. Students see numbered rules (`1. …` lines become a list; never rendered as HTML), the sources text, and On/Off pills. **Charter gaps** (`GET /charter/gaps`, the 5 most-skipped kinds, the rest behind **Show N more**): the professor's **Allow** / **Rule out** add a sentence to the end of the sources text (marked as an unsaved change; nothing applies until Save), **Dismiss** hides a kind (`POST /charter/gaps/dismiss`). A student's **Propose allowing** fills in the proposal box below. Proposals post with `POST /charter/comments`. The professor gets no proposal box; each open proposal has **Add to rules** (or **Add to sources** for a "Propose allowing" one: appends it to that textarea, and `PATCH /charter/comments/{id}` marks it `added` after **Save charter**), **Mark added** and **Decline** (both `PATCH` at once). Answered proposals show a status pill (and **Reopen** for the professor).
- **Sources**: the library, "found for Ben's question: …" or "added by hand", **Found by AI** / **Added by your professor**. The professor can add one by URL (the server fetches it) or remove one.
- **Search**: two sections, "Notes and questions" and "In the readings", each result linking into the reader at that page and annotation. The server marks hits as `[[word]]`; `Snippet` splits the string and wraps hits in `<mark>` elements. Locked notes never appear (the server leaves them out). The **Words | Meaning (AI)** switch under the box puts `mode=meaning` in the URL: results are then one section, "Passages close in meaning", reading passages only (plain text, no marks). If the charter turned it off, the server sends `blocked` and the page shows "Meaning search is off" with the switch's name and a link to the charter. The switch reuses the reader's `.select-toggle` pill look (`.search-mode` makes it sit in the page flow).
- **User menu** (avatar, S19): **Share my notes with future classes** (`PUT /me/sharing`, then a line with how many changed), **Switch user**, **Use on Mac** (`dialectic://login?user=<id>`, only shown on a real Mac via `platform.js` `IS_MAC`; does nothing if the Mac app isn't installed).

## Safety rules the frontend keeps

- **User text is never inserted as HTML.** Notes, quotes, questions, AI text and search snippets are all rendered as React text. There's no `innerHTML` or `dangerouslySetInnerHTML` anywhere; keep it that way.
- **Sources the charter excludes are never linked** (`not_permitted`, `not_covered`). Showing them is the point; linking them would get round the charter.
- **Errors are shown, not hidden.** Every failed request ends up on screen with the server's message.

## Where to change things

| To change… | Edit |
| --- | --- |
| Colours, fonts, spacing | The custom properties at the top of `src/styles.css` |
| Who gets which highlight colour | `PALETTE` in `src/colors.js` (picked by `user.id % 3`) |
| How often the reader refreshes | `POLL_MS` at the top of `Reader.jsx` |
| Starting zoom, zoom step, popover widths | Constants at the top of `Reader.jsx` |
| Answer card wording ("Still stuck?…", the wait hint) | Constants at the top of `AskPanel.jsx`; the notice wording is in `CharterNotice` there |
| Charter switch labels and help text | `SWITCHES` at the top of `Charter.jsx` |
| The sentences Allow / Rule out add | `allowSentence` / `ruleOutSentence` in `Charter.jsx` |
| Course title on the login page | `COURSE_TITLE` in `Login.jsx` (DEMO: it's shown before any course call) |
| Where `/api` goes in development | `BACKEND_URL` in `vite.config.js` |
| The device ID's storage key | `DEVICE_KEY` in `api.js` |
| A request or response shape | **Not here first:** `SPEC.md` §6 is the contract. Change it there and in the backend in the same commit, then follow it here. |

## Running it

Start the backend (see `explainers/backend.md`, *Running and poking it*), then from `app/frontend`:

```sh
npm install
npm run dev        # http://localhost:5173, /api forwarded to :8000
npm run build      # writes dist/; the backend on :8000 then serves the app too
```

To see the engagement lock and live updates, log in as Ben in one browser and as Prof. Rivera (or Ana) in a private window.

## Known gaps (as of 05:07 Sat)

- **Checked:** demo steps 1–4 in headless Chrome against the real backend and AI: Ben sees "1 note near here", saves a note and Sam's note appears; asking streams classmates → sources with quoted sentences → the collapsed AI explanation with working citation chips; with "AI may write explanations" off, the same question shows the charter notice instead. Charter, Sources and Search render. The built `dist/` served by FastAPI works, deep links included.
- **Not checked by hand yet:** a real mouse selection in a real browser (the test built the selection in script), a phone-width layout, the S11 rule refusal and S20 error states live (they're built from the shapes in SPEC §6).
- The **sharing switch** in the user menu always starts "on": the API has no per-user setting to read it from.
- The Ask answer card is anchored to the passage inside the page, so at a narrow zoom it can be wider than the page (it overflows sideways rather than being clipped).
- **Spending limits checked** (05:14 Sat, headless, backend run with `DEVICE_ASKS_PER_HOUR=1`): the device ID stays the same across switching users and is sent on every request; a second fresh Ask from the same browser shows the device-limit notice in the Sources and AI slots, with classmates and a library source still in order.
- `react-router` prints two "future flag" warnings in the console; they're harmless.
- The bundle is one ~560 kB JavaScript file plus the pdf.js worker; fine for a demo.
