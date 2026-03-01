#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────
# release.sh — Tag and push a ProxCenter release
# Usage: ./release.sh 1.1.0
# ──────────────────────────────────────────────

BACKEND_DIR="../proxcenter-backend"

# ── Helpers ───────────────────────────────────

die() { echo "ERROR: $*" >&2; exit 1; }

usage() {
  echo "Usage: ./release.sh <version>"
  echo "  version   Semver without 'v' prefix (e.g. 1.2.0)"
  exit 1
}

# ── Validate input ────────────────────────────

[[ $# -eq 1 ]] || usage
VERSION="$1"

# Strict semver check (MAJOR.MINOR.PATCH)
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "Invalid semver: $VERSION (expected X.Y.Z)"

TAG="v${VERSION}"

echo "==> Releasing ProxCenter $TAG"

# ── Check prerequisites ──────────────────────

[[ -f frontend/package.json ]] || die "Must be run from proxcenter-frontend root"
[[ -d "$BACKEND_DIR/.git" ]]   || die "Backend repo not found at $BACKEND_DIR"

# Ensure no uncommitted changes
if ! git diff --quiet HEAD 2>/dev/null; then
  die "Frontend repo has uncommitted changes — commit or stash first"
fi

if ! git -C "$BACKEND_DIR" diff --quiet HEAD 2>/dev/null; then
  die "Backend repo has uncommitted changes — commit or stash first"
fi

# Check tag doesn't already exist
if git rev-parse "$TAG" >/dev/null 2>&1; then
  die "Tag $TAG already exists in frontend repo"
fi

if git -C "$BACKEND_DIR" rev-parse "$TAG" >/dev/null 2>&1; then
  die "Tag $TAG already exists in backend repo"
fi

# ── Update version files ─────────────────────

echo "==> Updating frontend/package.json version to $VERSION"
sed -i "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" frontend/package.json

echo "==> Updating frontend/src/config/version.ts fallback to $VERSION"
sed -i "s/|| '[0-9]*\.[0-9]*\.[0-9]*'/|| '$VERSION'/" frontend/src/config/version.ts

# ── Commit & tag frontend ────────────────────

echo "==> Committing version bump in frontend"
git add frontend/package.json frontend/src/config/version.ts
git commit -m "release: $TAG"

echo "==> Tagging frontend with $TAG"
git tag -a "$TAG" -m "Release $TAG"

# ── Tag backend ───────────────────────────────

echo "==> Tagging backend with $TAG"
git -C "$BACKEND_DIR" tag -a "$TAG" -m "Release $TAG"

# ── Push everything ───────────────────────────

echo "==> Pushing frontend (commits + tag)"
git push origin main "$TAG"

echo "==> Pushing backend tag"
git -C "$BACKEND_DIR" push origin "$TAG"

# ── Done ──────────────────────────────────────

echo ""
echo "Release $TAG pushed successfully!"
echo "  - Frontend tag + commits pushed → Docker build triggered"
echo "  - Backend tag pushed"
echo "  - GitHub Release will be created automatically by CI"
