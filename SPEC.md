# Dialectic: spec

**Status:** draft for review (Sat 00:20). **Deadline:** demo path working by 15:00, submission 16:00 Saturday.

Dialectic is a collaborative reading platform for college courses (e.g. Haverford). Students annotate course texts together, ask questions about hard passages, and get answers from their peers first. AI is available only in the ways the class has agreed to, in a charter that students and the professor write together.

---

## 1. Principles (and what they mean for the build)

| Principle | What it means in the product |
| --- | --- |
| **Collaboration** | Annotations are visible to the whole class by default. Questions are annotations too, so others can answer them. Peer answers show before anything else. |
| **Friction** | AI never writes your answer for you. It finds sources, or it posts a short explanation that is **public, labelled and open to replies**, never a private shortcut. |
| **Charter governs AI** | Two passes. **Pass 1 (gate):** the charter's toggles are checked in code, then an LLM call asks "does the charter allow this request?" and answers per layer, naming the rule. **Pass 2:** only allowed layers make the real query. |
| **Sources the class trusts** | The charter describes **permissible sources** in plain language ("scholarly work and primary sources from the period; no study-guide sites"). The AI searches the web, keeps only results that fit that description, and every source it uses is saved to the course library, so the library grows without anyone curating it by hand. |
| **Stay in your text** | You never have to leave what you're reading. Wherever you read (Notability, Preview, a notes app, any PDF), you highlight or screenshot a passage and press the **Dialectic hotkey**. The Mac app reads your screen, works out which course reading and section it is, and answers from your peers, sources or an AI explanation (if the charter allows). **Everything is noted:** the question and the answer are saved as annotations in that section, exactly as if you'd asked in the web reader (§3.9). |
| **Privacy** | The AI provider gets only the highlighted passage, the question, the charter text and source excerpts. Kagi (search) gets only a generated search query. **No names, IDs or other annotations' authors** go to either. The hotkey reads the screen **on your Mac** (macOS Vision); only the recognised text leaves it, never the screenshot. Students can delete their annotations and choose whether future classes may see them. |

---

## 2. The demo path (build exactly this first)

Seed users: **Prof. Rivera** (professor), **Ana** and **Ben** (students), plus **Sam (Spring 2026)**, a past student whose annotations are opted in. The course is **PHIL 247: The Social Contract (seminar)** (§10, since Sat 11:55; the Du Bois version of this path is in git history and `seed_dubois.py`). It's week 2: Hobbes (week 1) is already well annotated and Wollstonecraft (week 3) is up with no notes.

