# Deploying Dialectic

How the public copy is set up, and the commands for everything we do to it. Scripts and config are in `deploy/microvm/` (the image) and `deploy/worker/` (the front door); each has a README with the details.

**Since 16 Nov 2026** the public copy is one container on a DigitalOcean **MicroVM** that pauses when nobody is using it, behind a **Cloudflare Worker**. The hackathon droplet (three copies: demo, sandbox, dev) was destroyed that day, and `dialectic-sandbox.yaggy.dev`, `dialectic-dev.yaggy.dev` and `dialectic.space` are gone. The droplet's scripts stay in `deploy/` for reference (`Caddyfile`, `setup-droplet.sh`, `update.sh`, the autodeploy and service files); its how-to is in git history: `git show 8cb1651:DEPLOY.md`.

Everything here needs Owen's accounts (DigitalOcean, Cloudflare, GitHub's container registry). Everyone else runs Dialectic locally (`README.md`, *Running it*).

## What's running

| Piece | Where | What it does |
| --- | --- | --- |
| **Public link** | `https://yag.gy/dia` | A 302 redirect (Cloudflare redirect rule on `yag.gy`) to `https://dialectic.yaggy.dev/` |
| **Front door** | Cloudflare Worker `dialectic-front-door`, route `dialectic.yaggy.dev/*` | A "Start the demo" page behind Turnstile; passing it gives a 4-hour pass (signed cookie). Requests with a pass go to the VM. Spending guards and phone alerts (below) |
| **The app** | MicroVM `dialectic-demo-2` in the **Dialectic** DigitalOcean team, region `mkc1`, 1 vCPU / 2 GiB | The image `ghcr.io/owyaggy/dialectic:sha-…` (public): FastAPI serving the API and the built frontend, with its own database on the VM's disk. Pauses after 15 idle minutes; the next request resumes it in about a second |

A request: browser → Cloudflare → the Worker (no pass: the Start page, or a 401 for API calls) → the VM's DigitalOcean endpoint, with the Worker's DO token → `guard.py` → uvicorn on port 8080. DigitalOcean's endpoint strips `X-User-Id`, `Cookie` and `Authorization`, so the Worker sends the user as `X-Dialectic-User-Id` and `guard.py` turns it back.

`/version.txt` shows the commit the image was built from. There's no dev copy and nothing deploys itself: a new version is a new image and a new VM (below).

## What it costs, and the limits

- **The VM:** $0.039 an hour while awake, and a few cents a month for its disk while paused. It's awake only while someone uses it, plus 15 minutes. A reader tab stops checking for new notes after 5 minutes without input, so a forgotten tab doesn't keep it awake.
- **AI and search:** the app's own **lifetime** budgets, `AI_BUDGET_USD=3` and `SEARCH_BUDGET_USD=1`, over its `spend` table. Past a budget, that layer shows a notice; classmates' answers and the library keep working. Paid Asks are also limited to 5 per device per hour. The model key is billed to Owen's **Main** team, not the Dialectic team.
- **The Worker's guards:** no new passes once the Dialectic team's month-to-date usage reaches `MONTHLY_LIMIT_USD` ($5; that covers the VM, not AI), or after `WAKES_PER_DAY` (20) passes in a day.
- **Phone alerts** (ntfy): 50, 80 and 100% of the monthly limit and of each app budget; the daily cap reached; each day's first start.

### Check spending

Open `https://dialectic.yaggy.dev/api/spend` in a browser after starting the demo. Without a browser, ask the VM directly with the Worker's token or any token with `microvm:access` (DigitalOcean's endpoint refuses some default user agents, hence `-A`):

```sh
curl -s -A dialectic-check -H "Authorization: Bearer $DO_TOKEN" https://<VM_HOST>/api/spend
```

`VM_HOST` is in `deploy/worker/wrangler.toml`. Asking wakes the VM.

## Everyday tasks

Run these from the repo root. `ID` is the VM's id (`doctl --context dialectic compute microvm list`); the settings live in `~/.config/dialectic/microvm.env` and `~/.config/dialectic/worker.env` on Owen's laptop, never in git.

