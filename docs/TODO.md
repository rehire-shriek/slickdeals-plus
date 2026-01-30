# Slickdeals+ TODO

Active task tracking for bugs, improvements, and feature requests.

**Last Updated:** 2025-01-30  
**Current Version:** 32.3.6

---

## 🔴 Critical (Blocking Issues)

*None currently*

---

## 🟡 Known Issues (Non-Blocking)

### Console Spam from Slickdeals Ads
- **Status:** Won't fix (not our code)
- **Description:** `postMessage: about:blank` errors flood console from ad iframes
- **Workaround:** Filter console with `-postMessage -about:blank`
- **Notes:** 3 `about:blank` iframes detected on page load

### Debug `dump()` Output Not Visible
- **Status:** Low priority
- **Description:** `window.sdPlus.dump()` logs to Tampermonkey sandbox console, not visible in page console
- **Workaround:** Use `window.sdPlus.settings.getSettings()` instead
- **Potential Fix:** Return object instead of console.log, or use `unsafeWindow.console`

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
- **Status:** TODO
- **Description:** Currently writes to BOTH `GM_setValue` AND `localStorage`, reads GM first with localStorage fallback
- **Problem:** "Zombie Settings" - clearing one storage doesn't clear the other, no versioning to know which is authoritative
- **Solution:** 
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

- [x] **Hidden deals badge** - Show "X hidden" count (v32.3.5)
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

- [ ] **Reduce observer scope** - Test removing `attributes: true` from MutationObserver if not needed
  - *Note: Related to "Observer Echo Loop" fix above*
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

### v32.3.6 (2025-01-30)\n- [x] Include Keywords filter (show only deals matching keywords, OR logic)\n\n### v32.3.5 (2025-01-30)\n- [x] Hidden deals badge (shows \"X hidden\" count in menu)\n\n### v32.3.4 (2025-01-30)
- [x] Fix reprocess race condition (retry mechanism with coalescing)

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
| parsePrice Regex | Low | Low | Fix in v32.3.0 |
| Toast Memory Leak | Low | Non-issue | Won't Do |

**Next version (v32.3.0) focus:** Performance fixes from audit

---

## How to Use This File

1. **Adding items:** Put new issues/ideas in appropriate section with checkbox `- [ ]`
2. **In progress:** Add notes below the item
3. **Completed:** Check the box `- [x]` and move to "Completed" section
4. **Released:** Move from "Completed" to CHANGELOG.md with version number
