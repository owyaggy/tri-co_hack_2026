#!/usr/bin/env python3
"""Carry a running VM's spend and web_cache into the seed database, before replacing the VM.

A new image means a new VM that starts again from seed.db (README.md, "The database"), so
without this the lifetime budgets would start counting from the old seed's spend again, and
answers cached since then would be lost.

    deploy/microvm/carry-state.py <vm-id>          # then: deploy/microvm/build.sh --push

The VM's spend table replaces the seed's (it started as a copy of it, so it has every row);
web_cache rows are added where the key is new. The seed is backed up beside itself first.
Uses doctl's context DOCTL_CONTEXT (default: dialectic) and SEED_DB as build.sh does.
"""
import base64
import gzip
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import time

SEED_DB = os.environ.get("SEED_DB") or os.path.expanduser(
    "~/code/tri-co_hack_2026-archive/microvm-seed/dialectic.db")
CONTEXT = os.environ.get("DOCTL_CONTEXT", "dialectic")

# Runs on the VM with the app's own Python; prints the two tables as gzipped, base64 JSON.
EXPORT = """
import base64, gzip, json, sqlite3, sys
c = sqlite3.connect("/app/app/backend/dialectic.db")
d = {"spend": [list(r) for r in c.execute("select at, service, units, usd, device_id, question_id from spend")],
     "web_cache": [list(r) for r in c.execute("select key, value, created_at from web_cache")]}
sys.stdout.write(base64.b64encode(gzip.compress(json.dumps(d).encode())).decode())
"""


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    vm = sys.argv[1]
    out = subprocess.run(["doctl", "--context", CONTEXT, "compute", "microvm", "exec", vm, "--",
                          "/app/app/backend/.venv/bin/python", "-c", EXPORT],
                         capture_output=True, text=True, check=True).stdout
    data = json.loads(gzip.decompress(base64.b64decode(out.strip().splitlines()[-1])))

    backup = f"{SEED_DB}.{time.strftime('%Y%m%d-%H%M%S')}"
    shutil.copy2(SEED_DB, backup)
    c = sqlite3.connect(SEED_DB)
    before = c.execute("select count(*), round(coalesce(sum(usd), 0), 4) from spend").fetchone()
    cached = c.execute("select count(*) from web_cache").fetchone()[0]
    c.execute("delete from spend")
    c.executemany("insert into spend (at, service, units, usd, device_id, question_id) values (?, ?, ?, ?, ?, ?)",
                  data["spend"])
    c.executemany("insert or ignore into web_cache (key, value, created_at) values (?, ?, ?)", data["web_cache"])
    c.commit()
    after = c.execute("select count(*), round(coalesce(sum(usd), 0), 4) from spend").fetchone()
    print(f"spend rows {before[0]} (${before[1]}) -> {after[0]} (${after[1]}); "
          f"web_cache {cached} -> {c.execute('select count(*) from web_cache').fetchone()[0]}; "
          f"integrity {c.execute('pragma integrity_check').fetchone()[0]}; backup {backup}")


if __name__ == "__main__":
    main()
