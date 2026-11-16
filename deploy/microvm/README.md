# Dialectic on a MicroVM

The preserved public copy of Dialectic: one container on a DigitalOcean MicroVM that pauses when nobody is using it, replacing the hackathon droplet's three copies (`DEPLOY.md`). A Cloudflare Worker in front of it comes later; this folder is only the image.

| File | What it does |
| --- | --- |
| `Dockerfile` | Node stage builds `app/frontend/dist`; Python 3.12 + uv installs the backend from `uv.lock`. No OCR packages. Same layout as a checkout, under `/app` |
| `entrypoint.sh` | PID 1: seeds on first boot, runs uvicorn on `$PORT` (8080), restarts it if it dies, reseeds daily when quiet. Never exits |
| `guard.py` | Wraps `main:app` and refuses `POST /api/sources` (server fetches any URL) and `POST /api/readings` (uploads, unless `UPLOADS_ENABLED=1`), the jobs Caddy did on the droplet. Can go once the app's own hardening has landed |
| `build.sh` | Builds from a `git archive` of HEAD plus the prepared database; `--push` pushes to `ghcr.io/owyaggy/dialectic` |

## Build and try it locally

```sh
deploy/microvm/build.sh                      # tags :sha-<short sha> and :latest
podman run --rm -p 127.0.0.1:8798:8080 -e AI_OFF=1 -e AI_BUDGET_USD=3 -e SEARCH_BUDGET_USD=1 \
  ghcr.io/owyaggy/dialectic:latest           # first boot seeds for ~30 s, then http://localhost:8798
```

With `AI_OFF=1`, a rehearsed Ask still replays in full from the cache. For example, as Chidi (user 5) on the Rousseau reading, page 12, quote *"Each of us puts his person and all his power in common under the supreme direction of the general will"*, the question *"What does Rousseau mean by the general will?"* comes back with classmates, 1 source, 14 skipped and the "Under Rule 2…" explanation, and spend doesn't change. Anything not cached shows *"AI is switched off on this copy"*.

## Settings

All from the environment (`doctl compute microvm create --env KEY=value …`). If `--env` fails (it returned a 500 for the Agent Box), write the same `KEY=value` lines to `/var/lib/dialectic/env` with `doctl compute microvm exec` and restart the app (see *Operating it* below).

| Variable | Default | Notes |
| --- | --- | --- |
| `DO_INFERENCE_KEY` | none | A model access key just for this copy, with a low monthly spend threshold |
| `DO_INFERENCE_URL`, `DO_MODEL` | as in `.env.example` | |
| `KAGI_API_KEY` | none | |
| `AI_BUDGET_USD`, `SEARCH_BUDGET_USD` | `0` (nothing paid) | **Lifetime totals** over the `spend` table, which starts at $0.0284 AI / $0.012 search. So `AI_BUDGET_USD=3` allows about $2.97 more, ever |
| `DEVICE_ASKS_PER_HOUR` | `5` | Paid Asks per device per hour |
| `AI_OFF` | `0` | `1` blocks every paid call; cached replays still work |
| `UPLOADS_ENABLED` | `0` | Leave off: no OCR in the image |
| `PROFESSOR_PASSWORD` | none | Used once the hardening work is merged; ignored before |
| `RESEED_HOURS`, `RESEED_QUIET_SECONDS` | `24`, `300` | Keep the VM's auto-pause idle timeout longer than the quiet time, or the reseed never finds a quiet moment |

## The database

The image carries the prepared database as `/app/seed.db`: the demo copy's database from the hackathon droplet (clean seeded state, its `spend`), plus every `web_cache` row from the sandbox and dev copies that demo didn't have (173 rows in all). `build.sh` takes it from `~/code/tri-co_hack_2026-archive/microvm-seed/dialectic.db` (override with `SEED_DB=`). It holds fetched web pages and cached AI answers, so the image shares those with anyone who can pull it.

On first boot, the entrypoint copies it to `app/backend/dialectic.db` and runs `seed.py --reset --with-reading`, which rebuilds the seed (PDF paths included) and keeps `web_cache` and `spend`. The database and `uploads/` then live on the VM's disk, which survives pause and resume. **A new image means a new VM, which starts again from `seed.db`:** to keep the spend and any newly cached answers, copy the VM's `dialectic.db` out first and build the next image with it as `SEED_DB`.

The daily reseed (or one that's overdue when the VM resumes) waits for `RESEED_QUIET_SECONDS` with no requests, then stops uvicorn for about 30 s while it runs.

## Operating it

- Log: `/var/lib/dialectic/uvicorn.log` (the previous day's in `uvicorn.log.1`), e.g. `doctl compute microvm exec <id> -- tail -50 /var/lib/dialectic/uvicorn.log`.
- Image version: `/var/lib/dialectic/image-version` and `/version.txt`.
- Restart the app (to pick up a changed env file, for example): `doctl compute microvm exec <id> -- sh -c 'kill $(cat /var/lib/dialectic/uvicorn.pid)'` (the image has no `pkill`). The entrypoint starts it again within 30 s.
- Spending: `GET /api/spend`.
