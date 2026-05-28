# Slickdeals+

A browser userscript enhancement for Slickdeals.net that provides advanced deal filtering, highlighting, and performance improvements.

## Current Version
**v32.3.9** (~1,511 lines)

## Features

### Filtering & Sorting
- **Include Keywords** - Show only deals matching specific keywords (OR logic)
- **Block Keywords** - Hide deals containing unwanted terms
- **Price Range** - Filter by min/max price
- **Gold Tier Only** - Show only highly rated deals
- **Free Only** - Show only free deals
- **Sort By** - Default, Discount %, or Rating
- **Hide Promoted** - Remove sponsored deals

### Display Enhancements
- **Price Difference Display** - Shows savings amount and percentage
- **Deal Highlighting** - Color-code deals by rating and discount
- **Price First Layout** - Option to show price before title
- **Hidden Deals Badge** - Shows "X hidden" count in menu button

### Performance & Cleanup
- **Ad Blocking** - Removes feed ads and clutter
- **Redirect Bypass** - Direct links to deal pages
- **Page Clutter Removal** - Hides sidebars and recommendations
- **Console Cleaner** - Suppresses ad iframe spam

### Settings Management
- Export/Import settings as JSON
- Debug diagnostic report
- All settings persist across sessions

## Installation

**Recommended (auto-updating, v32.3.9+):**
1. Install the [Tampermonkey](https://www.tampermonkey.net/) browser extension
2. Open the [latest release asset](https://github.com/rehire-shriek/slickdeals-plus/releases/latest/download/slickdeals-plus.user.js) — Tampermonkey detects the `.user.js` and prompts to install
3. Click "Install" — future versions update automatically via `@updateURL`

> Already running an older build installed from the repo file? It has no update source — reinstall once from the release asset above to get on the auto-update track.

**Manual (from the repo file):**
1. Install [Tampermonkey](https://www.tampermonkey.net/)
2. Open `slickdeals-plus-v32.3.9.js` and click "Install" (no auto-update)

## Usage

1. Visit [slickdeals.net](https://slickdeals.net)
2. Look for "Slickdeals+" in the navigation bar
3. Click to open the settings menu
4. Configure filters and display options

## Debug Mode

Enable debug logging:
```javascript
localStorage.setItem('sdPlus_debug', 'true');
```

Access debug interface in console:
```javascript
window.sdPlus.dump();      // Full diagnostic report (outputs to Tampermonkey sandbox console)
window.sdPlus.reprocess(); // Force reprocess all deals
```

> **Note:** `dump()` outputs to the Tampermonkey sandbox console, not the page console. Switch the console context dropdown to see it, or use `window.sdPlus.settings.getSettings()` which returns directly.

## Documentation

See `/docs` folder:
- [CHANGELOG.md](docs/CHANGELOG.md) - Version history
- [TODO.md](docs/TODO.md) - Planned features and known issues
- [DEBUG-GUIDE.md](docs/DEBUG-GUIDE.md) - Troubleshooting guide

## License

MIT
