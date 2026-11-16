# Dialectic

A collaborative reading platform for college courses. Students annotate course texts together and ask questions about hard passages. Answers come from their peers first, then from AI, but only in the ways the class's charter allows.

## Try it

**https://dialectic.yaggy.dev** (or `yag.gy/dia`) is the public copy: click **Start the demo**, pass the quick check, then log in as anyone. Students have no passwords; professors do, so on the public copy you can't log in as Prof. Rivera. It runs on a server that sleeps when nobody's using it and wakes in about a second ([`DEPLOY.md`](DEPLOY.md)). Visitors' notes are wiped once a day.

| Log in as | To try |
| --- | --- |
| **Prof. Rivera** (professor; locally, or with the password) | Upload a reading, edit the charter (rules, permissible sources, AI switches), see every note |
| **Ana**, **Ben**, **Chidi** (students) | Annotate; see classmates' notes unlock once you note or ask nearby; select a passage → **Ask** |
| **Sam** (a past student) | Notes shared from last year's class |

Adding sources and uploading readings are off on the public copy, and AI and search have a small lifetime budget; past it, Asks still bring classmates' answers and the library. To try everything, including uploads and the professor's side, run it locally (*Development*, below).

## Testing during the hackathon

During the hackathon (13–14 Nov 2026) a dev copy updated itself from `main`, teammates reported problems with its **Report a problem** button (GitHub issues labelled `feedback`), and a person promoted `main` to `stable` for the judges' copies. That droplet is gone; the button now shows only when you run Dialectic locally, and the issue workflow is in [`CLAUDE.md`](CLAUDE.md) (*Feedback issues*).

### The Mac app

The Mac app (macOS 14+) lets you ask about or annotate a passage from wherever you read it (Preview, Notability), with hotkeys: **⌥⇧D** ask, **⌥⇧N** note, **⌥⇧H** show classmates' highlights. It needs a server it can reach without the public copy's Start page, so pick **Server → This Mac (localhost:8000)** and run the backend locally; the other entries in that menu were the droplet's copies.

1. Open **[Actions → Mac app](https://github.com/Ramen3ater1/tri-co_hack_2026/actions/workflows/mac-app.yml)**, click the newest run with a green tick, and download **Dialectic-dev-mac** at the bottom of the page.
2. Unzip it and move `Dialectic.app` to Applications. It isn't notarized, so macOS says it's **"damaged"** until you clear its downloaded-from-the-internet flag, once per download, in Terminal:
   ```sh
   xattr -dr com.apple.quarantine /Applications/Dialectic.app
   ```
   Then open it normally. It runs on Intel and Apple Silicon Macs.
3. In its menu-bar menu, pick who you are and the server. Grant **Accessibility** (and **Screen Recording**, for ⌥⇧H) when macOS asks: System Settings → Privacy & Security.

Details, and what each hotkey does: [`app/mac/README.md`](app/mac/README.md).

## Project docs

- **What we're building and why:** [`SPEC.md`](SPEC.md)
- **How we work** (logging, commits, branches; written for agents, useful for people): [`CLAUDE.md`](CLAUDE.md)
- **What's happened so far:** [`LOG.md`](LOG.md)
- **Deploying, and the public copy:** [`DEPLOY.md`](DEPLOY.md)

## Development

### One-time setup

1. **Install uv**, which manages Python and the backend's packages. You don't need to install Python yourself: uv downloads the right version (3.12).
   - macOS / Linux: `curl -LsSf https://astral.sh/uv/install.sh | sh` (or `brew install uv`)
   - Windows (PowerShell): `powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"`

   Then open a new terminal and check that `uv --version` works.
2. **Install Node.js** (the current LTS) for the frontend, from <https://nodejs.org> or your package manager.
3. **Clone and configure:**
   ```sh
   git clone git@github.com:Ramen3ater1/tri-co_hack_2026.git
   cd tri-co_hack_2026
   cp .env.example .env    # then fill in the keys; ask in the team chat
   ```
   `.env` is gitignored. Never commit it or paste keys into code.
4. **Install the backend's packages:**
   ```sh
   cd app/backend
   uv sync
   ```

### Running it

Backend (from `app/backend`):

```sh
uv run seed.py --reset                                      # fresh demo database
uv run --env-file ../../.env uvicorn main:app --reload --port 8000
```

Frontend (from `app/frontend`, once it exists):

```sh
npm install
npm run dev
```

### Python packages

Use uv, never `pip install`:

- **Add a package:** `uv add <package>` (from `app/backend`), then commit both `pyproject.toml` and `uv.lock`.
- **After pulling** someone else's change to either file, run `uv sync`.
- **Run a script:** `uv run <script>.py`. It uses the project's environment, with no activating needed.

### Working with Claude

Open Claude Code at the repo root; it reads `CLAUDE.md` and follows the team's rules. To change the spec without writing Markdown, describe the change in plain English and Claude edits `SPEC.md`, then commits and pushes it.

### Branches

- **`main`:** everyone works here and pushes small changes often. It may be briefly broken.
- **`stable`:** the best version we could submit right now. A person promotes `main` to it after checking the demo path works. The submission came from `stable`; the public copy is built from whatever commit Owen deploys (`DEPLOY.md`).
