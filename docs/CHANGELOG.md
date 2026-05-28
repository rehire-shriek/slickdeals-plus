# Slickdeals+ Changelog

All notable changes to this project will be documented in this file.

Format: `[Version] - Date`
- `[Feature]` - New functionality
- `[Fix]` - Bug corrections
- `[Refactor]` - Code improvements (no behavior change)
- `[Performance]` - Speed optimizations
- `[Breaking]` - Changes that require user action

---

## [32.3.9] - 2026-05-28

Auto-update enablement (backlog item #6).

### Added
- **Auto-update metadata** - `@downloadURL`/`@updateURL` now point at the GitHub Release "latest" asset (`/releases/latest/download/slickdeals-plus.user.js`), so installed users receive future versions automatically. Chosen over a raw-file URL for stable provenance across the versioned-filename release convention.

### Notes
- **One-time reinstall required** - Installs from the older repo file have no update source. Reinstall once from the release asset to get onto the auto-update track. See README → Installation.
- **New release step** - Each release now tags (`git tag vX.Y.Z`) and publishes the script as a release asset named `slickdeals-plus.user.js` (`gh release create ... "file#slickdeals-plus.user.js"`) so the stable "latest" URL resolves.

---

## [32.3.8] - 2026-05-28

Audit fixes (Claude audit + Gemini red-team). Backlog items 1, 2, 3, 4, 5, 7, 10.

### Fixed
- **Vote/temperature parse bug** - `parseInt(voteEl.textContent)` stopped at the first non-digit, collapsing `"1,234"` and `"1.2k"` to `1` and silently breaking rating highlight, `isGold`, and Sort-by-Rating for every hot deal. New `UtilsModule.parseHumanNumber` handles comma, `k`/`m` suffix, degree symbol, and preserves leading `+`/`-` sign (a downvoted deal stays negative).
- **Dead `.dealCard.sd-plus-hide` CSS rule** - The hide class is applied to the `<li>`, which never carries `.dealCard`, so the rule never matched. Retargeted to `.sd-plus-hide`. Inline `li.style.display` toggles retained (sort + badge count depend on them).
- **Feed observer bricked on slow loads** - The one-shot `waitForElement(dealFeed, 3000)` gate meant a cold load past 3s left the feed observer unattached for the whole session with no recovery. Now: attach immediately if the feed is present, else watch `document.body` until it appears, attach, and **disconnect the body observer immediately** (no session-long `subtree` observer on `body`). Nav-bar `waitForElement` timeout raised 3s → 10s.

### Security
- **Redirect bypass hardening** - `window.open(dest, '_blank', 'noopener,noreferrer')` closes the reverse-tabnabbing vector and drops the SD referrer. `extractDestinationUrl` now validates the decoded `u2` is an absolute `http:`/`https:` URL, blocking `javascript:`/`data:` schemes from being stored in `data-resolved-href` or opened.

### Platform
- **`@match` covers subdomains** - Replaced host-exact `https://slickdeals.net/*` with `*://slickdeals.net/*` + `*://*.slickdeals.net/*` (apex + subdomains, http→https).
- **`@noframes`** - Script no longer initializes inside the ad iframes SD injects.

### Refactor
- **Single `VERSION` constant** - Hoisted `const VERSION = '32.3.8'`; referenced at all in-code sites (diagnostic, init log, debug interface, load toast). The `==UserScript==` header `@name`/`@version` stay literals (Tampermonkey parses them statically).

### Deferred
- **Auto-update metadata (`@downloadURL`/`@updateURL`)** - The repo is public, so this is now viable, but the versioned-filename release convention (`...-v32.3.8.js` → archived next release) would break `@updateURL`. Deferred pending a stable-URL or release-asset strategy — *not* "no remote" as previously noted.

---

## [32.3.7] - 2026-02-25

### Fixed
- **Observer echo-loop gap** - `sdpProcessed` flag now set before class mutations to prevent re-entry
- **Decimal price truncation** - Changed `parseInt` to `parseFloat` for minPrice/maxPrice inputs
- **Toast queue loss** - Items stay in queue when container unavailable (body not ready)
- **Missing diagnostic field** - Added `includeKeywords` to `debugDump()` output
- **Debug toggle sync** - `debugMode` now synced to `localStorage.sdPlus_debug` on save
- **Double-fire on text fields** - `change` handler skips fields owned by debounced `input` handler
- **Broken sort option** - Removed "Newest" sort (relied on non-existent `sdpDate` data)
- **Wrong version comment** - Fixed `v32.3.6` → `v32.3.4` in reprocess retry comment

### Removed
- **Dead code: `resolveRedirectWithGM`** - Unused GM_xmlhttpRequest wrapper and grant
- **Dead code: `debouncedProcess`** - Unused debounced batch processor and `batchComplete` event
- **Dead code: `HAS_EXPIRED`** - Unused class definition and CSS rule
- **Attribute observer** - Simplified MutationObserver to `childList` only (attribute watching unnecessary)

---

## [32.3.6] - 2025-01-30

### Added
- **Include Keywords filter** - New textarea to show only deals matching any specified keyword (OR logic)
- Works alongside Block Keywords: deals must match include AND not match block

### Fixed
- **Include Keywords live update** - Filter now applies immediately as you type (was requiring page reload)

---

## [32.3.5] - 2025-01-30

### Added
- **Hidden deals badge** - Menu button now shows "X hidden" count instead of filter count
- Provides real-time feedback on how many deals are being filtered

---

## [32.3.4] - 2025-01-30

### Fixed
- **Reprocess race condition** - Added retry mechanism with coalescing when processing lock is active
- Prevents skipped reprocessing calls during initial page load

---

## [32.3.3] - 2025-01-30

### Added
- **Console Cleaner** - Suppresses ad iframe `postMessage` spam from console
- Auto-disables when debug mode is ON to show all errors during debugging

---

## [32.3.2] - 2025-01-30

### Added
- **Comprehensive diagnostic report** via Debug button and `window.sdPlus.dump()`
- Auto-diagnostic runs on page load when debug mode is enabled
- Shows: version, settings, DOM state, UI state, active filters

---

## [32.3.1] - 2025-01-30

### Fixed
- **Debug logging visibility** - Changed `console.debug` to `console.log` (was being filtered by browser)
- Removed corrupted emoji characters from debug output

---

## [32.3.0] - 2025-01-14

### Fixed
- **Observer Echo Loop** - Added processing lock to prevent unnecessary MutationObserver callbacks
- **Dual storage conflicts** - Fixed "zombie settings" issue where clearing one storage didn't clear the other

### Performance
- **Delta processing** - Observer now only processes newly added nodes instead of rescanning entire DOM

---

## [32.2.0] - 2025-01-09

### Fixed
- **Critical: Script initialization crash** - `safeExecute` now properly handles async functions with Promise rejection catching
- **Critical: Settings not applying on page load** - Added delayed reprocessing (500ms, 1500ms, 3000ms) to catch lazy-loaded deals
- **Critical: 308 deals never processed** - Slickdeals lazy-loads content that wasn't triggering MutationObserver
- **Settings persistence** - Now saves to both `GM_setValue` AND `localStorage` as backup
- **Console access** - Added `unsafeWindow.sdPlus` so debug interface is accessible from browser console (not just Tampermonkey sandbox)
- **Null guards everywhere** - `getSettings()` always returns defaults if settings object is null
- **Observer improvements** - Now watches subtree and attribute changes (class/style) to catch dynamically revealed deals

### Added
- Scroll listener to reprocess deals when user scrolls (triggers lazy-load processing)
- `window.sdPlus.version` property
- `window.sdPlus.reprocess()` function for manual reprocessing
- Toast queue limit (max 5) to prevent memory issues
- Structured logging with `log.info/warn/error/debug`

### Technical Notes
- The `postMessage: about:blank` console errors are from Slickdeals' ad iframes, NOT this script
- Script runs in Tampermonkey sandbox; `unsafeWindow` bridges to page context

---

## [32.1.1] - 2025-01-06

### Known Issues (Fixed in 32.2.0)
- Script crashes silently during init, `window.sdPlus` never defined
- Settings persist but filters don't apply on page load
- 300+ lazy-loaded deals never processed
- Debug interface not accessible from console due to context isolation

### Features Present
- 16+ filter options (price range, keywords, gold tier, free only, etc.)
- Deal highlighting (rating, discount, gold)
- Price difference display
- Ad blocking
- Redirect bypass
- Settings export/import
- Menu UI in header

---

## [32.1.0] and Earlier

Legacy versions - not documented. Settings stored under keys:
- `sdPlus_settings_v32`
- `sdPlus_settings_v31`
- `sdPlus_settings_v30`
- `sdPlus_settings_v28`

Migration from these keys is automatic.

---

## Upgrade Notes

### From 32.1.1 to 32.2.0
- No action required - settings migrate automatically
- If issues persist, use Debug button → check console for errors
- Nuclear option: Reset All in menu to clear settings

---

## Future Roadmap

### Planned Features
- [ ] Deal alerts (notify when criteria match)
- [ ] Price history tracking
- [ ] Bulk deal actions
- [ ] Filter presets (save/load filter combinations)

### Known Limitations
- Only works on slickdeals.net (no multi-site support)
- No cloud sync of settings
- Console spam from Slickdeals ads (mitigated by Console Cleaner in v32.3.3)
