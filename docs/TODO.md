# Slickdeals+ TODO

Active task tracking for bugs, improvements, and feature requests.

**Last Updated:** 2026-05-28
**Current Version:** 32.3.7

---

## 🔴 Critical (Blocking Issues)

*None currently*

---

## 🟡 Known Issues (Non-Blocking)

### Console Spam from Slickdeals Ads
- **Status:** Fixed (v32.3.3)
- **Description:** `postMessage: about:blank` errors flood console from ad iframes
- **Fix:** Console Cleaner (v32.3.3) suppresses ad iframe spam automatically
- **Notes:** Console Cleaner auto-disables when debug mode is ON

### Debug `dump()` Output Not Visible
- **Status:** Low priority
- **Description:** `window.sdPlus.dump()` logs to Tampermonkey sandbox console, not visible in page console
- **Workaround:** Use `window.sdPlus.settings.getSettings()` instead
- **Potential Fix:** Return object instead of console.log, or use `unsafeWindow.console`

---

## 🆕 v32.3.8 Audit Backlog (Claude audit + Gemini red-team, 2026-05-28)

Findings from a fresh code audit cross-checked against a Gemini red-team pass. Severity reflects our assessment after stress-testing both sets of claims (notes record where we overrode the auditor). Items 1–7 are a coherent "audit fixes" release candidate.

**Status:** Items **1, 2, 3, 4, 5, 7, 10 shipped in v32.3.8** and **6 shipped in v32.3.9** (2026-05-28). Items 8, 9, 11–15 remain open.

### HIGH — silent feature breakage

#### 1. Vote/temperature `parseInt` bug ✅ shipped v32.3.8
- **Location:** `processDealCard`, line ~1071 — `parseInt(el.voteEl?.textContent || '0', 10)`
- **Problem:** SD renders temperature as `"1,234"` or `"1.2k"`. `parseInt` stops at the first non-digit → both read as `1`. Silently breaks rating highlight, `isGold`, and Sort-by-Rating for every hot deal.
- **Fix (shipped):** Added `UtilsModule.parseHumanNumber`. Strip `°`/commas, then one regex `^([+-]?\d*\.?\d+)\s*([km])?` → `parseFloat`, ×1,000 / ×1,000,000 for `k`/`m`, `Math.round`, `0` on `NaN`. **Preserves the leading `+`/`-` sign** (Gemini red-team) so a downvoted (-N) deal doesn't read as positive and falsely clear the rating threshold.
- **Verify (still recommended):** Confirm one real `.dealCardSocialControls__voteCount` `textContent` from a live page — the parser is defensive across known formats regardless.

#### 2. Dead `.dealCard.sd-plus-hide` CSS rule ✅ shipped v32.3.8
- **Location:** STATIC_CSS line ~926 vs class applied to `<li>` at line ~1119
- **Problem:** Hide class goes on the `<li>`, but the only stylesheet rule targets `.dealCard.sd-plus-hide` — never matches. Hiding works *only* via the inline `li.style.display='none'` fallback; fragile to any refactor that trusts the CSS.
- **Fix:** Retarget rule to `li.sd-plus-hide` (or `.sd-plus-hide`) and drop reliance on inline style.

### MEDIUM — security / robustness / platform

#### 3. Redirect bypass: tabnabbing + no scheme check ✅ shipped v32.3.8
- **Location:** `processLinksInCard`, line ~1040 — `window.open(dest, '_blank')`
- **Problem:** No `noopener` (reverse tabnabbing — destination can navigate the SD tab); `dest` decoded from the `u2` param with no scheme validation.
- **Fix:** `window.open(dest, '_blank', 'noopener,noreferrer')` (noreferrer also suppresses the SD referrer, consistent with bypassing the tracker). Gate on `new URL(dest).protocol` being `http:`/`https:` before opening.

#### 4. `@match` misses subdomains ✅ shipped v32.3.8
- **Location:** metadata header
- **Problem:** `@match https://slickdeals.net/*` is host-exact — does not match `www.slickdeals.net`.
- **Fix (shipped):** Dual entry `// @match *://slickdeals.net/*` + `// @match *://*.slickdeals.net/*` (apex + subdomains, belt-and-suspenders across script managers, per Gemini).

#### 5. `@noframes` — stop running inside ad iframes ✅ shipped v32.3.8
- **Problem:** Without it, the full ~1,440-line script initializes (loads settings, attaches listeners) inside *every* ad iframe SD injects. This is the concrete lever for the long-standing "block ad iframes at source" TODO and reduces the need for the runtime `console.error` patch.
- **Fix:** Add `// @noframes` to the header.

