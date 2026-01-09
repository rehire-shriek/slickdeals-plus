# Slickdeals+ Debug Guide

Quick reference for troubleshooting issues with Slickdeals+.

---

## Quick Diagnostics

Run these in Chrome DevTools Console (F12 → Console):

### 1. Is the script running?
```javascript
// Check if UI elements exist
document.getElementById('sdPlusNavMenu') !== null      // Menu button
document.getElementById('sdPlusStyles-static') !== null // CSS injected
document.getElementById('sdPlusToastContainer') !== null // Toast system
```

### 2. Is the debug interface accessible?
```javascript
window.sdPlus  // Should return object with version, settings, etc.
```

### 3. Are settings loading?
```javascript
window.sdPlus.settings.getSettings()  // Returns settings object
```

### 4. Are deals being processed?
```javascript
// Count unprocessed deals (should be 0 or very low)
document.querySelectorAll('.dealCardV3:not([data-sdp-processed]), .dealCard:not([data-sdp-processed]), [data-threadid]:not([data-sdp-processed])').length

// Count total deals
document.querySelectorAll('.dealCardV3, .dealCard, [data-threadid]').length

// Count gold deals
document.querySelectorAll('.isGold').length

// Count hidden deals
document.querySelectorAll('.sd-plus-hide').length
```

### 5. Force reprocess all deals
```javascript
window.sdPlus.reprocess()
```

---

## Common Issues

### Issue: `window.sdPlus` is undefined

**Causes:**
1. Script crashed during initialization
2. Context isolation (try switching console context dropdown from "top" to Tampermonkey)
3. Script not enabled in Tampermonkey

**Fix:**
- Check if menu exists: `document.getElementById('sdPlusNavMenu')`
- If menu exists but sdPlus undefined → context isolation issue (fixed in v32.2.0)
- If menu doesn't exist → script crashed or not running

---

### Issue: Settings don't persist after reload

**Diagnosis:**
```javascript
// Check current settings
window.sdPlus.settings.getSettings()

// Toggle a setting, then check storage
localStorage.getItem('sdPlus_settings_master')
```

**Causes:**
1. `GM_setValue` failing silently
2. localStorage blocked by browser
3. Settings saving but not loading

**Fix:**
- v32.2.0 saves to BOTH GM and localStorage
- Try Reset All → reconfigure settings

---

### Issue: Filters not applying on page load

**Diagnosis:**
```javascript
// Check unprocessed deals
document.querySelectorAll('[data-threadid]:not([data-sdp-processed])').length
```

**Causes:**
1. Slickdeals lazy-loads deals after script runs
2. MutationObserver not catching new deals

**Fix (v32.2.0):**
- Automatic delayed reprocessing at 500ms, 1500ms, 3000ms
- Scroll listener triggers reprocessing
- Manual: `window.sdPlus.reprocess()`

---

### Issue: Console flooded with postMessage errors

**Error:**
```
Uncaught SyntaxError: Failed to execute 'postMessage' on 'Window': Invalid target origin 'about:blank'
```

**Cause:** Slickdeals' ad iframes, NOT this script.

**Mitigation:**
- Filter console: type `-postMessage -about:blank` in filter box
- This doesn't affect script functionality

---

### Issue: Menu doesn't appear

**Diagnosis:**
```javascript
// Check if navbar exists
document.querySelector('ul.slickdealsHeader__linkSection')
```

**Causes:**
1. Slickdeals changed their DOM structure
2. Script running before page loads (shouldn't happen with `@run-at document-idle`)
3. CSS conflict hiding menu

**Fix:**
- Check if script is enabled
- Try hard refresh (Ctrl+Shift+R)
- Check for CSS conflicts in DevTools

---

## Storage Keys

| Key | Purpose |
|-----|---------|
| `sdPlus_settings_master` | Current settings (GM + localStorage) |
| `sdPlus_settings_v32` | Legacy (auto-migrated) |
| `sdPlus_settings_v31` | Legacy (auto-migrated) |
| `sdPlus_settings_v30` | Legacy (auto-migrated) |
| `sdPlus_settings_v28` | Legacy (auto-migrated) |
| `sdPlus_debug` | Set to `'true'` to enable debug logging |

---

## Enable Debug Logging

```javascript
localStorage.setItem('sdPlus_debug', 'true')
// Reload page - debug messages will appear in console
```

---

## DOM Selectors Used

If Slickdeals changes their site, these may need updating:

```javascript
// Critical selectors
navBar: 'ul.slickdealsHeader__linkSection'
dealFeed: 'ul.frontpageGrid, ul.cmsDealFeed__dealContainer'
dealCard: '.dealCardV3, .dealCard, [data-threadid]'
dealPrice: '.dealCardV3__price, .dealCard__price'
priceContainer: '.dealCardV3__priceContainer, .dealCard__priceContainer'
originalPrice: '.dealCardV3__originalPrice, .dealCard__originalPrice'
voteCount: '.dealCardSocialControls__voteCount'
dealBadge: '.dealCardBadge, .dealCardV3__badgeContainer'
dealTitle: 'a.dealCard__title, a.dealCardV3__title'
```

---

## Nuclear Reset

If everything is broken:

1. Disable script in Tampermonkey
2. Clear storage:
   ```javascript
   localStorage.removeItem('sdPlus_settings_master');
   ```
3. In Tampermonkey → Script → Storage tab → Delete all
4. Re-enable script
5. Reload page

---

## Reporting Bugs

When reporting issues, include:
1. Browser + version
2. Tampermonkey version
3. Script version (`window.sdPlus.version`)
4. URL where issue occurs
5. Console errors (filter out postMessage spam)
6. Results of Quick Diagnostics above