### Deploy a new version

A new image needs a new VM, which starts from the seed database baked into the image. So carry the old VM's spending and cached answers into the seed first, or the budgets start counting again from the old figures:

```sh
deploy/microvm/carry-state.py $ID          # VM's spend + web_cache -> the seed database (backed up first)
deploy/microvm/build.sh --push             # builds from HEAD, pushes ghcr.io/owyaggy/dialectic:sha-<short sha>
doctl --context dialectic compute microvm create dialectic-demo-N \
  --oci-ref ghcr.io/owyaggy/dialectic:sha-<short sha> --region mkc1 --cpu 1 --memory 2048 \
  --http-port 8080 --auto-pause --auto-pause-idle-timeout 15m --auto-resume --tag dialectic \
  $(grep -v '^#' ~/.config/dialectic/microvm.env | sed 's/^/--env /')
```

First boot takes about 22 s. Check `https://<new id>.mkc1.microvm.ondigitalocean.com/version.txt` (with the `curl` above), then set `VM_HOST` in `deploy/worker/wrangler.toml` to the new host, `npx wrangler@4 deploy` from `deploy/worker/`, commit, and delete the old VM: `doctl --context dialectic compute microvm delete $ID`. Anyone with a pass keeps it: it's signed by the Worker, not the VM.

### Change a setting, or stop AI spending

The VM reads `/var/lib/dialectic/env` (`KEY=value` lines) over its creation settings. Edit `~/.config/dialectic/microvm.env`, then write it to the VM and restart the app, which comes back within 30 s:

```sh
doctl --context dialectic compute microvm exec $ID -- sh -c \
  "umask 077; echo $(grep -v '^#' ~/.config/dialectic/microvm.env | base64 -w0) | base64 -d > /var/lib/dialectic/env && kill \$(cat /var/lib/dialectic/uvicorn.pid)"
```

- **Emergency stop for AI:** `AI_OFF=1`. Cached answers still replay; nothing new is paid for.
- **Stop new visitors:** `npx wrangler@4 deploy --var WAKES_PER_DAY:0` from `deploy/worker/`. Passes already given out work until they expire (4 hours).
- **Take it offline:** comment out `routes` in `wrangler.toml` and deploy, or delete the route in the Cloudflare dashboard.

### Reset the demo

The VM reseeds itself once a day (`RESEED_HOURS`), when nobody has made a request for 5 minutes at two checks in a row: visitors' notes go, cached answers and spending stay. To reset now: `doctl --context dialectic compute microvm exec $ID -- rm /var/lib/dialectic/last-reseed`; it reseeds at the next quiet moment.

### Logs and status

```sh
doctl --context dialectic compute microvm list --format ID,Name,State
doctl --context dialectic compute microvm exec $ID -- tail -50 /var/lib/dialectic/uvicorn.log
cd deploy/worker && npx wrangler@4 tail     # the Worker's live log
```

### Change the Worker

Edit `deploy/worker/worker.js` or `wrangler.toml`, then `npx wrangler@4 deploy` from `deploy/worker/` (log in once with `npx wrangler@4 login`). Its secrets (`DO_TOKEN`, `TURNSTILE_SECRET`, `COOKIE_SECRET`, `NTFY_URL`) are set with `npx wrangler@4 secret put <NAME>`, which reads the value from stdin. `deploy/worker/README.md` has the details.

## Cloudflare

- **`dialectic.yaggy.dev`** has a proxied DNS record pointing at `192.0.2.1`, a placeholder: a Worker route needs a proxied record, but requests never reach its target.
- **Turnstile:** one widget (Managed) for the hostname `dialectic.yaggy.dev`; its site key is in `wrangler.toml`, its secret is a Worker secret.
- **Streaming:** the Ask streams its answer stage by stage; checked through the VM's endpoint, it isn't buffered. A fresh Ask takes 15–35 s, and Cloudflare cuts requests at 100 s.
