#!/usr/bin/env bash
#
# release.sh — Slickdeals+ release helper.
#
# A release has three parts: mechanical setup, your creative work, and the
# publish ceremony. This script automates the first and third; you do the
# middle (write code + CHANGELOG notes).
#
#   ./release.sh prep <X.Y.Z>     Create the new versioned file from the current
#                                 one, bump @name/@version/VERSION, archive the
#                                 old file, update README/CLAUDE refs, and stub
#                                 the CHANGELOG entries.
#
#   --- then: make your code changes, fill in the CHANGELOG notes,
#       `git add -A && git commit`, and `git push origin main` ---
#
#   ./release.sh publish [X.Y.Z]  Validate everything is consistent, tag, push
#                                 the tag, upload the release asset (correctly
#                                 named slickdeals-plus.user.js), and verify the
#                                 stable /latest/download/ URL serves it.
#
#   ./release.sh verify           Re-check that the latest-download URL resolves
#                                 and report which @version it serves.
#
# Add --dry-run to prep/publish to see what would happen without changing
# anything (no files written, no tags, no release).
#
# Background on the asset-naming gotcha this encodes: the
# /releases/latest/download/<NAME> URL keys off the asset's *actual filename*,
# not the `gh release create file#label` display label. So publish uploads a
# temp copy literally named slickdeals-plus.user.js — never committed to the
# repo (that would break the versioned-filename convention).

set -euo pipefail

REPO_SLUG="rehire-shriek/slickdeals-plus"
ASSET_NAME="slickdeals-plus.user.js"
LATEST_URL="https://github.com/${REPO_SLUG}/releases/latest/download/${ASSET_NAME}"
ARCHIVE_DIR="archived files"

cd "$(dirname "$0")"

# ---- helpers ---------------------------------------------------------------