#### 6. Auto-update metadata ✅ shipped v32.3.9 (headers added; release asset pending `gh release create`)
- **Problem:** No `@downloadURL`/`@updateURL` → installed users never receive any of the 32.3.x fixes automatically.
- **Background:** The repo IS public (`github.com/rehire-shriek/slickdeals-plus`), so this is viable — the original "git remote is empty / repo is local-only" deferral reason was **wrong** (the remote exists). The real blocker was the versioned-filename convention (`slickdeals-plus-v32.3.8.js` → moved to `archived files/` next release): a versioned raw URL in `@updateURL` would break on the very next version.
- **Decision (locked):** **Use a tagged GitHub Release asset**, not a raw-file URL. Each release attaches the script as `slickdeals-plus.user.js` (note the `.user.js` extension — required for Tampermonkey to recognize it as an installable/updatable userscript), and the metadata points at the stable `/releases/latest/download/` redirect, which always resolves to the newest release's asset. Chosen over a canonical raw file at repo root for cleaner provenance and real release artifacts; cost is a tag + `gh release create` step per release.
- **Header to add:**
  ```
  // @downloadURL https://github.com/rehire-shriek/slickdeals-plus/releases/latest/download/slickdeals-plus.user.js
  // @updateURL   https://github.com/rehire-shriek/slickdeals-plus/releases/latest/download/slickdeals-plus.user.js
  ```
- **Implementation steps (next release, e.g. v32.3.9):**
  1. Add the two header lines above to the current script (alongside `@version`).
  2. Tag the release commit: `git tag v32.3.9 && git push origin v32.3.9`.
  3. Publish with the asset named exactly `slickdeals-plus.user.js` (the filename the URL expects):
     `gh release create v32.3.9 "slickdeals-plus-v32.3.9.js#slickdeals-plus.user.js" --title "v32.3.9" --notes-file <changelog excerpt>`
     (the `#slickdeals-plus.user.js` suffix renames the uploaded asset so the stable URL resolves).
  4. Verify: open `https://github.com/rehire-shriek/slickdeals-plus/releases/latest/download/slickdeals-plus.user.js` in a browser — it should download the current script. Then in Tampermonkey, "Check for updates" should detect the version.
- **One-time note:** existing installs (installed from the local file, no `@updateURL`) will NOT auto-migrate — they have no update source. Users must reinstall once from the release asset to get onto the auto-update track. Worth a line in the README install section when this ships.
- **Workflow doc:** once adopted, fold the tag + `gh release create` steps into the standard release checklist (currently: bump version → archive old file → update docs → commit). Consider a small release script to automate steps 2–3.

