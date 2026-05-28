# Slickdeals+

Tampermonkey userscript that enhances the Slickdeals frontpage with deal filtering, sorting, price highlighting, ad removal, and redirect bypass.

## Shared Standards (auto-loaded)

@loom-shared/architecture.md
@loom-shared/protocol.md

## Architecture

Single-file userscript (`slickdeals-plus-v32.3.9.js`, ~1,511 lines). No build system, no dependencies, no framework — vanilla ES6+ JavaScript in a single IIFE with named inner modules wired via a shared `context` object.

**Module order:** suppressAdErrors → log → safeExecute → ToastModule → ConstantsModule → ValidationModule → UtilsModule → LinkResolutionModule → SettingsModule → MenuModule → StylesModule → ProcessingModule → SortingModule → init()

**Key rules:**
- All DOM selectors live in `ConstantsModule.SELECTORS` — never hard-code selectors elsewhere
- All setting defaults live in `ConstantsModule.DEFAULTS` — new settings must also be added to ValidationModule and MenuModule
- Settings use dual storage (GM_setValue + localStorage) — maintain both writes until consolidation
- The processing pipeline order in ProcessingModule must be preserved
- MutationObserver must not re-trigger on the script's own DOM mutations

## Releasing

Each version lives in a `slickdeals-plus-vX.Y.Z.js` file at repo root; the prior one is moved to `archived files/`. Auto-update (v32.3.9+) is served from a tagged GitHub Release asset named `slickdeals-plus.user.js` via the `/releases/latest/download/` redirect that `@updateURL` points at.

Use `./release.sh` (don't do these by hand):
1. `./release.sh prep <X.Y.Z>` — copies the current file to the new version, bumps `@name`/`@version`/`const VERSION`, archives the old file, updates README/CLAUDE refs, and stubs the CHANGELOG entries.
2. Make your code changes in the new file; fill in the `[X.Y.Z]` CHANGELOG notes (both `docs/CHANGELOG.md` and the in-file block). Then `git add -A && git commit && git push origin main`.
3. `./release.sh publish` — validates version consistency + CHANGELOG, tags, uploads the asset (literally named `slickdeals-plus.user.js` — the `/latest/download/` URL keys off the filename, not a `gh` display label), and verifies the live URL serves the new version.

`@version` and `@name` in the `==UserScript==` header are literals (Tampermonkey parses them statically) — `release.sh` bumps them; never rely on `const VERSION` for the header.