c_ok()   { printf '\033[32m✓\033[0m %s\n' "$1"; }
c_info() { printf '  %s\n' "$1"; }
fail()   { printf '\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

# In-place edit, macOS/BSD- and GNU-safe (perl is consistent across both).
edit() { perl -0pi -e "$1" "$2"; }

# Find the single current (non-archived) script in repo root.
detect_current() {
  local matches=( slickdeals-plus-v*.js )
  [ -e "${matches[0]}" ] || fail "no slickdeals-plus-v*.js found in repo root"
  [ "${#matches[@]}" -eq 1 ] || fail "expected exactly one slickdeals-plus-v*.js in root, found ${#matches[@]}: ${matches[*]}"
  printf '%s' "${matches[0]}"
}

header_version() { grep -m1 '^// @version' "$1" | awk '{print $NF}'; }

# ---- prep ------------------------------------------------------------------

cmd_prep() {
  local NEW="${1:-}" DRY="${2:-}"
  [ -n "$NEW" ] || fail "usage: release.sh prep <X.Y.Z> [--dry-run]"
  [[ "$NEW" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "version must look like X.Y.Z (got '$NEW')"

  [ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || fail "not on main"
  git diff --quiet && git diff --cached --quiet || fail "working tree not clean — commit or stash first"

  local CUR; CUR="$(detect_current)"
  local OLD; OLD="$(header_version "$CUR")"
  local NEWFILE="slickdeals-plus-v${NEW}.js"
  local TODAY; TODAY="$(date +%F)"

  [ "$OLD" != "$NEW" ] || fail "new version equals current ($OLD)"
  [ ! -e "$NEWFILE" ] || fail "$NEWFILE already exists"
  grep -q "^## \[${NEW}\]" docs/CHANGELOG.md 2>/dev/null && fail "CHANGELOG already has [${NEW}]"

  printf 'prep: %s (v%s) → %s (v%s), date %s\n\n' "$CUR" "$OLD" "$NEWFILE" "$NEW" "$TODAY"

  if [ "$DRY" = "--dry-run" ]; then
    c_info "would: cp '$CUR' '$NEWFILE'"
    c_info "would: bump @name/@version/const VERSION → $NEW in $NEWFILE"
    c_info "would: git mv '$CUR' '$ARCHIVE_DIR/'"
    c_info "would: update version+filename refs in README.md and CLAUDE.md"
    c_info "would: insert [${NEW}] skeleton into docs/CHANGELOG.md and the in-file changelog"
    c_ok "dry-run only — nothing changed"
    return 0
  fi

  cp "$CUR" "$NEWFILE"

  # Bump the three in-file version sites (header @name + @version are literals).
  edit "s/(\@name\s+Slickdeals\+ v)\Q$OLD\E/\${1}$NEW/" "$NEWFILE"
  edit "s/(\@version\s+)\Q$OLD\E/\${1}$NEW/" "$NEWFILE"
  edit "s/const VERSION = '\Q$OLD\E'/const VERSION = '$NEW'/" "$NEWFILE"

  # In-file changelog skeleton, inserted above the previous entry.
  edit "s/( \* CHANGELOG v\Q$OLD\E:)/ * CHANGELOG v$NEW:\n * - [TODO] describe changes\n *\n\$1/" "$NEWFILE"

  git mv "$CUR" "$ARCHIVE_DIR/$CUR"

  # Doc refs. Filename refs only ever name the file, so a targeted swap is safe.
  local LINES; LINES="$(wc -l < "$NEWFILE" | tr -d ' ')"
  local PRETTY; PRETTY="$(printf "%'d" "$LINES" 2>/dev/null || echo "$LINES")"
  for doc in README.md CLAUDE.md; do
    [ -f "$doc" ] || continue
    edit "s/slickdeals-plus-v\Q$OLD\E\.js/slickdeals-plus-v$NEW.js/g" "$doc"
    edit "s/\*\*v\Q$OLD\E\*\*/**v$NEW**/g" "$doc"
    edit "s/~[0-9,]+ lines/~$PRETTY lines/g" "$doc"
  done

  # CHANGELOG.md skeleton, inserted before the first existing entry.
  awk -v ver="$NEW" -v day="$TODAY" '
    !done && /^## \[/ {
      print "## [" ver "] - " day "\n"
      print "<one-line summary>\n"
      print "### Added\n- TODO\n\n---\n"
      done=1
    }
    { print }
  ' docs/CHANGELOG.md > docs/CHANGELOG.md.tmp && mv docs/CHANGELOG.md.tmp docs/CHANGELOG.md

  node --check "$NEWFILE" || fail "syntax check failed on $NEWFILE — investigate before continuing"

  echo
  c_ok "prep complete"
  c_info "1. make your code changes in $NEWFILE"
  c_info "2. fill in the [${NEW}] notes in docs/CHANGELOG.md and the in-file 'CHANGELOG v$NEW' block"
  c_info "3. adjust the '~$PRETTY lines' count in README/CLAUDE if it drifted"
  c_info "4. git add -A && git commit && git push origin main"
  c_info "5. ./release.sh publish"
}

# ---- publish ---------------------------------------------------------------

cmd_publish() {
  local ARG="" DRY=""
  for a in "$@"; do
    case "$a" in
      --dry-run) DRY="--dry-run" ;;
      *) ARG="$a" ;;
    esac
  done

  local CUR; CUR="$(detect_current)"
  local HVER; HVER="$(header_version "$CUR")"
  local VERSION="${ARG:-$HVER}"
  local TAG="v${VERSION}"

  printf 'publish: %s  version %s  tag %s\n\n' "$CUR" "$VERSION" "$TAG"

  # --- validation gates ---
  [ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || fail "not on main"
  git diff --quiet && git diff --cached --quiet || fail "working tree not clean — commit first"
  git fetch -q origin main
  [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || fail "local main not in sync with origin/main — push first"
  [ "$CUR" = "slickdeals-plus-v${VERSION}.js" ] || fail "current file ($CUR) does not match version $VERSION"
  [ "$HVER" = "$VERSION" ] || fail "@version ($HVER) != $VERSION"
  grep -q "^// @name .* v${VERSION}\$" "$CUR" || fail "@name does not carry v${VERSION}"
  grep -q "const VERSION = '${VERSION}'" "$CUR" || fail "const VERSION != '${VERSION}'"
  grep -q "^// @updateURL" "$CUR" || fail "@updateURL header missing"
  node --check "$CUR" || fail "syntax check failed"
  grep -q "^## \[${VERSION}\]" docs/CHANGELOG.md || fail "no [${VERSION}] entry in docs/CHANGELOG.md"
  ! grep -q "TODO" <(awk "/^## \[${VERSION}\]/{f=1;next} /^## \[/{f=0} f" docs/CHANGELOG.md) || fail "[${VERSION}] CHANGELOG still contains TODO placeholders"
  ! git rev-parse "$TAG" >/dev/null 2>&1 || fail "git tag $TAG already exists"
  ! gh release view "$TAG" >/dev/null 2>&1 || fail "release $TAG already exists"

  c_ok "all validation gates passed"

  # Release notes = this version's CHANGELOG section.
  local NOTES; NOTES="$(awk "/^## \[${VERSION}\]/{f=1} /^## \[/{if(f && !/\[${VERSION}\]/)exit} f" docs/CHANGELOG.md)"

  if [ "$DRY" = "--dry-run" ]; then
    echo
    c_info "would: git tag $TAG && git push origin $TAG"
    c_info "would: gh release create $TAG <temp>/$ASSET_NAME --title $TAG --notes-file -"
    c_info "would: verify $LATEST_URL serves @version $VERSION"
    echo "----- release notes preview -----"
    printf '%s\n' "$NOTES"
    echo "---------------------------------"
    c_ok "dry-run only — nothing published"
    return 0
  fi

  git tag "$TAG"
  git push origin "$TAG"
  c_ok "tagged + pushed $TAG"

  local TMP; TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
  cp "$CUR" "$TMP/$ASSET_NAME"
  printf '%s\n' "$NOTES" | gh release create "$TAG" "$TMP/$ASSET_NAME" --title "$TAG" --notes-file -
  c_ok "release $TAG published with asset $ASSET_NAME"

  cmd_verify "$VERSION"
  echo
  c_ok "done — auto-update is live for $TAG"
}

# ---- verify ----------------------------------------------------------------

cmd_verify() {
  local EXPECT="${1:-}"
  echo "verifying $LATEST_URL ..."
  # Fetch into a variable first (separate network failure from extraction), then
  # pull @version with a pipe-free bash regex — avoids grep -m1 closing the pipe
  # under `set -o pipefail` and tripping a false failure.
  local body; body="$(curl -fsSL "$LATEST_URL" 2>/dev/null)" \
    || fail "could not fetch $LATEST_URL (no release yet?)"
  local SERVED=""
  if [[ "$body" =~ @version[[:space:]]+([0-9]+\.[0-9]+\.[0-9]+) ]]; then
    SERVED="${BASH_REMATCH[1]}"
  fi
  [ -n "$SERVED" ] || fail "fetched the URL but found no @version line"
  if [ -n "$EXPECT" ] && [ "$SERVED" != "$EXPECT" ]; then
    fail "latest/download serves @version $SERVED (expected $EXPECT)"
  fi
  c_ok "latest/download serves @version $SERVED"
}

# ---- dispatch --------------------------------------------------------------

case "${1:-}" in
  prep)    shift; cmd_prep "$@" ;;
  publish) shift; cmd_publish "$@" ;;
  verify)  shift; cmd_verify "$@" ;;
  *)
    cat >&2 <<EOF
Slickdeals+ release helper.

Usage:
  ./release.sh prep <X.Y.Z> [--dry-run]   set up the new version's files
  ./release.sh publish [X.Y.Z] [--dry-run]  tag, upload asset, verify
  ./release.sh verify                     re-check the latest-download URL

Typical flow:
  ./release.sh prep 32.3.10
  # edit the code + CHANGELOG, then:
  git add -A && git commit -m "feat: v32.3.10 ..." && git push origin main
  ./release.sh publish
EOF
    exit 1 ;;
esac