1. **Professor sets up the course.** Prof. Rivera logs in, uploads `rousseau-social-contract.pdf` (Rousseau, *The Social Contract*, Jonathan Bennett's version), titles it "Week 2 · Rousseau, The Social Contract", and fills in the charter: rules text, a plain-language **permissible sources** description, and toggles, with all AI toggles **on**.
2. **Ana annotates; Ben has to engage to see it (friction).** Ana highlights the general-will sentence on p. 12 ("Each of us puts his person and all his power in common under the supreme direction of the general will") and writes a note. Ben logs in and opens the reading. Next to that passage the margin shows only **"2 notes near here. Add a note or ask a question to see them."** (Prof. Rivera's notes on "Man is born free" and on Grotius are visible straight away.) Ben highlights the passage and writes his own note, and Ana's note and Sam's note from last year (marked "Spring 2026") appear. That's the engagement lock (§3.4).
3. **Ben asks a question.** Ben highlights the same sentence → **Ask** → "Where does the idea of the general will come from, and what did it mean in 1762?" The answer panel shows, in order:
   1. **From your class:** matching peer, past-student and professor annotations (Ana's, Sam's), each linking to its place in the text.
   2. **Sources:** sources the AI found on the web that fit the charter's permissible-sources description, each linking out to the exact sentence that answers the question. A small note shows what was filtered out ("2 results skipped: study-guide sites aren't permitted"). If every result was skipped, a "No usable sources this time" notice says so and the skipped list opens.
   3. **AI explanation** (if allowed): a short summary citing the sources above, posted as a public annotation by "Dialectic AI" that Ana can reply to.
   - **Same thing without leaving your text (hotkey):** Ana has the same text open in Notability (or Preview), not in Dialectic. She highlights "His usual method of reasoning is to establish right by fact" (p. 7), presses the hotkey and asks for **context**, not interpretation: "Who was Grotius, and what did he write?" A floating panel shows the same three layers: Prof. Rivera's Grotius note, encyclopedia sources, and a short AI explanation. (Gate verdict checked Sat 11:55, one run: fully allowed.) Back in the web reader, Ben sees her question and its answer in the margin on that passage: it was noted.
4. **The charter changes the answer.** Two versions; pick whichever lands better in rehearsal:
   - **Toggle:** Prof. Rivera turns off "AI may write explanations". Ben asks the same question and gets peer annotations and sources only, plus a notice: *"Your class charter doesn't allow AI explanations (AI may write explanations — off)."*
   - **Rule text (shows the gate):** rule 2 already says AI may not interpret the text. Ben asks "What does Rousseau *mean* by the general will?" With `GATE_CONTEXT_ONLY` on (the default) the gate allows sources and a **context-only** explanation citing rule 2: it opens by saying what it won't answer, then gives only the term's background. He rephrases to "Where did the term 'general will' come from?" and both are fully allowed. Peer annotations show both times. (Verdicts checked on the seminar charter Sat 11:55, one run each; the old "three out of three" checks were on Du Bois.) For the refusal beat, set `GATE_CONTEXT_ONLY = False` in `ai.py` and re-check.

5. **(Optional) At scale: the big lecture.** Log out and in as **Maya** in *PHIL 101* (a seeded 70-student lecture on the same text, §10). The general-will sentence on p. 12 is one card, **"10 notes near here"**, and almost every other note on every reading is locked too; she adds a note there and the threads open. Her Ask gets five peer answers before any AI. Shows the lock and peer-first answers are what make a crowded margin readable. **Jordan** is the opposite: he writes a lot, so his margins are mostly open.

**Non-goals:** real auth, a course picker (each person is in exactly one course, §3.2), notifications, mobile polish. Also out: offline/service worker, charter version history, editing PDFs, a hand-curated source library UI beyond a simple add form.

---

## 3. Features

### 3.1 Log in as

A page listing the seeded users, **grouped by course**; a course with more than five people shows its first four (the professor, then the seed's featured students) and a **Show all N people** link. Clicking one stores their `user_id` in `localStorage` and sends it as an `X-User-Id` header (alongside the `X-Device-Id` from §9.1). No passwords for students: anyone can be any student. A copy with `PROFESSOR_PASSWORD` set (the public one) asks for it before logging in as a professor (`explainers/security.md`).

On a Mac (not an iPad, which also reports itself as a Mac), each user row also has a small **Use on Mac** link to `dialectic://login?user=<id>`. Clicking it opens the Mac app (§3.9), which saves that user, so both apps act as the same person without picking twice. If the Mac app isn't installed the link does nothing. `TODO(edge)`.

### 3.2 Course home

**Several courses, each person in exactly one** (`users.course_id`), so there's no course picker: your course is whoever you logged in as. Each course has its own readings, charter (and comments and gaps), source library and search; another course's readings are a 404. Seeded: `HIST 214: Black Intellectual Traditions` (the demo path) and `AMST 101`, a large lecture (§10). The AI user belongs to no course and serves all of them. Course home shows: readings, a link to the charter, the search box. Professor sees an **Upload reading** form (title + PDF file).

### 3.3 Reader (the core screen)

- Left: the PDF, rendered with **`react-pdf`** (pdf.js) **with its text layer on**, so text is selectable.
- Right: margin panel listing annotations on the current page, newest first, each with author, cohort badge ("Spring 2026", "Professor", "AI"), text and replies.
- **Locked annotations** (§3.4) appear in the margin as one placeholder per cluster, at their position: "**N notes near here.** Add a note or ask a question to see them." (A count of notes, not people: locked annotations carry no author.) No author or text. Their highlights aren't drawn.
- Highlights from all visible annotations are drawn over the page as translucent boxes. Clicking one scrolls the margin to it.
- Selecting text shows a small popover: **Annotate** | **Ask**.
- **Select area (box selection), the fallback for unreadable scans and pictures.** A **Select text / Select area** toggle (a pill floating in the top-left corner of the PDF column, Select text on by default); switch to Select area, then drag a box on the page (Esc cancels; one box per switch, then it flips back to Select text). The box is the annotation's one `rect`. The server reads the text inside it (`POST /readings/{id}/box-text`: the PDF's own text there, else Tesseract on that area at 300 dpi) and the popover shows it as an editable **Passage in this box**, so a student can fix a misread or type the passage from a page OCR can't read. That passage is the `quote`. Notes work with an empty passage (a note about a picture); **Ask needs one** (peers, sources and the AI all work from the text), so it's disabled until there is one and the server returns 422 without it. `TODO(edge)`: touch screens (mouse only), boxes across two pages.
- **Live updates.** While the tab is visible, the reader refetches `GET /readings/{id}/annotations` every **5 s** (`POLL_MS`, a constant at the top of the file), and again whenever the window gets focus. That's how a question asked from the Mac hotkey shows up in a classmate's margin without a reload. Polling, not websockets: one server, a handful of users. Server-sent events only if there's time at the end.

**Anchoring (the risky part; see spike S1).** On selection we store:
- `page` (1-based),
- `quote` (the selected text, exact),
- `rects`: the selection's `getClientRects()` converted to **fractions of the page's width/height**, so they redraw correctly at any zoom.

Redraw from `rects`; use `quote` for search, for the AI prompt and as a human-readable fallback. No fuzzy re-anchoring: PDFs don't change after upload. A box selection (above) stores one rect and the passage the student confirmed; its `quote` may be `""`.

### 3.4 Annotations

One table covers notes, questions, AI answers and replies:

- `kind`: `note` | `question` | `ai_answer`
- `parent_id`: set for replies (one level of nesting shown; deeper replies display flat).
- Author can delete their own. Deleting removes it from the repository and search immediately.
- `share_with_future` (default on, checkbox on the composer): whether future cohorts may see it.

**Visibility rule:** you see an annotation if it's from your cohort, or it's from a past cohort with `share_with_future = 1`, or its author is the professor or the AI.

**Engagement lock** (charter toggle `annotate_before_peers`, on by default). A visible annotation is shown **in full** only if one of these is true:
- its author is the professor (guidance is always visible);
- it's your own;
- you have engaged **near** it: you've written a note **or asked a question** whose highlight is near its highlight. A question counts as engagement: we trust students, and when someone has a question, their classmates' annotations are the best answers to it, so withholding them would be perverse;
- a classmate's answer in it (or the note itself) was shown to you by one of your Asks (§3.5);
- it's a reply, or an AI answer, under an annotation you can see in full.

**The lock never applies to the professor:** they see every visible annotation in full, since they need the whole class's thinking to teach from it (issue #1).

Otherwise it's **locked**: the API returns it as `{"id", "page", "rects", "locked": true}` plus its lock-card group (§6), with no author, cohort or text, so nothing leaks through the browser. The UI shows locked ones only as a count (§3.3): one card per group of nearby locked notes, "N notes near here" (`group_notes`).

**Near** means roughly "the same paragraph", measured by position rather than exact matching. Two highlights are near if they're on the same page and the vertical gap between their bounding boxes is at most `NEAR_DISTANCE` (a constant in `db.py`, start at `0.08` of the page height, about a paragraph; tune it on the demo PDF). With the S1 paragraph fallback, near means the same paragraph or the one either side. `TODO(edge)`: passages that run across a page break.

### 3.5 Asking a question

`POST /api/readings/{id}/ask` with `page`, `quote`, `rects`, `question`. The server:

1. Saves the question as an annotation (`kind = question`), so it's public and answerable.
2. **Peer layer (always on, no AI):** FTS5 search over visible **notes and replies** on this reading (not other questions or AI answers, which aren't answers from your class, and not the asker's own notes) using keywords from `quote + question`, boosted for annotations on the same **page** (the same section instead, once §3.10 is built). Top 5.
3. **Pass 1, the gate** (only if `ai_enabled`): toggles are checked in code first; any layer whose toggle is off is blocked without asking the model. If any AI layer is still possible, one LLM call (`GATE_PROMPT`, §7) reads the charter text, the quote and the question, and returns per layer `allowed` + the `rule` it relied on + a one-line `reason`, plus a web `search_query` to use if source finding is allowed. A denied layer is blocked with that rule quoted to the student. **Layers are judged separately, so a request can be partly allowed** (e.g. sources yes, explanation no): the answer then has only the allowed layers, nothing AI-written comes from a denied one, and the `blocked` list says which part was refused and by which rule. A layer counts as allowed only if the gate returns exactly `true`; anything else (missing, `"false"`, garbled) denies it. **Context-only explanations** (`GATE_CONTEXT_ONLY` in `ai.py`, on by default): when a question asks for something the charter forbids ("why did Du Bois write…", "what does he mean…") but historical context is allowed and the phrase has background worth knowing, the gate allows the explanation with `context_only: true`. The explanation then opens with one sentence saying which part it won't answer and by which rule, and gives only the background (where the phrase came from, what it referred to then). No `blocked` entry is added, because the explanation says it itself. Switched off, such questions block the explanation as before.
4. **Pass 2, source layer:**
   - **No AI** (`ai_find_sources` off or denied): FTS5 over the course source library, which holds every source the AI has found before. Top 3. This is how the class gets less dependent on AI over time.
   - **AI** (allowed): search the web with `search_query` (15 results) → one LLM call (a simple decision per result) sorts the results' titles, URLs and snippets against the charter's **permissible sources** description: `keep` (with a usefulness rating), `ruled_out` (the description explicitly excludes this kind of source), `not_covered` (the description doesn't mention it) or `off_topic` (including copies of the reading itself), plus a short label for the kind of source; the student-facing reasons are built from that label ("Your charter rules out study-guide sites", "Your charter doesn't mention journal articles") → fetch all kept pages in parallel and read the 5 most useful that open (sites that refuse, like Britannica and The Atlantic with a 403, go into `skipped_sources`) and extract the main text (`trafilatura`) → the LLM **quotes the exact sentence** in each that answers the question; up to 3 pages with a real sentence become the sources, and pages with none (e.g. JSTOR's landing pages) go into `skipped_sources` → link out with a text fragment (`url#:~:text=<sentence>`), so the browser jumps to and highlights that sentence. Each used source is saved to `sources` (`found_by = 'ai'`) with its extracted text, so it's searchable from then on. If the web gives no usable source, the layer falls back to the course library, as in no-AI mode. Before an explanation may cite a library source, the same sentence-picking step must find an answering sentence in it.
5. **Pass 2, AI explanation layer** (allowed): the LLM writes at most `max_explanation_words` words from the sources above (only those with a verified sentence, each shown to the model as the text around that sentence), citing them as `[1]`, `[2]`. It doesn't end with a question or suggest what to ask or think next: students write their own questions, and the Ask UI offers no suggested questions either. The limit is enforced in code by trimming the explanation. If explanations are allowed but there are no sources to ground one in, there's no explanation and `blocked` gets a `"by": "no_sources"` notice instead of a silent gap. Saved as an annotation (`kind = ai_answer`, author = the "Dialectic AI" user, `parent_id` = the question), so it shows in the margin and takes replies.
6. Returns all three layers, a `blocked` list (each with the toggle or charter rule that blocked it) and a `skipped_sources` list, so the UI can explain itself.

**Engagement lock and Ask:** the question is saved before the peer layer runs, so it already unlocks the annotations **near the asked passage**. Peer matches **elsewhere** in the reading are **shown in full in the Ask panel** too: asking is engagement, so any classmate's answer to the question is fair game. Seeing one there **unlocks its thread in the margin too** (§11 #9), so clicking it in the panel lands on its card, not a lock card. Nothing extra is stored: the lock reads the peers from the answer saved with each of the student's questions, which is saved as soon as the peer layer is done, before sources and the explanation.

**Staged panel (§8 #8, built server side):** `POST /readings/{id}/ask/stream` (and `POST /ask/stream` for the hotkey) runs the same steps but sends each result as soon as it's ready, one JSON object per line (§6), with a `status` line before each slow step ("Checking the charter…", "Finding sources your charter permits…", "Writing a short explanation…"). Classmates' answers arrive in well under a second; sources after about 15 s; the explanation last. The plain `/ask` routes still return everything at once.

**Reopening an answer:** the finished response is saved with the question (`annotations.answer_json`). A question's margin card shows a summary from it ("Answered: 2 classmates, 1 source, AI context") and clicking it reopens the answer card with `GET /questions/{id}/answer`, for anyone who can see the question in full. It's the answer as it was when asked.

**When a step fails** (the AI service or Kagi is down, or a bug): an AI step that throws doesn't sink the whole answer. It becomes a `blocked` entry with `by: "error"` and the real error as its `reason`, the source layer falls back to the course library, and the rest still arrives. Anything else that fails (saving the question, the peer layer) fails the request: a 500 with the real message, or a final `error` line on the stream. The panel keeps what it already has and shows the error.

**How a response is shown** (web Ask panel and Mac panel alike):
- **Always in this order: peers → sources → AI explanation**, whatever loads first. A layer that arrives early waits for its slot.
- **Empty layers aren't shown.** A layer blocked by the charter shows its one-line notice in its usual place instead.
- **The AI explanation starts collapsed** behind a button, **"Still stuck? Show the AI explanation"**, so students meet their classmates and sources first. It's saved as an annotation either way; the button only controls this panel.

### 3.6 Permissible sources and the course source library

**Nobody has to curate a list.** The charter has a `permissible_sources` field in plain language, written with the rest of the charter, e.g.:

> Scholarly encyclopedias (Stanford Encyclopedia of Philosophy, Britannica), peer-reviewed scholarship (journal articles, university-press books), university and museum sites, and primary sources from 1890–1920. No study-guide or essay-mill sites (SparkNotes, Course Hero, etc.). Wikipedia is fine for dates and names, not for interpretation.

The AI's web search is filtered against this description (§3.5). Every source it uses is stored in the **course source library** (`sources`), which:
- is what the no-AI mode searches, so once a question has been asked with AI, later students get the same sources without AI;
- is visible on a **Sources** tab (title, link, who/what found it, which question it answered);
- lets the professor **add** a source by URL (the server fetches and extracts its text) or **remove** one. That's the whole curation UI.

**Demo safety:** the live web is the most fragile part of the demo. Seed the library with the sources the demo question will find, cache search results and fetched pages by URL in the DB, and run the demo question once before presenting. All the LLM calls (gate, filter, sentence picking and the explanation) are cached by their exact prompt too, so the rehearsed question replays the same verdict, query, sources and explanation word for word, in a few seconds, and costs nothing. One exception: a page that refused us once isn't cached, so if it opens on a later try the sources (and so the sentence pick and explanation) can change once. Editing the charter changes the prompt, so the gate runs again.

### 3.7 Class charter

One charter per course: Markdown rules text, a plain-language permissible-sources description (§3.6), and toggles. Everyone can read it at `/charter`; it's also linked in the reader header. The professor edits it; for the MVP, "co-creation" means **students can leave comments/proposals under it**, which the professor works into the text (stretch: see §8). The professor answers each proposal: **Add to rules** puts it in the rules text as the next numbered rule (a "Propose allowing" one from charter gaps goes into "Sources we trust" instead) and marks it added on **Save charter**; **Mark added** (worked in by hand) and **Decline** set its status right away, and **Reopen** undoes either. Students see the status on each proposal; the professor has no "Post proposal" box.

| Toggle | Default | Enforced how |
| --- | --- | --- |
| `ai_enabled` | on | Master switch: off means no LLM calls at all. |
| `ai_find_sources` | on | Off: no web search; plain FTS over the course library. |
| `ai_explanations` | on | Off: no AI explanation layer. |
| `ai_semantic_search` | on | Off: the Search page's **Meaning (AI)** mode returns a charter notice instead of results; search by words still works (§3.8). |
| `max_explanation_words` | 120 | Passed into the prompt and truncated server-side. |
| `show_past_cohorts` | on | Off: visibility rule drops past-cohort annotations. |
| `annotate_before_peers` | **on** | The engagement lock (§3.4): classmates' annotations stay locked until you've written a note or asked a question near them. Professor annotations are always visible. Off: everything visible is shown in full. |

**Enforcement is two-pass.** Toggles are hard limits, checked in code before any call. The charter **text** is enforced by the gate (pass 1), which decides per layer whether the request is allowed and names the rule; it's also included in the pass-2 prompts so the answer itself stays within the rules (e.g. context, not interpretation). Rules are numbered in the text so the gate can cite them.

**Charter gaps (§8 #12, built server side):** every search result the source filter skips as `not_covered` is remembered (`charter_gaps`: the URL, title and kind of source, never who asked). `GET /charter/gaps` lists the kinds seen in the last 7 days, most frequent first, with a few examples, for a section on the charter page (`ideas/01-charter-gaps.md`). Anyone can dismiss a kind; changing the permissible-sources text clears the list, since it was judged against the old text.

**Opting out (§8 #11, built server side):** an author can turn `share_with_future` off or on for one annotation (`PATCH /annotations/{id}`) or for everything they've written (`PUT /me/sharing`), which is how a past student opts out.

**Seed charter text (DEMO):**
> 1. We read first and ask each other second. AI comes last.
> 2. AI may point us to sources and give historical context. It may not interpret the text for us or suggest thesis statements.
> 3. Anything AI writes is public to the class and labelled as AI.
> 4. Annotations are shared with future classes unless you untick the box.

### 3.8 Repository search

A search page (`/search?q=`) over all visible annotations **and** the reading text, via FTS5. **Locked annotations (§3.4) never appear in results**; the search is not a way around the lock. Each result shows the snippet (FTS5 `snippet()`), the reading and page, and links to the reader at that page with the annotation open.

**Meaning (AI) mode** (`/search?q=…&mode=meaning`, a Words | Meaning (AI) switch under the box): finds **reading passages** that say something like the query in other words ("being seen through other people's eyes" → the double-consciousness passage), by embeddings (`semantic.py`, `bge-m3` on DO inference, same key as the LLM; prototyped in `spikes/1035-embeddings`). It searches the readings only, **never annotations**, so it can't get round the lock. Allowed only while the charter's `ai_enabled` and `ai_semantic_search` are on; otherwise the page shows which switch turned it off, with a link to the charter. Each reading is cut into passages of a few sentences (~400 characters) and embedded the first time a meaning search touches it (~1.5 s for the demo chapter), so seeding and uploads never need the network. Calls count against the AI budget (§9.1); the query's vector is cached in `web_cache`. Results below a similarity of 0.45 are dropped.

### 3.9 Mac hotkey: ask from wherever you're reading

A small macOS menu-bar app (`app/mac/`). The web reader stays as it is; this is a second way in, so you never have to leave the app you're reading in.

**An independent track.** The app is Swift only and lives entirely in `app/mac/`, so it never touches the Python or React code. Its only link to the rest is the HTTP contract in §6: `POST /api/ask` with `{quote, question}` and `X-User-Id`, returning the `/ask` shape plus `located`. Until the server route exists, the app reads a **stub response** (`app/mac/stub-ask-response.json`, copied from §6), and one URL constant at the top of `DialecticApp.swift` switches it to the real server. The route itself (step 4 below) is one small backend task, done by the backend owner after demo step 3 works (§8).

1. **Press the hotkey** (`⌥⇧D`, a constant at the top of the app). If text is selected in the front app, the app copies it (simulated ⌘C, then the clipboard is restored). If nothing is selected, a crosshair lets you drag a box round the passage (`screencapture -i`), as if taking a screenshot.
2. **Read it on the Mac.** A dragged box is turned into text with **macOS Vision** (`VNRecognizeTextRequest`) on the device. The image never leaves the Mac.
3. **Ask.** A small floating panel shows the captured text and a question box. On Enter it sends `POST /api/ask` (§6) with `{quote, question}` and the `X-User-Id` chosen in the app's menu (same seeded users as the web log-in).
4. **Locate.** The server matches `quote` against the course readings' text (`pages_fts`, then an exact substring check on that page) to find the **reading, page and section**. It computes the highlight `rects` from the PDF (pdfplumber, as the seed does), so the question shows as a normal highlight in the web reader. `TODO(edge)`: text that isn't from a course reading returns 404, "This passage isn't in a course reading."
5. **Answer and note it.** It runs the same three-layer `/ask` as §3.5. The panel follows the display rules in §3.5 (peers → sources → AI explanation, empty layers hidden, AI collapsed) and the engagement lock (§3.4), with a link that opens the web reader at that annotation. The question and any AI answer are saved as annotations like any other: public, labelled and open to replies.

**Same server, same person, same data.** The Mac app and the web app are two clients of one server and one database; neither keeps its own copy of anything. Every rule (engagement lock, charter gate, source filter, locate) runs on the server, so the Swift side only captures text and shows JSON.

**Reader window.** The Mac app also has a window (menu → Open Dialectic, ⌘O) that shows the web reader itself in a `WKWebView`, signed in as the Mac menu's user. There is no native reader: reader features are built once, on the web, and the Mac shows them. **Open in reader** in the Mac panels opens the annotation in this window; links to other sites open in the default browser. (Approved by Owen, Sat 06:45.)

- **Server URL:** one constant, `SERVER_URL`, at the top of `DialecticApp.swift`, set to the deployed site (§9) for the demo, `http://localhost:8000` while building.
- **Who you are:** the menu lists users from `GET /api/users` and saves the choice in `UserDefaults`; every request sends it as `X-User-Id`, exactly as the web does. The app registers the `dialectic` URL scheme, so the web's **Use on Mac** link (§3.1, `dialectic://login?user=<id>`) sets the same user.
- **Open in reader:** the panel's button opens `SERVER_URL + located.reader_url` in the default browser, at that annotation.
- **Shows up on the web:** the hotkey question and its answer are ordinary annotations (`via: "hotkey"`); the web reader's polling (§3.3) picks them up within a few seconds.

**Permissions:** the app needs **Accessibility** (to copy the selection) and **Screen Recording** (to capture a box) in System Settings. Grant both on the demo Mac beforehand.

### 3.10 Sections

**Could-have (§8 priority #10), built server side (Sat 04:20).** Readings uploaded before then have no sections: their `section_id` and `located.section` stay `null`, and "same section" means **same page** for them.

At upload, each reading is split into **sections** by its headings: the PDF's outline (bookmarks) if it has one, otherwise lines that look like headings (short, on their own line, Title Case or ALL CAPS, or numbered like `I.`). Each annotation stores the section it falls in. The peer layer boosts matches in the same section, and the hotkey shows "Ch. 1 › Of Our Spiritual Strivings"-style breadcrumbs.

**Fallback:** a reading with fewer than two headings is split **one section per page**, titled "Page N". The demo chapter is a single titled chapter, so in the demo this behaves like the old "same page" boost, and the hotkey shows "Page 2" as the section, unless we seed sub-headings.

**How a highlight finds its section** (`sections.py`): the last section starting on an earlier page, or on the same page if its heading comes before the quote in the page's text. A note's section is looked up when it's saved; a reply copies its parent's; a question gets its section when it's asked.

### 3.11 Scanned PDFs: OCR at upload

Professors upload what they have: phone photos of their own copy, library-scanner PDFs, old digitised editions. These often have **no text layer** or a **poor one** (the 1903 scan we seed with came with OCR that read "a vast veil" as `a,sgat,,yejl`). Everything that reads text (selecting, search, peer matching, the hotkey's locating, the AI prompt) depends on it, so **every upload is OCR'd** before it's used:

1. **Find the scanned pages:** a page whose images cover most of it (≥ 80% of the page area) is a scan; a page with ordinary text and no full-page image is born-digital and is left alone.
2. **Drop the scan pages' old text layer** (remove their text objects with `pikepdf`, keeping the images), because `ocrmypdf --redo-ocr` keeps the old layer and every letter comes out twice.
3. **OCR:** `ocrmypdf --skip-text --output-type pdf -l eng in.pdf out.pdf` (Tesseract). Pages that still have text (born-digital) are skipped; the original images are kept, so the file stays small (the seed chapter: 280 KB → 296 KB; forcing OCR from images instead made it 13 MB).
4. Then extract pages and sections as now, from the OCR'd file, which replaces the upload.

Built in `app/backend/ocr.py`. Earlier OCR text often sits inside a Form XObject (ocrmypdf's does), so step 2 strips text from those too. **DEMO:** uploading the seed PDF skips OCR (it's already OCR'd and the seeded quotes match that text exactly), so the live upload is ready in a second instead of ~50 s.

**It's slow, so it runs in the background:** about 4–6 s per page on the droplet's one CPU (the 12-page chapter took 49 s), and a long reading would hit Cloudflare's 100 s request limit. `POST /readings` saves the file and returns at once with `"status": "processing"`; a background thread does the OCR, then sets `ready` (or `failed`, with the error, shown on the course page; fail loudly). Until `ready`, the course page shows "Reading the scan…" and the reader can't be annotated. A `status` column on `readings` holds this.

**Matching text against OCR must be forgiving.** OCR text has stray punctuation, hyphenated line breaks, curly vs straight quotes and the odd misread letter ("horn" for "born"). Wherever a quote is matched to page text (`locate.quote_rects`, the hotkey's `POST /api/ask` locate, the seed), compare with whitespace, punctuation and quote style ignored and line-break hyphens joined. `TODO(edge)`: tolerating misread letters (fuzzy matching).

**Needs on the server:** `ocrmypdf` and `tesseract-ocr-eng` (apt; on the droplet, and in `deploy/setup-droplet.sh`). Without `ocrmypdf` installed (a teammate's laptop), uploads skip OCR and log a loud warning.

**Stretch:** photo uploads (JPG/PNG/HEIC, several at once) turned into one PDF (`img2pdf`), with `--rotate-pages --deskew` for phone photos.

**Seed data (the Du Bois seed, now `seed_dubois.py`; the current seed's scans are in §10):** `seed/souls-of-black-folk-ch1.pdf` is Chapter I of the **1903 first edition** (A. C. McClurg, Chicago), from Cornell University Library's scan on the Internet Archive (`cu31924024920492`, public domain), OCR'd as above. **Page 4** comes from another first-edition copy (Northwestern University Library, IA `duboissoulsofblackfolk`, leaf 26, Public Domain Mark), cropped and scaled to match: Cornell's image of that page lost the horizontal strokes of every letter (in their original files too), so nobody could read it, OCR included. The seed annotations quote it exactly as its OCR reads.

---

## 4. Stack and layout

- **Backend:** Python 3.12, managed with **uv** (`app/backend/pyproject.toml` + `uv.lock`), FastAPI, `sqlite3` from the standard library (no ORM), `pypdf` for PDF text, `httpx` for the LLM and search calls, `trafilatura` to extract a web page's main text. `uvicorn` to serve.
- **Web search:** **Kagi Search API** (preview, ~$12 per 1,000 queries, billed to a Kagi account; a day of building and the demo is a dollar or two). Chosen for the privacy story alongside DigitalOcean inference, and for results with little SEO spam, which helps keep study-guide sites out. All of it lives in one function, `search(query) -> [{title, url, snippet}]` in `search.py`, so swapping providers is a small change.
  - Call (**v1, tested 02:00 Sat with our key**): `POST https://kagi.com/api/v1/search` with JSON body `{"query": "<query>"}` and header `Authorization: Bearer $KAGI_API_KEY` (`Bot` also works). Results are in `data.search`, a list of `{url, title, snippet, time, props}` (about 30; take the first 15). Ignore `data.video`, `data.infobox` and `data.related_search`. Snippets contain HTML (`<strong>`, `&#39;`): strip tags and unescape before showing or sending them on.
  - **The legacy v0 API (`GET /api/v0/search`, `data[]` with `t == 0`) returns 401 with new keys.** Don't use it.
  - Fallback if Kagi misbehaves on the day: Brave Search API, same function signature.
- **Frontend:** React + Vite, `react-router`, `react-pdf`. Plain CSS. No state library.
- **PWA:** a `manifest.webmanifest` and icon, nothing more.
- **Mac hotkey app (§3.9):** one small **SwiftUI** menu-bar app, built with Xcode (or `swift build`). Uses only Apple frameworks: Vision (on-device text recognition), WebKit (`WKWebView`, the reader window), AppKit (hotkey, floating panel, pasteboard), `URLSession` for the API. The server URL and hotkey are constants at the top of `DialecticApp.swift`. No third-party packages.
- **LLM:** DigitalOcean serverless inference, which is OpenAI-compatible (`POST {DO_INFERENCE_URL}/chat/completions`). Model: **`anthropic-claude-sonnet-5.5`** (the exact ID from DO's `/v1/models` list), set as `DO_MODEL` in `.env`.
- **Bring your own AI (self-hosting).** Everything provider-specific is configuration or one function, so an institution can run Dialectic on its own infrastructure (pitch: `demo/business-model.md`):
  - **AI:** any OpenAI-compatible endpoint (vLLM or Ollama on campus GPUs, a university Azure OpenAI or Bedrock gateway, a campus AI service) by changing `DO_INFERENCE_URL`, `DO_INFERENCE_KEY` and `DO_MODEL`. Keep the AI call in `ai.py`'s one `chat()` function and keep provider-specific options (like reasoning effort) as constants at the top, so this stays true.
  - **Search:** `search()` in `search.py` is the only place Kagi appears; a library's catalogue search could replace it.
  - `TODO(edge)`: smaller models may follow the charter less reliably; a self-test running the gate cases against a new model is future work, not MVP.

```
app/
  backend/
    main.py          # FastAPI app, all routes (split only if it passes ~400 lines)
    db.py            # connect(), schema SQL, FTS helpers
    ai.py            # charter checks, gate, prompt text as constants, the one LLM call
    search.py        # web search + page fetch/extract, cached in the DB
    seed.py          # DEMO: the seminar (demo course); seed_large.py the lecture; seed_asks.py answered Asks
    seed/            # DEMO: the readings' PDFs, asks.json
    uploads/         # gitignored
    pyproject.toml   # uv project; uv.lock pins versions
  frontend/
    src/
      api.js         # fetch wrapper that adds X-User-Id
      pages/         # Login, Course, Reader, Charter, Search
      components/    # PdfPage, HighlightLayer, Margin, AskPanel, Composer
    public/manifest.webmanifest
  mac/
    Sources/Dialectic/*.swift  # menu bar, hotkeys, panels, overlay (capture + Vision), reader window (WKWebView)
    build.sh                   # builds Dialectic.app (CI: .github/workflows/mac-app.yml)
.env.example         # DO_INFERENCE_URL, DO_INFERENCE_KEY, DO_MODEL, KAGI_API_KEY
```

In production FastAPI serves the built frontend (`frontend/dist`) as static files, so it's **one process on one port**.

---

## 5. Data model (SQLite)

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('professor','student','ai')),
  cohort TEXT NOT NULL,           -- 'Fall 2026' (current), 'Spring 2026' (past)
  course_id INTEGER REFERENCES course(id)  -- the one course you're in; null for the AI
);

CREATE TABLE course (             -- one row per course (§3.2)
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  current_cohort TEXT NOT NULL
);

CREATE TABLE charter (            -- one row per course
  id INTEGER PRIMARY KEY,
  course_id INTEGER NOT NULL UNIQUE REFERENCES course(id),
  text_md TEXT NOT NULL,             -- numbered rules
  permissible_sources TEXT NOT NULL, -- plain-language description (§3.6)
  ai_enabled INTEGER NOT NULL DEFAULT 1,
  ai_find_sources INTEGER NOT NULL DEFAULT 1,
  ai_explanations INTEGER NOT NULL DEFAULT 1,
  max_explanation_words INTEGER NOT NULL DEFAULT 120,
  show_past_cohorts INTEGER NOT NULL DEFAULT 1,
  annotate_before_peers INTEGER NOT NULL DEFAULT 1,  -- the engagement lock (§3.4)
  ai_semantic_search INTEGER NOT NULL DEFAULT 1,     -- Search page's Meaning (AI) mode (§3.8)
  updated_at TEXT NOT NULL
);

CREATE TABLE charter_comments (
  id INTEGER PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES course(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'  -- 'open' | 'added' | 'declined': the professor's answer (§3.7)
);

CREATE TABLE readings (
  id INTEGER PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES course(id),
  title TEXT NOT NULL,
  pdf_path TEXT NOT NULL,
  uploaded_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready',  -- 'processing' | 'ready' | 'failed' (OCR, §3.11)
  error TEXT                             -- why it failed
);

CREATE TABLE reading_pages (      -- extracted text, for search and AI context
  reading_id INTEGER NOT NULL REFERENCES readings(id),
  page INTEGER NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (reading_id, page)
);

CREATE TABLE reading_sections (   -- headings found at upload (§3.10)
  id INTEGER PRIMARY KEY,
  reading_id INTEGER NOT NULL REFERENCES readings(id),
  title TEXT NOT NULL,            -- heading text, or 'Page N' in the fallback
  start_page INTEGER NOT NULL,
  ord INTEGER NOT NULL            -- order within the reading
);

CREATE TABLE annotations (
  id INTEGER PRIMARY KEY,
  reading_id INTEGER NOT NULL REFERENCES readings(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  parent_id INTEGER REFERENCES annotations(id),
  kind TEXT NOT NULL CHECK (kind IN ('note','question','ai_answer')),
  page INTEGER NOT NULL,
  section_id INTEGER REFERENCES reading_sections(id), -- from page + quote; replies copy the parent's
  via TEXT NOT NULL DEFAULT 'web' CHECK (via IN ('web','hotkey')),
  quote TEXT,                     -- null for replies
  rects_json TEXT,                -- [{x,y,w,h}] as page fractions; null for replies
  body TEXT NOT NULL,
  cited_source_ids TEXT,          -- JSON array, ai_answer only
  share_with_future INTEGER NOT NULL DEFAULT 1,
  answer_json TEXT,               -- questions only: the finished /ask response (reopening the answer card)
  created_at TEXT NOT NULL
);

CREATE TABLE sources (             -- the course source library (one per course)
  id INTEGER PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES course(id),
  title TEXT NOT NULL,
  url TEXT NOT NULL,               -- UNIQUE (course_id, url)
  excerpt TEXT NOT NULL,           -- extracted main text (trimmed to ~20k chars)
  found_by TEXT NOT NULL CHECK (found_by IN ('ai','professor')),
  first_question_id INTEGER REFERENCES annotations(id),
  created_at TEXT NOT NULL
);

CREATE TABLE charter_gaps (        -- results skipped as not_covered by the charter (§3.7); no user or question
  id INTEGER PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES course(id),
  kind TEXT NOT NULL,              -- the filter's label, e.g. 'journal articles'
  url TEXT NOT NULL,               -- UNIQUE (course_id, url)
  title TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  dismissed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE spend (               -- every paid call not served from the cache (§9.1); kept by seed.py --reset
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  service TEXT NOT NULL CHECK (service IN ('ai','search')),
  units INTEGER NOT NULL,          -- tokens (in + out) for 'ai', searches for 'search'
  usd REAL NOT NULL,
  device_id TEXT NOT NULL,         -- X-Device-Id, or 'unknown'
  question_id INTEGER              -- the Ask it was for (the device limit counts distinct Asks)
);

CREATE TABLE web_cache (           -- DEMO safety: replay search results and fetched pages
  key TEXT PRIMARY KEY,            -- 'search:<query>' or 'page:<url>'
  value TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Full-text search. External-content tables + triggers keep them in sync.
CREATE VIRTUAL TABLE annotations_fts USING fts5(quote, body, content='annotations', content_rowid='id');
CREATE VIRTUAL TABLE sources_fts     USING fts5(title, excerpt, content='sources', content_rowid='id');
CREATE VIRTUAL TABLE pages_fts       USING fts5(text, reading_id UNINDEXED, page UNINDEXED);
```

Insert/delete triggers on `annotations` and `sources` keep their FTS tables current. `pages_fts` is filled once at upload.

```sql
CREATE TABLE reading_passages (   -- meaning search (§3.8): filled the first time a meaning search touches a reading
  id INTEGER PRIMARY KEY, reading_id INTEGER NOT NULL REFERENCES readings(id),
  page INTEGER NOT NULL, text TEXT NOT NULL,
  embedding TEXT NOT NULL         -- JSON list of floats (bge-m3, 1024)
);
```

**FTS query building:** lowercase `quote + question`, drop stopwords, quote each remaining word, join with `OR`, rank with `bm25()`. Good enough for the demo. `TODO(edge)`: phrase matching, stemming (`tokenize='porter'` is a cheap upgrade).

---

## 6. API

All routes are under `/api`; all except `/users` and `/spend` need `X-User-Id`. **Everything is scoped to the user's course** (§3.2): `/course`, `/charter*`, `/sources`, `/search` and the hotkey's locate only see that course, and another course's reading, PDF or question is a 404. The Ask routes also read an optional `X-Device-Id` (§9.1). Professor-only routes return 403 for students. **Professor password** (`explainers/security.md`): when the server has `PROFESSOR_PASSWORD` set, acting as a professor on any route also needs `X-Professor-Token` (from `POST /login`), or it's a 401; unset, nothing changes. Request bodies over 1 MB (50 MB for `POST /readings`) are a 413, a body without `Content-Length` a 411, and a note, question, quote or comment over 10,000 characters a 422.

| Method | Path | Who | Purpose |
| --- | --- | --- | --- |
| GET | `/users` | anyone | Log-in-as list, ordered by course: each user also has `course_id`, `course_title`, `current_cohort`, and `needs_password` (a professor, when the server has `PROFESSOR_PASSWORD`) |
| POST | `/login` | anyone | `{user_id, password}` → `{user, professor_token}`. Students need no password and get `null`; a professor with `needs_password` gets a token to send as `X-Professor-Token` (7 days), or a 403 for a wrong password |
| GET | `/course` | all | Course, readings list (with what each reading card shows), current user, `uploads_enabled` |
| POST | `/readings` | prof | Multipart upload: title + PDF. Returns at once with `"status": "processing"`; OCR (§3.11), then page extraction with `pypdf`, run in the background. 403 when the copy has `UPLOADS_ENABLED=0` |
| GET | `/readings/{id}` | all | Metadata + page count + `status`, `error` |
| GET | `/readings/{id}/pdf` | all | The PDF file |
| GET | `/readings/{id}/annotations` | all | Visible annotations (with replies), all pages. Locked ones (§3.4) as `{id, page, rects, locked: true, group, group_notes}` only |
| GET | `/questions/{id}/answer` | all | A question's saved `/ask` response, to reopen its answer card. 404 if you can't see the question in full, or it was asked before answers were saved |
| POST | `/readings/{id}/annotations` | all | Create note or reply |
| POST | `/readings/{id}/box-text` | all | `{"page", "rect"}` → `{"text"}`: the text inside a box drawn with Select area (§3.3); `""` if none |
| DELETE | `/annotations/{id}` | author | Delete own annotation (and its replies) |
| PATCH | `/annotations/{id}` | author | `{share_with_future}`: opt one annotation in or out; returns it |
| PUT | `/me/sharing` | all | `{share_with_future}` for everything you've written (past-student opt-out); returns `{updated, share_with_future}` |
| POST | `/readings/{id}/ask` | all | The three-layer answer (§3.5) |
| POST | `/readings/{id}/ask/stream` | all | The same, step by step as newline-delimited JSON (staged panel, below) |
| POST | `/ask` | all | Hotkey ask (§3.9): `{quote, question}` plus an optional `source_app` (the app the text came from, e.g. `"Notability"`); the server locates the reading, page, section and rects, then runs the same three layers. 404 if the quote isn't in a course reading |
| POST | `/note` | all | Hotkey note (⌥⇧N, §3.9): `{quote, body, share_with_future}` plus an optional `source_app`; locates like `/ask`, saves a `note` with `via: "hotkey"`, returns the annotation plus `reader_url`. 404 if the quote isn't in a course reading |
| POST | `/ask/stream` | all | Hotkey ask, step by step (still a plain 404 if the quote isn't found) |
| POST | `/locate` | all | Mac overlay (§3.9): `{text}`, a few lines read off the screen, one per line. Each line votes for the course page it's on; returns `{located: {reading_id, reading_title, page, section: null, reader_url}, lines: [{text, rect}]}` with every line on that page (two-column pages split per column) as page fractions, for fitting to the screen. 404 if no line is in a course reading |
| GET | `/charter` | all | Text, toggles, comments (each with its `status`) |
| PUT | `/charter` | prof | Update text and/or toggles |
| POST | `/charter/comments` | all | Student proposal/comment |
| PATCH | `/charter/comments/{id}` | prof | `{status}`: `open`, `added` or `declined`; returns the charter |
| GET | `/charter/gaps` | all | Kinds of source skipped as not covered by the charter (§3.7) |
| POST | `/charter/gaps/dismiss` | all | `{kind}`: hide that kind from the list; returns the list |
| GET | `/sources` | all | The course source library |
| POST · DELETE | `/sources`, `/sources/{id}` | prof | Add by URL (fetched + extracted) / remove. Only public http(s) pages on ports 80/443; anything else is a 400 (`explainers/security.md`) |
| GET | `/search?q=` | all | FTS over visible annotations + reading text |
| GET | `/search?q=&mode=meaning` | all | Reading passages close in meaning (embeddings), if the charter allows it |
| GET | `/spend` | anyone | Spending against this copy's budgets (§9.1), no `X-User-Id` needed: `{"ai": {"usd", "calls", "budget_usd"}, "search": {...}, "ai_off", "device_asks_per_hour"}` |

`/ask` response:

```json
{
  "question_id": 41,
  "peer": [{"annotation_id": 7, "author": "Ana", "cohort": "Fall 2026", "page": 3, "quote": "...", "body": "..."}],
  "sources": [{"source_id": 2, "title": "...", "url": "...#:~:text=...", "quote": "..."}],
  "ai_answer": {"annotation_id": 42, "body": "... [1] ..."},
  "skipped_sources": [
    {"url": "https://www.sparknotes.com/...", "title": "...", "why": "not_permitted", "reason": "Your charter rules out study-guide sites"},
    {"url": "https://medium.com/...", "title": "...", "why": "not_covered", "reason": "Your charter doesn't mention blog posts"},
    {"url": "https://www.theatlantic.com/...", "title": "...", "why": "unreachable", "reason": "Couldn't open this page"}
  ],
  "blocked": [
    {"layer": "ai_answer", "by": "toggle", "label": "AI may write explanations — off"},
    {"layer": "sources_ai", "by": "rule", "label": "Rule 2: AI may not interpret the text for us", "reason": "The question asks what the passage means."},
    {"layer": "ai_answer", "by": "no_sources", "label": "No sources to base an explanation on yet"}
  ]
}
```

`ai_answer` is `null` when blocked or when no sources matched (no ungrounded answers).

`blocked[].by` is `toggle` (a charter toggle is off), `rule` (the gate denied it; `reason` explains why), `no_sources` (allowed, but nothing to ground an explanation in), `limit` (a spending limit, §9.1: `label` is the whole notice, no `reason`, no charter link) or `error` (the step failed; `reason` is the real error message, so show it).

`skipped_sources[].why` is `not_permitted` (the charter rules it out: show it, but **don't link it**), `not_covered` (the charter doesn't mention this kind of source: show it, don't link it; the class can amend the charter, see `ideas/01-charter-gaps.md`), `unreachable` (permitted, but we couldn't open or read it) or `no_answer` (permitted and read, but nothing in it answered the question). **Link the last two** so the student can read them themselves.

`POST /ask` (hotkey) returns the same shape plus `"located": {"reading_id": 1, "reading_title": "...", "page": 3, "section": "Of Our Spiritual Strivings", "reader_url": "/readings/1?page=3&annotation=41"}`. `reader_url` is relative: the Mac app prefixes its `SERVER_URL`. Annotations gain `"section"` (title or `null`), `"via"` (`"web"` | `"hotkey"`) and `"source_app"` (the app a hotkey question or note came from, e.g. `"Notability"`, or `null`).

Annotation shape (`GET /readings/{id}/annotations` returns a list of these, newest first; `POST` returns one):

```json
{"id": 4, "reading_id": 1, "parent_id": null, "kind": "note", "page": 2,
 "quote": "...", "rects": [{"x": 0.12, "y": 0.66, "w": 0.43, "h": 0.015}], "body": "...",
 "cited_source_ids": null, "share_with_future": true, "created_at": "2026-11-14T01:25:52",
 "author": {"id": 4, "name": "Sam", "role": "student", "cohort": "Spring 2026"},
 "badge": "Spring 2026", "locked": false,
 "answer_summary": null,
 "replies": [ /* same shape, oldest first; replies to replies are flattened here */ ]}
```

`answer_summary` is set on questions with a saved answer, for the margin card: `{"peer": 3, "peer_authors": 2, "sources": 1, "ai_answer": true}` ("Answered: 2 classmates, 1 source, AI context"); otherwise `null`.

A locked annotation is `{"id": 4, "page": 2, "rects": [...], "locked": true, "group": 4, "group_notes": 2}`. Locked annotations near each other (same page, within `NEAR_DISTANCE`) share a `group` (the smallest id in it): draw **one lock card per group**, "`group_notes` notes near here" (§3.3).

**Streamed ask** (`/readings/{id}/ask/stream`, `/ask/stream`): `Content-Type: application/x-ndjson`, one JSON object per line, read with `fetch` and a stream reader (not `EventSource`, which can't POST). Each line has an `event`:

```json
{"event": "question", "question_id": 41, "section": "Page 2"}
{"event": "located", "located": {...}}                      // hotkey only, same as below
{"event": "status", "stage": "peer", "label": "Looking for classmates' answers…"}
{"event": "peer", "peer": [...]}
{"event": "status", "stage": "charter", "label": "Checking the charter…"}
{"event": "blocked", "blocked": [...]}                      // 0 or more times; add to what you have
{"event": "status", "stage": "sources", "label": "Finding sources your charter permits…"}
{"event": "sources", "sources": [...], "skipped_sources": [...]}
{"event": "status", "stage": "ai_answer", "label": "Writing a short explanation…"}
{"event": "ai_answer", "ai_answer": {...} | null}
{"event": "done", "result": { /* exactly the /ask response */ }}
{"event": "error", "detail": "RuntimeError: ..."}           // instead of what's left, if the request crashed
```

`status` lines for steps that don't run (e.g. the charter check when `ai_enabled` is off) are skipped. Show the latest `status` label as the panel's progress line; `done` ends it (and its `result` can replace everything shown so far).

Other response shapes:

- `GET /charter` (and `PUT`, `POST /charter/comments`, which return the updated charter): every `charter` column (toggles as booleans) plus `"comments": [{"id", "body", "created_at", "author", "author_role"}]`. `PUT` takes any subset of the columns.
- `GET /course`: `{"course": {"id", "title", "current_cohort"}, "readings": [{"id", "title", "filename", "page_count", "note_count", "question_count", "created_at", "status", "error"}], "user": {...}}`. The counts are top-level notes and questions you can see (locked ones included); they're for the reading card ("7 pages · 2 notes · 0 questions"). While a reading's `status` isn't `ready` (§3.11), its notes and asks return **409** with the reason, and it has no pages yet.
- `GET /sources` (and `POST`/`DELETE`, which return the updated list): `[{"id", "title", "url", "found_by", "created_at", "first_question_id", "first_question", "first_question_author"}]`, newest first. `first_question` is the text of the question it was found for and `first_question_author` the asker's name ("found for Ben's question"); both `null` for sources added by hand.
- `GET /charter/gaps` (and `POST /charter/gaps/dismiss`): `[{"kind": "journal articles", "count": 12, "examples": [{"title", "url"}]}]`, most frequent first, kinds lowercased, up to 3 examples each.
- `GET /search?q=`: `{"annotations": [{"annotation_id", "reading_id", "reading_title", "page", "kind", "via", "author_id", "author", "cohort", "badge", "snippet"}], "pages": [{"reading_id", "reading_title", "page", "snippet"}]}`. Snippets mark hits as `[[word]]`: render as text, never as HTML (annotation bodies are user input).
- `GET /search?q=&mode=meaning`: `{"passages": [{"reading_id", "reading_title", "page", "text", "score"}], "blocked": null | {"by": "toggle" | "limit", "label"}}`. Best first, at most 8. `blocked` names the charter switch that's off (`"AI may search readings by meaning — off"` or `"AI enabled — off"`) or the spending-limit notice.
- **Errors:** `{"detail": "..."}` with 401 (unknown user), 403 (not allowed), 404, 422 (bad input) or 500. A 500's `detail` is the real error (e.g. a missing API key), so show it.

`badge` is `"Professor"`, `"AI"`, a past cohort's name, or `null` for current classmates. Full annotations carry `"locked": false`; locked ones (§3.4) are only `{"id", "page", "rects", "locked": true}` plus their group (above), with no replies. `POST /readings/{id}/annotations` takes `{"page", "quote", "rects", "body", "share_with_future"}` for a note (`quote` may be empty for a box selection, §3.3; the ask routes need a non-empty one), or `{"parent_id", "body"}` for a reply (page comes from the parent). `rects` are page fractions, top-left origin.

---

## 7. AI calls (`ai.py`)

One function, `chat(system, user) -> str`, using `httpx` against the DO endpoint, `temperature=0.2`, with a 30 s timeout and no retries (fail loudly), except one: an **empty reply** (seen about once in 20 structured calls) is asked again once (`EMPTY_REPLY_RETRIES`). The prompts are constants at the top of `ai.py`. Calls that return JSON ask for JSON only and are parsed with `json.loads`; a parse failure is a loud error. Their parsed replies are cached in `web_cache` by the exact prompt (§3.6).

**Speed (measured 03:00 Sat):** by default the model reasons in ~700–1,300 hidden tokens before answering. The sentence-picking call runs with `reasoning_effort: "low"`, and it and the filter use **structured output** (`response_format` with a JSON schema, which DO supports), so sentence picking takes 2–3 s. The filter runs at full effort (~8 s): at low effort (~4 s) it dropped allowed sources 1 run in 3. Each call's effort is a constant at the top of `ai.py`. The schema matters: at low effort without it the model sometimes "thinks out loud" after its JSON and the parse fails (about 1 call in 15). The gate and the explanation keep the default effort, for judgement and writing quality. A first-time question takes about 22–25 s, mostly the gate and the explanation; a rehearsed one about 7 s.

**What gets sent (privacy rule, enforced by building the payload in one place):** charter text, permissible-sources description, the highlighted `quote`, the `question`, the reading title, and source titles/snippets/text. **Never** user names, IDs, cohorts or other students' annotations. Kagi gets only the gate's `search_query`. From the hotkey, the server only ever receives recognised text (Vision runs on the Mac), never a screenshot.

A full AI answer is four calls: gate → filter results → pick sentences → explain. That's slow-ish (expect 10–20 s); the Ask panel shows the peer layer immediately and the AI layers with a "Checking the charter… / Finding sources… / Writing…" status as they arrive (stretch: if this is fiddly, one spinner and one response is fine).

- **`GATE_PROMPT`** (pass 1): "You enforce a class's AI charter. Rules: {charter}. A student highlighted: {quote}. They ask: {question}. For each AI action — `find_sources` (search the web for relevant sources) and `explain` (write a short contextual explanation) — decide whether the charter allows it for this request." Returns `{"find_sources": {"allowed": true, "rule": null, "reason": "..."}, "explain": {"allowed": false, "context_only": false, "rule": "2", "reason": "..."}, "search_query": "..."}`. With `GATE_CONTEXT_ONLY` on, the gate may answer `allowed: true, context_only: true` for an interpretive question that has background worth giving (§3). When unsure, the gate should **deny** (friction is the point).
- **`FILTER_SOURCES_PROMPT`**: given the permissible-sources description and 8 numbered search results (title, URL, snippet), return `{"keep": [3, 1], "skipped": [{"n": 5, "reason": "..."}]}`, keep at most 3.
- **`PICK_SENTENCE_PROMPT`**: given the question and numbered source texts, return `[{"n": 2, "sentence": "<exact sentence copied from source 2>"}]`. The server checks that each `sentence` really occurs in that source's text and drops it if not.
- **`EXPLAIN_PROMPT`** (pass 2): "You are a teaching assistant bound by this class charter: {charter}. Using only the numbered sources, give historical/cultural context for the passage in at most {n} words. Cite as [1]. Don't interpret the passage for the student, and don't end with a question or suggest what they should ask or think next."

**Check order:** `ai_enabled` → layer toggles (code) → gate (LLM) → pass-2 calls for allowed layers. A blocked layer adds a `blocked` entry; it never raises an error.

---

## 8. Build order (Saturday)

### Priorities

When time runs short, **cut from the bottom up.** A slipped checkpoint is never a reason to cut something above an item that hasn't been cut yet.

**Must** (no demo without these)
1. **Web reader:** PDF, highlights, margin, notes and replies, **and the engagement lock** with its "N notes near here" placeholder (demo steps 1–2), or the paragraph fallback from S1. **Owner: not decided yet.** Nothing in the demo works without it.
2. **Ask, no AI:** peer and library layers plus the Ask panel.
3. **Charter gate + AI explanation** posted as an annotation (demo step 3).
4. **Charter page:** editing rules and toggles, and blocked notices in the Ask panel (demo step 4).
5. **Deployed** on the new droplet from `stable` as two copies (demo and sandbox, §9), with the spending limits (§9.1), and the demo rehearsed.

**Should**

6. **Live Kagi search** filtered by permissible sources, with sentence links. Fallback: `seed.py --with-sources` + LLM sentence picking.
7. **Mac hotkey app** (independent track, §3.9), copying the selection only, plus the server's `POST /api/ask` route.
8. **Staged Ask panel** ("Checking the charter… / Finding sources…"). Fallback: one spinner.

   **Also Should: OCR at upload** (§3.11), so professors can upload real scans. Not on the demo path: the seed PDF is already OCR'd. With it, **Select area** (box selection, §3.3) for pages OCR can't read and for pictures.

**Could**

9. Hotkey screenshot box + on-device Vision text recognition.
10. Sections by heading (§3.10). Fallback: same page.
11. Search page → charter comments → past-student opt-out UI.
12. Charter gaps on the charter page: what the source filter skipped as "not mentioned in your charter", with one-click amendments (`ideas/01-charter-gaps.md`).

### Timeline

Checkpoints are the times things must work by. If one slips by more than 45 minutes, cut from the bottom of the list above, never the demo path.

**At every checkpoint, promote to `stable`** (see `CLAUDE.md`, *Branches*): click through the demo steps that work so far, then `git push origin main:stable` and tag it `good-HHMM`. Also promote whenever something you'd hate to lose starts working.

| By | What | Notes |
| --- | --- | --- |
| 01:30 | **S1 spike:** `react-pdf` + text-layer selection → page-fraction rects → redraw boxes | In `spikes/`, timeboxed to 1 h. **Fallback if it fights us:** render each page's extracted text as HTML paragraphs and annotate whole paragraphs (store `page` + paragraph index). |
| 02:30 | Backend skeleton: schema, seed, `/users`, `/course`, `/readings` upload + PDF serve | |
| 04:00 | Reader: PDF + highlights + margin + create/delete note + replies | **Demo steps 1–2 work.** |
| 06:00 | `/ask` peer + library layers (no AI) + Ask panel UI | Get the Kagi API key in parallel. |
| 08:00 | `ai.py` + `search.py`: gate, web search, filter, fetch, pick sentence, explanation as annotation, web cache | **Demo step 3 works.** If web search fights us, fall back to seeded library + LLM sentence picking, and keep the gate. |
| 09:00 | Charter page: view, prof edit (rules, permissible sources, toggles); blocked notices in the Ask panel | **Demo step 4 works.** |
| 09:00 | **Mac hotkey app (independent track, `app/mac/`):** hotkey → copy selection → floating panel → show the `/ask` response | Owner: josoup. Builds against the stub response, so it needs nothing from anyone else until the route exists. Start with a 1 h spike (hotkey + selection copy). Screenshot + Vision only once everything else works (#9). **Doesn't move other checkpoints.** |
| 09:30 | **`POST /api/ask` (hotkey route):** locate the quote → reading, page, rects; reuse the three layers | Backend owner, after demo step 3 works. The Mac app swaps its stub for the real URL. |
| 10:00 | **Spending limits + WAL** (§9.1, §9): backend: `X-Device-Id` limit, `spend` table + budgets, `BudgetExceeded` → blocked layers, `AI_OFF`, `GET /api/spend`, WAL in `db.connect()`. Frontend and Mac app: send `X-Device-Id` | Must be done before the sandbox URL is shared with anyone. |
| 10:30 | Deploy the demo and sandbox copies to the new droplet; spending limits on; run the full demo there | Deploy early so the last hours aren't spent on it. |
| 12:00 | Search page; charter comments | Stretch #1 |
| 12:00+ | Polish only: copy, empty states, seed data quality, demo script in `demo/` | Per CLAUDE.md: no new features after noon. |
| 15:00 | Full demo path rehearsed on the deployed URL | |

Stretch items are #9–12 above, in that order.

**Parallel split:**
- **Frontend web reader: owner not decided yet.** This is priority #1; give it a person before anything below #5.
- **Backend:** schema → `/ask` → `ai.py` → the hotkey route.
- **Seed data, charter page and demo script.**
- **Mac hotkey app (josoup):** independent; needs only §6 and its stub.

Agree the API shapes in §6 first; the frontend can stub `/ask` with the JSON above, as the Mac app does.

---

## 9. Deployment (a new droplet, two copies)

**Live since 05:45 Sat.** How-to (deploy, roll back, reset, spending, logs, Cloudflare): `DEPLOY.md`; scripts and config in `deploy/`. Demo copy: `dialectic.yaggy.dev`; sandbox: `dialectic.space`. Both are proxied by Cloudflare, so the Caddy setup below differs (see `DEPLOY.md`).

**A new small droplet just for the hackathon** (2 GB, Ubuntu, in the existing DigitalOcean account), not the existing one: it keeps Owen's other API completely isolated, and DigitalOcean bills only while it exists (a weekend is about a dollar). Destroy it after the debrief. If we do end up on the existing droplet, give each Dialectic service `MemoryMax=500M` and `CPUQuota=50%` in its systemd unit so a spike can't take the other API down.

**Two copies of the app** on the droplet, each its own checkout of `stable` with its own database, uploads and budget:

| Copy | URL | Who gets it | Limits |
| --- | --- | --- | --- |
| **demo** | an unlisted host, e.g. `judges.dialectic.space` | The judges (in the submission) and us on stage | No per-device limit; its own budget |
| **sandbox** | `dialectic.space` | The ~50 participants, to play with | Per-device limit and a smaller budget (§9.1) |

Anyone can log in as anyone (including the professor), so participants *will* change the charter and annotate the demo passage. Keeping them on the sandbox means the judges' copy stays exactly as we left it.

**Changed 13:50 Sat:** judges and the audience see the same one-slide presentation, so there is **one public link, `yag.gy/dia` (302) → the sandbox**, for everyone. The clean demo is the video; the demo copy is a spare we keep reset and repoint the link to if the sandbox breaks. Details: `DEPLOY.md`, *The public link*.

**Steps** (once per copy, in `/srv/dialectic-demo` and `/srv/dialectic-sandbox`):

1. **Deploy only from `stable`** (`git clone -b stable …`, then `git pull` to update), so the live URLs always show something that works. To roll back, check out the previous `good-…` tag; never rewrite `stable`. Then `cd app/backend && uv sync`.
2. `cd app/frontend && npm ci && npm run build`.
3. `.env` in each checkout (never in git): the shared keys plus that copy's budget and limits (§9.1).
4. A **systemd** unit per copy (`Restart=always`) running `uv run --env-file ../../.env uvicorn main:app --host 127.0.0.1 --port <port>` from `app/backend`: demo on 8000, sandbox on 8001.
5. **Domain:** `dialectic.space` or a subdomain of an existing domain; `A` records for both hosts to the new droplet's IP. Do it **early** (by 08:00) so DNS can propagate.
6. **Caddy** for HTTPS (certificates are automatic):
   ```
   judges.dialectic.space {
     reverse_proxy 127.0.0.1:8000
   }
   dialectic.space {
     reverse_proxy 127.0.0.1:8001
   }
   ```
7. **Before judging:** `uv run seed.py --reset` on the demo copy (it keeps `web_cache` and the spend table), run each demo question once so its answer is cached, **read each answer once** (that cached answer is exactly what plays on stage; if one is weak, clear its `llm:` rows in `web_cache` and ask again; `TODO.md`), and `cp` the database as a backup.
8. **Laptop backup:** run `stable` locally with a copy of the demo database, in case the venue wifi or the droplet fails during our slot.
9. **Submit `stable`** (or the last `good-…` tag before 16:00) and the demo copy's URL. GitHub shows `main` by default, so either link the submission to `stable` or fast-forward `main` to it at the end.

**Before going public, the backend needs** `PRAGMA journal_mode=WAL` and `PRAGMA busy_timeout=5000` in `db.connect()`. Without them, SQLite returns "database is locked" when several people write at once.

**Capacity:** one FastAPI process is ~150–300 MB. Routes are plain `def` functions, so FastAPI runs each in a thread pool (40 by default), and a slow Ask (10–20 s, almost all waiting on the AI and Kagi) doesn't block other requests. 50 users is well within a 2 GB droplet; the real limits are cost (§9.1) and people changing shared data (the two copies).

### 9.1 Spending limits

Two outside services cost money:
- **DigitalOcean inference:** prepaid credit with no auto-reload (**~$32 left at 04:00 Sat**). When it runs out, AI calls fail.
- **Kagi:** $0.012 per search, invoiced monthly, with a $10 limit set in Kagi.

Cached answers (`web_cache`) cost nothing. Two layers of protection:

**1. Per-device limit (fairness, sandbox only).** There are no accounts, so a "device" is a random ID: the web app creates one on first load (`crypto.randomUUID()`, kept in `localStorage`), the Mac app keeps one in `UserDefaults`, and both send it as an **`X-Device-Id`** header on every request. A request without one counts as a single shared "unknown" device.
- Each device gets `DEVICE_ASKS_PER_HOUR` (sandbox: 10; `0` = no limit, used on the demo copy) Asks that spend money. An Ask that replays entirely from the cache doesn't count.
- Over the limit, the Ask still runs the peer and library layers. The AI layers come back as `blocked` entries with the notice *"You've used this device's AI questions for the hour. Classmates' answers and the course library still work."*
- **Not by IP address:** at the venue everyone shares the wifi's public IP, so an IP limit would block the whole room at once.
- Clearing browser storage gets round it. That's fine: it's for fairness, and layer 2 is the real cap.

**2. Global budget (true excess, both copies).** Every paid call is recorded **at the point of spending**: in `ai.chat_once()` (DigitalOcean) and `search.search()` (Kagi), only when the call isn't served from the cache. A `spend` table holds `(at, service, units, usd, device_id, question_id)`; `question_id` is the Ask the call was for, so the per-device limit counts distinct paid Asks. The checks and the notices live in `spend.py`; every Ask passes one `spend.Meter` down to each paid call. Missing settings in `.env` are an error (shown as an `error` notice), not a silent "no limit".
- **DigitalOcean cost** = the response's `usage` tokens × `LLM_USD_PER_MTOK_IN` / `LLM_USD_PER_MTOK_OUT` (constants at the top of `ai.py`: Claude Sonnet 5.5 on DigitalOcean is **$2.00 per million input tokens** and **$10.00 per million output tokens**).
- **Kagi cost** = `KAGI_USD_PER_SEARCH = 0.012` per search.
- **Before each paid call,** if that service's total has reached its budget (`AI_BUDGET_USD`, `SEARCH_BUDGET_USD` in `.env`), raise `BudgetExceeded`. The Ask turns this into blocked AI layers with *"This copy of Dialectic has used up its AI budget. Classmates' answers and the course library still work."* Nothing crashes, and the demo's peer layer keeps working.
- **Budgets:** demo copy AI $10 and search $3; sandbox AI $12 and search $4. That's $22 of the ~$32 DigitalOcean credit (leaving ~$10 for development and rehearsal) and $7 of Kagi's $10 limit.
- The `spend` table **survives `seed.py --reset`** (like `web_cache`), so reseeding never resets a budget.
- `GET /api/spend` returns each service's total against its budget, for a quick check from a phone. It's read-only and shows nothing per-device.

**How limits appear in an Ask response:** as ordinary `blocked` entries with **`"by": "limit"`**, `layer` set as usual, and `label` holding the full notice text (device limit, budget used up, or *"AI is switched off on this copy of Dialectic."* for `AI_OFF`). No `reason`. The UI shows `label` as-is with no link to the charter, since the charter didn't cause it.

**Emergency stop:** `AI_OFF=1` in a copy's `.env`, then restart its service. It blocks all paid calls server-wide. The charter's `ai_enabled` switch isn't enough, because anyone can log in as the professor and turn it back on.

## 10. Seed data (DEMO)

Two philosophy courses reading Rousseau's *Social Contract* (`app/backend/seed.py`, `seed_large.py`; replaced the Du Bois seed Sat 11:55, which is kept runnable as `seed_dubois.py` / `seed_dubois_large.py`). Several readings each, three weeks of a syllabus, so margins range from empty to crowded:

| Course | Reading | Kind of PDF | Notes |
| --- | --- | --- | --- |
| PHIL 247 seminar (course 1, the demo; Prof. Rivera, 8 current + 2 past) | Week 1 · Hobbes, *Leviathan* ch. 13–14 | born-digital (Bennett, earlymoderntexts.com) | 21 + 7 replies, mostly Ana |
| | Week 2 · Rousseau, *The Social Contract* | born-digital (Bennett) | 6, sparse; **added by the live upload** (step 1) or `--with-reading` |
| | Week 3 · Wollstonecraft, *Vindication* ch. V (on Rousseau) | clean scan of the 1891 edition (U of Toronto, IA `vindicationofrig00woll`) | none |
| PHIL 101 lecture (course 2; Prof. Okafor, ~65 current + 8 past) | Week 1 · Locke, *Second Treatise* ch. I–III | rough scan (Digital Library of India, IA `in.ernet.dli.2015.227917`) | 39 + 12 replies |
| | Week 2 · Rousseau, *The Social Contract* | born-digital (Bennett) | 77 + 33 replies, densest on p. 12 (a lock card of 10) |
| | Week 3 · Mill, *On Liberty* ch. I | very rough 1859 xerox with a past reader's underlining (U of Toronto, IA `onlibertyxero00milluoft`) | 3; the professor's note points at the garbled harm principle on pp. 17–18 (Select area) |

- **Scans** were cut to the chapters and run through our own OCR (`ocr.ocr_in_place`, ocrmypdf in a container), so their text is exactly what an upload produces. Quotes on them are as the OCR reads them, slips included (Locke p. 11: "Tue natural liberty … an superior power").
- **Cast:** in each course one student has written nothing (Ben on Rousseau in the seminar; **Maya** everywhere in the lecture), one writes a lot (Ana; **Jordan**), and last year's cohort (Sam, Theo; 8 in the lecture) shows with a "Spring 2026" badge. Professors reply in some threads.
- **Charters:** the rules in §3.7 plus the permissible-sources text in §3.6, per course; each ends with a rule that came from a student proposal. **Proposals** in every state: open, added, declined (3 in the seminar, 5 in the lecture).
- **Answered Asks:** six real Asks (2 seminar on Hobbes, 4 lecture on Locke and Rousseau), run once with `seed_asks.py --generate` and replayed offline from `seed/asks.json` on every reset: the question, the AI's reply, the saved answer card, the sources they found (the library) and the results they skipped (charter gaps). Three explanations are context-only under rule 2, and one (the Cyclops) found no permitted sources. If you edit a seeded note one of them quotes, seeding fails loudly: re-run `--generate`.
- **Source library:** the seminar's has only the two Hobbes Asks' sources, so step 3 still visibly finds new ones. `--with-sources` preloads SEP "Rousseau" and Wikipedia "General will" in case web search fails on stage. The `web_cache` covers the normal case.
- **Licences:** the scans are public domain (pre-1927 editions). Bennett's PDFs say "Copyright © Jonathan Bennett 2017. All rights reserved"; nobody has checked his terms for a public repo. `TODO`: check before submission, or swap in a public-domain translation (e.g. G. D. H. Cole's 1913).

Write the seed so `seed.py --reset` gives the exact starting state of demo step 1, **minus** the upload. Also add a `--with-reading` flag in case the live upload fails during the demo.

Because the reading is uploaded live, the seeded annotations can't exist before it: **uploading a file named `rousseau-social-contract.pdf` into PHIL 247 adds them** (`main.demo_seed_for`; the Du Bois PDF into HIST 214 still works the same way for `seed_dubois.py`). The PDFs are in `app/backend/seed/`.

---

## 11. Open questions for review

1. ~~**Co-creation of the charter**~~ **Decided (Sat 10:50):** in between: students post proposals; the professor adds one to the text with one click (then edits and saves), marks it added, or declines it, and students see which (§3.7).
2. **AI explanation visibility:** the spec makes every AI explanation public, as in the vision. Should the asker be able to discard it before it's posted?
3. ~~**Search API**~~ **Decided:** Kagi (Brave as fallback). Set a budget alert or check usage on the Kagi billing page before the demo.
4. **Past students:** the spec fakes them with a seeded cohort. OK for the demo?
5. ~~**Model**~~ **Decided:** Claude Sonnet 5.5 on DO (`anthropic-claude-sonnet-5.5`). Still test the gate on the step-4 questions early: a gate that wrongly allows "what does it mean" breaks the demo's best moment.
6. **Domain:** `dialectic.space` or a subdomain of an existing domain? Decide by 08:00 so DNS can propagate.
7. **Hotkey demo:** which Mac and which reading app (Notability vs Preview) do we demo on? Permissions must be granted on that Mac before presenting. Does the demo chapter need seeded sub-headings so "same section" visibly differs from "same page"?
8. ~~**Ask and locked annotations elsewhere**~~ **Decided:** the Ask panel shows every matching classmate answer in full, wherever it is in the reading; the margin elsewhere stays governed by nearness (§3.5).
9. ~~**Should an answer seen through Ask unlock everywhere?**~~ **Decided (Sat 10:20): yes**, since landing on a lock card from the answer card felt broken. Built without a table: the lock reads the peers saved in the student's own questions' `answer_json` (§3.5). After (8), Ben can read a classmate's page-7 note in his Ask panel, but it's still locked in his margin on page 7. Should seeing it through Ask unlock it in the margin too? **Yes:** consistent and less confusing, but it needs a small table of what each student has unlocked (`unlocks(user_id, annotation_id)`) and a check in the lock query. **No (current):** nothing stored; the note just reappears locked on page 7 until he engages there. Not urgent: decide if it confuses people in rehearsal.
10. **Charter realism check** (`ideas/03-charter-realism-check.md`): should an AI pass over the saved charter tell the professor, per rule, whether the app enforces it (toggle, gate, by design) or it's honour-system, and flag text that contradicts the toggles? **Yes:** helps the professor write a realistic charter and makes a good pitch line; ~1–1.5 h, plus a capabilities description to keep in sync with the toggles. **No (current default):** the charter stays as written; the gate's blocked notices are the only feedback. Build only if there's time before the 12:00 cutoff.
11. **Seminar table home page** (`ideas/04-seminar-table.md`, mockup https://claude.ai/artifact/AWnEUjMrTmBSHkHijy46Fq): should the page a student lands on be a round table of classmates with the reading's passages in the middle and everyone's notes on the spokes between, keeping the lock (locked notes are a count with no author link) and AI off the table? **Current default:** not built; it's the pitch's "what's next", not part of the demo path. Raised by josue (Sat 10:31).
