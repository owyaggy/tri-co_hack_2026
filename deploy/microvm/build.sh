#!/bin/sh
# Builds the Dialectic MicroVM image with Podman from the committed HEAD (a
# `git archive`, so uncommitted changes and local databases never get in), plus
# the prepared database, and tags it ghcr.io/owyaggy/dialectic:sha-<short sha>
# and :latest. A MicroVM's image can't change after creation, so pin VMs to the
# sha tag.
#
#   deploy/microvm/build.sh            # build only
#   deploy/microvm/build.sh --push     # build and push (needs `podman login ghcr.io`,
#                                      # e.g. gh auth token | podman login ghcr.io -u owyaggy --password-stdin,
#                                      # with the write:packages scope)
#
# SEED_DB: the database the VM starts from on first boot (README.md, "The database").
set -eu

cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"

SEED_DB=${SEED_DB:-$HOME/code/tri-co_hack_2026-archive/microvm-seed/dialectic.db}
image=ghcr.io/owyaggy/dialectic
sha="sha-$(git rev-parse --short HEAD)"

[ -f "$SEED_DB" ] || { echo "build.sh: no seed database at $SEED_DB" >&2; exit 1; }
[ -z "$(git status --porcelain -- app deploy/microvm)" ] \
  || echo "build.sh: note: uncommitted changes in app/ or deploy/microvm are NOT in the image (it builds HEAD)" >&2

ctx=$(mktemp -d)
trap 'rm -rf "$ctx"' EXIT
git archive HEAD app/backend app/frontend deploy/microvm | tar -x -C "$ctx"
cp "$SEED_DB" "$ctx/seed.db"

podman build --platform linux/amd64 --build-arg VERSION="$sha" \
  -f "$ctx/deploy/microvm/Dockerfile" -t "$image:$sha" -t "$image:latest" "$ctx"
echo "built $image:$sha"

if [ "${1:-}" = "--push" ]; then
  podman push "$image:$sha"
  podman push "$image:latest"
  echo "pushed $image:$sha"
fi
