# Dialectic's front door (Cloudflare Worker)

`worker.js` sits in front of the MicroVM (`../microvm/README.md`) at `dialectic.yaggy.dev`. It keeps bots from waking the VM, keeps spending in check and tells Owen's phone what's happening. How it fits with the rest: `DEPLOY.md`.

## What it does

- **No pass:** a page load gets a small "Start the demo" page with a Cloudflare Turnstile check; an API call gets `401 {"detail": "Start the demo first…", "code": "no_pass"}`, which the app shows as "This demo session ended. Start again". `robots.txt` disallows everything. Nothing without a pass reaches the VM, so a crawler never wakes it.
- **Start** (`POST /__dialectic/start`): checks the Turnstile token, then the guards below, then sets `dia_pass`, an HMAC-signed, HttpOnly cookie good for 4 hours.
- **With a pass:** proxies the request to `VM_HOST` with the DO token, renaming `X-User-Id` to `X-Dialectic-User-Id` (DigitalOcean's endpoint strips `X-User-Id`, `Cookie` and `Authorization`; the image's `guard.py` renames it back). While the VM wakes or first boots, a page load gets a "Starting Dialectic…" page that reloads itself; the app's GETs retry on their own.
- **Guards:** no new passes when the DigitalOcean team's month-to-date usage (billing API, cached 15 min) reaches `MONTHLY_LIMIT_USD`, or after `WAKES_PER_DAY` passes that day (`0` stops new starts).
- **Alerts** to ntfy (`NTFY_URL`), each once: 50/80/100% of the monthly limit (checked daily by the cron, 13:00 UTC); 50/80/100% of the app's lifetime AI and search budgets (read from `/api/spend` at most every 10 minutes, only right after the VM has answered a request, so checking never wakes it); the daily cap reached; and, with `NOTIFY_STARTS=1`, each day's first start.

The monthly check sees only the team the VM is in. The model key is billed to another team (Main), which is why the app's own spend is checked as well.

## Settings

| Name | Kind | What |
| --- | --- | --- |
| `STATE` | KV binding | Pass counts, cached usage, which alerts have fired |
| `VM_HOST` | var | `<vm id>.mkc1.microvm.ondigitalocean.com` |
| `MONTHLY_LIMIT_USD`, `WAKES_PER_DAY` | vars | `5`, `20` |
| `TURNSTILE_SITEKEY` | var | The widget's site key (public) |
| `NOTIFY_STARTS` | var | `1` to be told of each day's first start |
| `DO_TOKEN` | secret | A token for the Dialectic team with `microvm:access` (reaches every VM in that team) and billing read |
| `TURNSTILE_SECRET`, `COOKIE_SECRET`, `NTFY_URL` | secrets | `COOKIE_SECRET` signs passes: changing it ends everyone's pass. The ntfy topic URL is effectively a password for the alerts |

Owen keeps the secret values in `~/.config/dialectic/worker.env`. Set one with `npx wrangler@4 secret put NAME` (it reads stdin, so the value stays out of the shell history).

## Deploy and test

```sh
cd deploy/worker
npx wrangler@4 deploy        # needs `npx wrangler@4 login` once
npx wrangler@4 tail          # live log
```

To try a change without touching the live site, comment out `routes`, deploy, and use the `*.workers.dev` URL wrangler prints (add that hostname to the Turnstile widget). Cloudflare's always-pass test keys (site key `1x00000000000000000000AA`, secret `1x0000000000000000000000000000000AA`) let a script get a pass; never leave them on the live Worker.