#### 7. `waitForElement` hard 3s timeout (bricks slow loads) → prefer body-observer ✅ shipped v32.3.8
- **Location:** navBar `:619`, dealFeed `:1323`
- **Problem:** Cold load past 3s resolves `null` and the menu + feed observer never attach for the whole session, with no recovery.
- **Fix (shipped):** Feed — if present, attach the childList observer immediately; else watch `document.body` until `SELECTORS.dealFeed` appears, attach, then **`disconnect()` the body observer immediately** (per Gemini: never leave a session-long `subtree:true` observer on `body` — perf hazard on SD's ad-heavy/infinite-scroll DOM). Nav menu — `waitForElement(navBar)` timeout raised 3s → 10s; existing `navBarObserver` re-inserts on removal.
- **Note:** Did NOT build Gemini's throttled SPA-rebind layer. The original "also covers SPA nav" framing assumed client-side feed swaps; SD does full page loads (`@run-at document-idle` re-runs the script), and the existing interval (500/1500/3000ms) + scroll reprocessing already recovers card processing. Left as a separate item if SPA nav is ever confirmed.

#### 8. Missing `@grant unsafeWindow`
- **Location:** line ~1417 — `unsafeWindow.sdPlus = debugInterface` (guarded by `typeof`)
- **Problem:** Grant not declared. Under stricter managers (Violentmonkey, hardened Tampermonkey) `unsafeWindow` is `undefined`, so page-console exposure silently fails.
- **Severity note:** Gemini called this High / "silent crash." Overridden to **Medium** — the `typeof unsafeWindow !== 'undefined'` guard prevents any crash; `window.sdPlus` still works in the sandbox. Only page-console access is lost.
- **Fix:** Add `// @grant unsafeWindow`.

### LOW — correctness polish / maintainability

#### 9. `cloneNode` listener-purge pattern
- **Location:** `MenuModule.setupEventListeners`, line ~725
- **Problem:** Cloning the menu body to drop listeners is a hack. *Reframed from Gemini's "DOM thrashing/reflow" framing* — it runs once, so it's not a perf issue. Two real concerns: (a) listener hygiene (use `AbortController` or named handlers + `removeEventListener`); (b) **correctness risk** — `populateMenu()` runs *before* the clone; input/select have spec'd cloning steps that copy value/checkedness, but `<textarea>` does not, so Block/Include Keywords fields may render blank on menu open.
- **Action:** Verify textarea state survives the clone on a live page. If blank → real bug, fix order or stop cloning. Either way, migrate to `AbortController`.

#### 10. Single `VERSION` constant ✅ shipped v32.3.8
- **Problem:** `'32.3.7'` duplicated at lines ~6 (header), ~541, ~1404, ~1425 — already drifted once (v32.3.6→v32.3.4 comment fix last release). (The original audit list also missed the `log.info('Initializing v32.3.7...')` site at ~1214 and the `@name` header literal at ~2.)
- **Fix (shipped):** Hoisted `const VERSION = '32.3.8'`; referenced at all four in-code sites (diagnostic `:541`, init log `:1214`, debug interface `:1404`, load toast `:1425`). Header `@name` + `@version` stay literals (Tampermonkey parses the metadata block statically) — bumped by hand.

#### 11. Promoted detection brittle
- **Location:** line ~1088 — matches badge text `includes('promoted')` only
- **Problem:** SD also labels these "Sponsored." "Hide Promoted" misses them.
- **Fix:** Match both terms (and a `data-` attribute if one exists).

#### 12. Keyword matching word-boundaries
- **Location:** lines ~1110 / ~1115 — bare `.includes(k.trim())`
- **Problem:** Blocking `"used"` also hides `"m`**`used`**`"`, `"f`**`used`**`"`. Including `"pro"` matches `"`**`pro`**`duct"`.
- **Fix (optional):** Boundary-aware match (`\bword\b`) for short tokens. (Supersedes the older "Improve parsePrice Regex" note's scope — different field.)

#### 13. Debug-mode storage desync + unrestored `console.error`
- **Location:** `suppressAdErrors` IIFE, line ~84
- **Problem:** Reads `localStorage.sdPlus_debug` at the very top, but master settings load preferentially from `GM_getValue`. If localStorage is wiped but GM persists, the Console Cleaner's view of debug mode diverges from the UI's. Also `console.error` is monkey-patched globally and never restored.
- **Fix:** Read the debug flag from GM (with localStorage fallback); save a reference to the original `console.error` and expose a restore path (e.g., via `GM_registerMenuCommand`).

#### 14. Observer in-flight coverage gap
- **Location:** observer callback line ~1328
- **Problem:** The `isProcessing` boolean makes the observer *skip* mutations during a batch; cards injected mid-batch are only recovered by the next scroll event.
- **Fix (optional):** A "dirty" flag that re-runs a delta scan once the lock releases.

#### 15. `GM_registerMenuCommand` quick toggles
- **Enhancement:** Host Debug on/off and Reset in Tampermonkey's native menu — clean home for the debug toggle that currently lives only in `localStorage`.

---

## 🔥 Performance Fixes (From v32.2.0 Audit)

### HIGH PRIORITY

#### Observer Echo Loop (Self-Trigger Bug)
- **Status:** FIXED (v32.3.0)
- **Description:** MutationObserver watches `class` attribute changes, but our own `processDealCard` adds classes (`highlightRating`, `isGold`, etc.), causing unnecessary observer callbacks.

#### Delta Processing (Stop Full DOM Scans)
- **Status:** FIXED (v32.3.0)
- **Description:** `reprocessUnprocessed()` processes only new nodes from mutations instead of rescanning entire DOM.

### MEDIUM PRIORITY

#### Consolidate Storage Strategy
- **Status:** Partial fix (v32.3.0)
- **Description:** Currently writes to BOTH `GM_setValue` AND `localStorage`, reads GM first with localStorage fallback
- **Problem:** "Zombie Settings" - clearing one storage doesn't clear the other, no versioning to know which is authoritative
- **v32.3.0 Fix:** Read-path conflict (zombie reads) resolved — GM is authoritative for reads
- **Remaining:** Dual-write is still active. Full consolidation (single-write to GM, remove localStorage backup) is future work
- **Solution (future):**
  - Make `GM_setValue` the single source of truth
  - Use `localStorage` only for one-time migration (read old settings, save to GM, delete from localStorage)
  - Add timestamp to settings object for conflict resolution if needed

#### Improve parsePrice Regex
- **Status:** TODO
- **Description:** Current regex assumes specific currency formatting
- **Current Code:**
```javascript
const match = text.match(/[\d,]+(\.\d{2})?/);
return match ? parseFloat(match[0].replace(/,/g, '')) : NaN;
```
- **Problem:** Fragile with edge cases like "$1,200" or "€19,99" (European format)
- **Solution:** Clean string before parsing
```javascript
const cleaned = text.replace(/[^0-9.]/g, '');
return parseFloat(cleaned) || NaN;
```

### LOW PRIORITY

#### Gate Debug Exposure
- **Status:** TODO
- **Description:** `unsafeWindow.sdPlus` exposes internal API to host page by default
- **Risk:** Low (Slickdeals is not hostile), but violates best practices
- **Solution:** Only expose when debug mode is enabled
```javascript
if (localStorage.getItem('sdPlus_debug') === 'true') {
    unsafeWindow.sdPlus = debugInterface;
}
```

#### Evaluate IntersectionObserver for Lazy-Load
- **Status:** TODO (Research)
- **Description:** Current approach uses scroll listener + hardcoded timeouts (500ms, 1500ms, 3000ms)
- **Consideration:** IntersectionObserver could be cleaner for detecting when user scrolls to new content
- **Caveat:** SD uses "batch reveal" not true infinite scroll - need to verify IO would help
- **Decision:** Research only, don't over-engineer. Current solution works.

---

## 🟢 Planned Improvements

### Short Term (Next Release)

- [ ] **Add visible loading indicator** - Show spinner/text while deals are being processed on page load
- [ ] **Cache constant selectors** - Destructure SELECTORS at module scope to reduce property lookups
- [ ] **Improve "Deals You May Have Missed" handling** - Consider separate processing or exclusion option

### Medium Term

- [ ] **Filter presets** - Save/load named filter combinations (e.g., "Gaming Deals", "Free Stuff")
- [ ] **Per-category settings** - Different filters for different Slickdeals categories
- [ ] **Keyboard shortcuts** - Quick toggle for common filters
- [ ] **Dark mode support** - Detect/respect system dark mode preference

### Long Term (Feature Requests)

- [ ] **Deal alerts** - Browser notifications when deals match criteria
- [ ] **Price history tracking** - Store price changes over time, show lowest recorded
- [ ] **Bulk actions** - Select multiple deals to hide/save
- [ ] **Cloud sync** - Sync settings across browsers (would need backend)
- [ ] **Deal notes** - Add personal notes to deals

---

## 🔧 Technical Debt

- [x] **Reduce observer scope** - Removed `attributes: true` from MutationObserver (v32.3.7)
- [ ] **Data-attribute for debounced fields** - Replace hardcoded `['excludeKeywords', 'includeKeywords', 'minPrice', 'maxPrice']` skip-list in change handler with a `data-sdp-debounce="true"` attribute on elements, so new debounced fields are automatically excluded without updating the array
  - *Source: Loom audit v32.3.7 (Mild Preference)*
- [ ] **Consolidate debounce timers** - Document timing behavior of multiple debounces
- [ ] **Consolidate storage access** - Create unified storage module with consistent error handling
  - *Note: Related to "Consolidate Storage Strategy" above*
- [ ] **Add unit tests** - Test filter logic, settings validation separately
- [ ] **Minified production build** - Current file is ~1450 lines, could minify for performance
- [ ] **Improve selector resilience** - Add fallback chains and warnings when primary selectors fail

---

## ❌ Won't Do (Audit Items Rejected)

### Remote Config for Selectors
- **Auditor Suggestion:** Fetch selectors from remote JSON (GitHub Gist) to allow hot-fixes
- **Why Rejected:**
  - Network dependency (if GitHub down, script fails)
  - Security risk (supply chain attack vector)
  - Adds 100-500ms latency to init
  - Over-engineering for our use case
- **Alternative:** Use fallback selector chains + defensive logging

### Toast Memory Leak Fix
- **Auditor Suggestion:** Toasts could accumulate if browser throttles timers
- **Why Rejected:**
  - Already capped queue at 5 items
  - Toasts are tiny DOM elements
  - Unlikely to cause real issues in practice

---

## ✅ Completed (Move to CHANGELOG when released)

### v32.3.7 (2026-02-25) — Audit Fixes
- [x] Fix observer echo-loop gap (sdpProcessed set before class mutations)
- [x] Fix parseInt truncating decimal prices (use parseFloat)
- [x] Fix toast items silently discarded when body unavailable
- [x] Add includeKeywords to debugDump() diagnostic
- [x] Sync debugMode toggle to localStorage on save
- [x] Skip debounce-owned fields in change handler (prevent double-fire)
- [x] Remove broken "Newest" sort option
- [x] Simplify observer to childList only (removed attribute watching)
- [x] Remove dead code: resolveRedirectWithGM, GM_xmlhttpRequest grant
- [x] Remove dead code: debouncedProcess, batchComplete event wiring
- [x] Remove dead code: HAS_EXPIRED class definition and CSS

### v32.3.6 (2025-01-30)
- [x] Include Keywords filter (show only deals matching keywords, OR logic)

### v32.3.5 (2025-01-30)
- [x] Hidden deals badge (shows "X hidden" count in menu)

### v32.3.4 (2025-01-30)
- [x] Fix reprocess race condition (retry mechanism with coalescing)

### v32.3.3 (2025-01-30)
- [x] Console Cleaner (suppresses ad iframe postMessage spam)
- [x] Auto-disables when debug mode is ON

### v32.3.2 (2025-01-30)
- [x] Comprehensive diagnostic report via Debug button and window.sdPlus.dump()
- [x] Auto-diagnostic runs on page load when debug mode is enabled

### v32.3.1 (2025-01-30)
- [x] Debug logging visibility fix (console.debug → console.log)
- [x] Removed corrupted emoji from debug output

### v32.3.0 (2025-01-14)
- [x] Fix Observer Echo Loop (processing lock)
- [x] Implement Delta Processing (process only added nodes)
- [x] Fix dual storage strategy conflicts

### v32.2.0 (2025-01-09)
- [x] Fix async error handling in `safeExecute`
- [x] Fix settings not applying on page load
- [x] Fix 308 deals never processed (lazy-load issue)
- [x] Add `unsafeWindow` for console access
- [x] Add delayed reprocessing (500ms, 1500ms, 3000ms)
- [x] Add scroll listener for lazy-loaded content
- [x] Dual storage (GM + localStorage)

---

## 📝 Notes & Ideas

### Slickdeals DOM Observations
- Deals lazy-load in batches, not triggered by standard MutationObserver on feed
- "Deals You May Have Missed" section uses same card classes but different container
- Vote counts may load after initial card render (potential timing issue)

### Potential Selector Updates Needed
If Slickdeals updates their site, check these selectors:
```javascript
navBar: 'ul.slickdealsHeader__linkSection'
dealFeed: 'ul.frontpageGrid, ul.cmsDealFeed__dealContainer'
dealCard: '.dealCardV3, .dealCard, [data-threadid]'
```

### Ideas Parking Lot
- Integration with CamelCamelCamel for price history?
- Export filtered deals to CSV?
- "Deal score" combining votes + discount + age?

---

## 📊 Audit Summary (2025-01-09)

External technical review conducted. Key findings:

| Item | Auditor Severity | Our Assessment | Action |
|------|------------------|----------------|--------|
| Observer Echo Loop | High | Medium | Fix in v32.3.0 |
| Full DOM Rescans | High | High | Fix in v32.3.0 |
| Dual Storage Issue | Medium | Medium | Fix in v32.3.0 |
| Remote Config | Recommended | Over-engineering | Won't Do |
| unsafeWindow Exposure | Medium | Low | Fix (low priority) |
| IntersectionObserver | Recommended | Research | Evaluate |
| parsePrice Regex | Low | Low | TODO |
| Toast Memory Leak | Low | Non-issue | Won't Do |

**Next version (v32.3.0) focus:** Performance fixes from audit

---

## How to Use This File

1. **Adding items:** Put new issues/ideas in appropriate section with checkbox `- [ ]`
2. **In progress:** Add notes below the item
3. **Completed:** Check the box `- [x]` and move to "Completed" section
4. **Released:** Move from "Completed" to CHANGELOG.md with version number
