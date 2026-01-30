# Slickdeals+

A browser userscript enhancement for Slickdeals.net that provides advanced deal filtering, highlighting, and performance improvements.

## Current Version
**v32.3.6** (~1,470 lines)

## Features

### Filtering & Sorting
- **Include Keywords** - Show only deals matching specific keywords (OR logic)
- **Block Keywords** - Hide deals containing unwanted terms
- **Price Range** - Filter by min/max price
- **Gold Tier Only** - Show only highly rated deals
- **Free Only** - Show only free deals
- **Sort By** - Default, Newest, Discount %, or Rating
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

1. Install [Tampermonkey](https://www.tampermonkey.net/) browser extension
2. Click the script file (`slickdeals-plus-v32.3.6.js`)
3. Click "Install" when prompted

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
window.sdPlus.dump();    // Full diagnostic report
window.sdPlus.reprocess(); // Force reprocess all deals
```

## Documentation

See `/docs` folder:
- [CHANGELOG.md](docs/CHANGELOG.md) - Version history
- [TODO.md](docs/TODO.md) - Planned features and known issues
- [DEBUG-GUIDE.md](docs/DEBUG-GUIDE.md) - Troubleshooting guide

## License

MIT
