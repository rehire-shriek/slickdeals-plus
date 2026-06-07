// ==UserScript==
// @name         Slickdeals+ v33.0.0
// @namespace    V@no
// @description  Adds a dropdown menu with advanced filtering, highlighting, ad blocking, and price difference display.
// @match        *://slickdeals.net/*
// @match        *://*.slickdeals.net/*
// @version      33.0.0
// @license      MIT
// @run-at       document-idle
// @noframes
// @grant        GM_setValue
// @grant        GM_getValue
// @downloadURL  https://github.com/rehire-shriek/slickdeals-plus/releases/latest/download/slickdeals-plus.user.js
// @updateURL    https://github.com/rehire-shriek/slickdeals-plus/releases/latest/download/slickdeals-plus.user.js
// ==/UserScript==

/*
 * ============================================================================
 * TODO - Quick Reference (see TODO.md for full details)
 * ============================================================================
 * 
 * KNOWN ISSUES:
 * - [x] Console spam from Slickdeals ads (mitigated in v32.3.3 with Console Cleaner)
 * - [ ] dump() output not visible in page console (low priority)
 *
 * NEXT UP:
 * - [ ] Add loading indicator while processing deals
 * - [ ] Filter presets (save/load combinations)
 * - [ ] Block ad iframes from loading entirely (prevent zombie ads at source)
 *
 * CHANGELOG v33.0.0:
 * - [BREAKING-FIX] Slickdeals migrated the frontpage React → Vue/Nuxt 3, renaming every
 *   card CSS class. v32.3.9's hardcoded selectors all missed → script silently no-op'd.
 *   Retargeted dealCard/dealTitle/dealPrice/originalPrice/priceContainer to the Nuxt classes
 *   (.dealCardGrid / .dealCardVariant1__*), survivors-first ([data-threadid] anchor first).
 * - [Feature] API-enriched data layer — at init, fetch the 3 same-origin JSON deal endpoints
 *   (missed-deals, recommendation-carousel, promoted-content) → Map<threadId, deal>. Deal data
 *   (price/votes/discount/sponsored) is read from the structured API keyed by data-threadid.
 *   The JSON data contract survived the migration where the CSS classes did not.
 * - [Resilience] API is ENHANCEMENT-ONLY: any card with no API match (or if all fetches fail)
 *   falls back to DOM scraping with the new selectors → zero regression risk.
 * - [Feature] Real Sponsored/Promoted detection via dealCardBadge.variant === 'promoted'
 *   (closes backlog #11 — old text-match missed "Sponsored").
 * - [Fix] Price-first via CSS grid-area override — the Nuxt card is a named-area CSS grid
 *   (grid-area:title is pinned), so it's reordered by overriding grid-template-areas under
 *   html.priceFirst-enabled, not by moving DOM nodes. Toggles live with no reprocess.
 * - [Fix] showDiff badge was generated but clipped (price row overflow:hidden) — price row now
 *   overflow:visible/height:auto so the "($diff | %)" line shows.
 * - [Fix] Filters/promoted now hide via the wrapper (li OR the card itself) so the ~20 wrapper-less
 *   cards (carousel/banner slots with no <li>) stop slipping past goldTierOnly/free/keyword filters.
 * - [Fix] Hide Ads also removes banner/wallpaper slots — grid <li>s with obfuscated per-session
 *   classes and no [data-threadid] — via :not(:has([data-threadid])). Ad selector list refreshed.
 * - [Fix] CSS retargets — highlight bg is now class-agnostic ([data-sdp-processed].highlight*);
 *   showDiff badge + price flex retargeted to .dealCardVariant1__priceRow; title color to
 *   .dealCardGrid__title. Sorting + feed observer now iterate ALL frontpage grids (site renders two).
 * - [Debug] window.sdPlus.diag() — live card layout/selector/API probe; window.sdPlus.data — API map.
 * - [Deferred] Main-column widening (cosmetic) — new container class not captured; sidebar-hide works.
 *
 * CHANGELOG v32.3.9:
 * - [Feature] Auto-update — @downloadURL/@updateURL point at the GitHub Release "latest" asset
 *   (slickdeals-plus.user.js). Installed users now receive future versions automatically.
 *   NOTE: requires a one-time reinstall from the release asset to get onto the update track.
 *
 * CHANGELOG v32.3.8:
 * - [Fix] Vote/temperature parse — parseHumanNumber handles "1,234"/"1.2k"/"1,234°"/+-signs (was parseInt → 1)
 * - [Fix] Dead .dealCard.sd-plus-hide CSS rule retargeted to .sd-plus-hide (class lives on <li>)
 * - [Security] Redirect bypass: window.open noopener,noreferrer + http(s)-only scheme check on u2
 * - [Platform] @match now covers subdomains (www.) + http→https; added @noframes (skip ad iframes)
 * - [Fix] Feed observer no longer bricked by 3s timeout — body-observer attaches + self-disconnects
 * - [Cleanup] Single VERSION constant (header @name/@version stay literal)
 *
 * CHANGELOG v32.3.7:
 * - [Fix] Observer echo-loop gap — sdpProcessed set before class mutations
 * - [Fix] parseFloat for decimal price inputs (was parseInt truncating)
 * - [Fix] Toast queue items preserved when body unavailable
 * - [Fix] includeKeywords added to debugDump() diagnostic
 * - [Fix] Debug toggle synced to localStorage on save
 * - [Fix] Removed broken "Newest" sort option
 * - [Fix] Simplified observer to childList only (removed attribute watching)
 * - [Cleanup] Removed dead code: resolveRedirectWithGM, debouncedProcess, HAS_EXPIRED
 *
 * CHANGELOG v32.3.6:
 * - [Feature] Include Keywords filter - show only deals matching any keyword (OR logic)
 * - Works with Block Keywords: deal must match include AND not match block
 * 
 * CHANGELOG v32.3.5:
 * - [Feature] Hidden deals badge - Shows "X hidden" count in menu button
 * 
 * CHANGELOG v32.3.4:
 * - [Fix] Reprocess race condition - retries with coalescing when lock is active
 * 
 * CHANGELOG v32.3.3:
 * - [Feature] Console Cleaner - suppresses ad iframe postMessage spam
 * - [Note] Console Cleaner auto-disables when debug mode is ON (see all errors when debugging)
 * 
 * CHANGELOG v32.3.2:
 * - [Feature] Comprehensive diagnostic report via Debug button and window.sdPlus.dump()
 * - [Feature] Auto-diagnostic runs on page load when debug mode is enabled
 * - [Feature] Diagnostic shows: version, settings, DOM state, UI state, active filters
 * 
 * CHANGELOG v32.3.1:
 * - [Fix] Debug logging now uses console.log instead of console.debug (was being filtered)
 * - [Fix] Removed corrupted emoji from debug output
 * 
 * CHANGELOG v32.3.0:
 * - [Fix] Observer Echo Loop - added processing lock to prevent unnecessary callbacks
 * - [Performance] Delta processing - observer now only processes newly added nodes
 * 
 * LAST UPDATED: 2026-05-28
 * ============================================================================
 */

(function () {
    'use strict';

    // Single source of truth for the version string. The ==UserScript== header
    // (@name / @version) stays a literal because Tampermonkey parses it statically.
    const VERSION = '33.0.0';

    // ============================================
    // CONSOLE CLEANER - Suppress Ad-Tech Spam
    // Filters out postMessage errors from zombie ad iframes
    // Auto-disables when debug mode is ON (to see all errors)
    // ============================================
    (function suppressAdErrors() {
        try {
            // Skip if debug mode is on - show all errors when debugging
            if (localStorage.getItem('sdPlus_debug') === 'true') {
                console.log('[Slickdeals+] Console Cleaner disabled (debug mode ON)');
                return;
            }

            const origError = console.error;
            console.error = function (...args) {
                // Filter out the specific zombie ad errors
                if (args.length > 0 && typeof args[0] === 'string') {
                    const msg = args[0];
                    if (msg.includes('postMessage') ||
                        msg.includes('Invalid target origin') ||
                        msg.includes("about:blank")) {
                        return; // Suppress ad iframe spam
                    }
                }
                // Allow all other errors through
                origError.apply(console, args);
            };
        } catch { /* ignore errors in the error handler */ }
    })();

    // ============================================
    // SAFE LOGGING - Won't spam console
    // ============================================
    const LOG_PREFIX = '[Slickdeals+]';
    const log = {
        info: (...args) => console.log(LOG_PREFIX, ...args),
        warn: (...args) => console.warn(LOG_PREFIX, ...args),
        error: (...args) => console.error(LOG_PREFIX, ...args),
        debug: (...args) => {
            // Only log debug if debugMode is enabled
            // Using console.log instead of console.debug so messages are visible
            try {
                const debugEnabled = localStorage.getItem('sdPlus_debug');
                if (debugEnabled === 'true') console.log(LOG_PREFIX, '[DEBUG]', ...args);
            } catch { /* ignore */ }
        }
    };

    // ============================================
    // BUG FIX #1: Proper async error handling
    // ============================================
    const safeExecute = async (fn, name) => {
        try {
            const result = fn();
            // Handle both sync and async functions
            if (result && typeof result.then === 'function') {
                await result;
            }
        } catch (e) {
            log.error(`Error in ${name}:`, e);
        }
    };

    // ============================================
    // MODULE: Toast Notifications (SAFE)
    // ============================================
    const ToastModule = (function () {
        let toastContainer = null;
        let toastQueue = [];
        let isProcessing = false;

        function ensureContainer() {
            try {
                if (toastContainer && document.body && document.body.contains(toastContainer)) {
                    return toastContainer;
                }
                if (!document.body) {
                    return null;
                }
                // Check if container already exists (from previous run)
                const existing = document.getElementById('sdPlusToastContainer');
                if (existing) {
                    toastContainer = existing;
                    return toastContainer;
                }
                toastContainer = document.createElement('div');
                toastContainer.id = 'sdPlusToastContainer';
                toastContainer.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
                document.body.appendChild(toastContainer);
                return toastContainer;
            } catch (e) {
                log.error('Toast container error:', e);
                return null;
            }
        }

        function processQueue() {
            if (isProcessing || toastQueue.length === 0) return;
            isProcessing = true;

            const container = ensureContainer();

            if (!container) {
                isProcessing = false;
                // Retry queue after delay if body not ready
                if (!document.body) {
                    setTimeout(processQueue, 200);
                }
                return;
            }

            const { message, type, duration } = toastQueue.shift();

            try {
                const toast = document.createElement('div');
                const colors = { info: '#2196F3', success: '#4CAF50', warning: '#FF9800', error: '#f44336' };
                toast.style.cssText = `padding:12px 20px;border-radius:6px;font-family:Arial,sans-serif;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.2);background-color:${colors[type] || colors.info};color:#fff;opacity:0;transform:translateX(100%);transition:all 0.3s ease;pointer-events:auto;`;
                toast.textContent = message;
                container.appendChild(toast);

                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        toast.style.opacity = '1';
                        toast.style.transform = 'translateX(0)';
                    });
                });

                setTimeout(() => {
                    toast.style.opacity = '0';
                    toast.style.transform = 'translateX(100%)';
                    setTimeout(() => {
                        if (toast.parentNode) toast.remove();
                        isProcessing = false;
                        processQueue(); // Process next in queue
                    }, 300);
                }, duration);
            } catch (e) {
                log.error('Toast display error:', e);
                isProcessing = false;
            }
        }

        function show(message, type = 'info', duration = 3000) {
            // Limit queue size to prevent memory issues
            if (toastQueue.length < 5) {
                toastQueue.push({ message, type, duration });
            }
            processQueue();
        }

        return { show };
    })();

    // ============================================
    // MODULE: Constants
    // ============================================
    const ConstantsModule = (function () {
        const SELECTORS = {
            navBar: 'ul.slickdealsHeader__linkSection',
            sideColumn: '#sideColumn, aside.slickdealsSidebar',
            mainContent: '#mainColumn, main.redesignFrontpageDesktop__main',
            pageGrid: '.redesignFrontpageDesktop',
            clutterElements: ['#sideColumn', 'aside.slickdealsSidebar', '[data-section-title="Just For You"]', '.frontpageRecommendationCarousel', '.justForYouCarousel', '.dealAlertsForYou', 'li.dealAlertsForYou'],
            ads: ["#crt-adblock-a", "#crt-adblock-b", ".frontpageGrid__bannerAd", ".ad", ".variableWidthAd", ".variableHeightAd", ".frontpageAd__middleBanner", "[data-googleQueryId]", ".adunit", "[data-adlocation]", '[id^="google_ads"]'],
            dealFeed: 'ul.frontpageGrid, ul.cmsDealFeed__dealContainer',
            // Nuxt migration (2026-06): card classes were renamed wholesale. Selectors are
            // survivors-first — the [data-threadid] attribute anchor is the only thing that
            // reliably survived, so it leads. Legacy classes are kept as multi-gen fallbacks
            // so the script still finds cards if SD reverts or A/B-tests the old markup.
            dealCard: '[data-threadid], .dealCardGrid, .dealCardV3, .dealCard',
            dealCardContent: '.dealCardGrid__content, .dealCard__content, .dealCardV3__mainContent',
            dealPrice: '.dealCardVariant1__finalPrice, .dealCardV3__price, .dealCard__price',
            originalPrice: '.dealCardVariant1__listPrice, .dealCardV3__originalPrice, .dealCard__originalPrice',
            voteCount: '.dealCardSocialControls__voteCount',
            dealBadge: '.dealCardBadge, .dealCardV3__badgeContainer',
            priceContainer: 'a.dealCardVariant1__priceRow, .dealCardV3__priceContainer, .dealCard__priceContainer',
            dealTitle: 'a.dealCardGrid__title, a.dealCard__title, a.dealCardV3__title'
        };
        const CLASS_NAMES = {
            HIGHLIGHT_RATING: 'highlightRating',
            HIGHLIGHT_DIFF: 'highlightDiff',
            HIGHLIGHT_BOTH: 'highlightBoth',
            IS_FREE: 'isFree',
            IS_PROMOTED: 'isPromoted',
            IS_GOLD: 'isGold',
            HIDE: 'sd-plus-hide',
            HAS_PROMOTED: 'sdp-has-promoted',
        };
        const DEFAULTS = {
            hidePageClutter: true,
            hideFeedAds: true,
            hidePromoted: false,
            showDiff: true,
            priceFirst: true,
            bypassRedirects: true,
            freeOnly: false,
            goldTierOnly: false,
            sortBy: 'default',
            minPrice: '',
            maxPrice: '',
            excludeKeywords: '',
            includeKeywords: '',
            highlightRating: 40,
            highlightDiff: 50,
            colorRatingBG: '#dff0d8',
            colorDiffBG: '#d9edf7',
            colorBothBG: '#FFF9C4',
            debugMode: false
        };
        return { SELECTORS, CLASS_NAMES, DEFAULTS };
    })();

    // ============================================
    // MODULE: Validation
    // ============================================
    const ValidationModule = (function () {
        function isValidHexColor(str) {
            return typeof str === 'string' && /^#[0-9A-Fa-f]{6}$/.test(str);
        }
        function validateSettings(imported, defaults) {
            const validated = {}, warnings = [];
            if (typeof imported !== 'object' || imported === null) {
                return { settings: { ...defaults }, isValid: false, errors: ['Invalid object'], warnings: [] };
            }
            for (const key of Object.keys(defaults)) {
                if (!(key in imported)) {
                    validated[key] = defaults[key];
                    continue;
                }
                if (typeof imported[key] !== typeof defaults[key]) {
                    warnings.push(`${key} wrong type`);
                    validated[key] = defaults[key];
                    continue;
                }
                if (key.startsWith('color') && !isValidHexColor(imported[key])) {
                    warnings.push(`${key} invalid color`);
                    validated[key] = defaults[key];
                    continue;
                }
                validated[key] = imported[key];
            }
            return { settings: validated, isValid: true, errors: [], warnings };
        }
        function sanitizeColor(color, fallback) {
            return isValidHexColor(color) ? color : fallback;
        }
        return { isValidHexColor, validateSettings, sanitizeColor };
    })();

    // ============================================
    // MODULE: Utilities
    // ============================================
    const UtilsModule = (function () {
        function waitForElement(selector, parent = document, timeout = 3000) {
            return new Promise(resolve => {
                try {
                    const el = parent.querySelector(selector);
                    if (el) return resolve(el);

                    const observer = new MutationObserver(() => {
                        try {
                            const foundEl = parent.querySelector(selector);
                            if (foundEl) {
                                observer.disconnect();
                                resolve(foundEl);
                            }
                        } catch (e) {
                            observer.disconnect();
                            resolve(null);
                        }
                    });
                    observer.observe(parent, { childList: true, subtree: true });
                    setTimeout(() => {
                        observer.disconnect();
                        resolve(null);
                    }, timeout);
                } catch (e) {
                    log.error('waitForElement error:', e);
                    resolve(null);
                }
            });
        }

        function parsePrice(text) {
            if (!text) return NaN;
            try {
                text = String(text).trim().toLowerCase();
                if (text.includes('free')) return 0;
                const match = text.match(/[\d,]+(\.\d{2})?/);
                return match ? parseFloat(match[0].replace(/,/g, '')) : NaN;
            } catch {
                return NaN;
            }
        }

        // SD renders vote/temperature as "1,234", "1.2k", "1,234°", or signed "+45" / "-12".
        // parseInt stopped at the first non-digit, collapsing "1,234" and "1.2k" to 1 and
        // silently breaking rating highlight, isGold, and Sort-by-Rating. Defensive across
        // known formats; preserves the leading sign so a downvoted (-N) deal stays negative.
        function parseHumanNumber(text) {
            if (!text) return 0;
            try {
                const cleaned = String(text).trim().toLowerCase().replace(/°/g, '').replace(/,/g, '');
                const m = cleaned.match(/^([+-]?\d*\.?\d+)\s*([km])?/);
                if (!m) return 0;
                let n = parseFloat(m[1]);
                if (isNaN(n)) return 0;
                if (m[2] === 'k') n *= 1000;
                else if (m[2] === 'm') n *= 1000000;
                return Math.round(n);
            } catch {
                return 0;
            }
        }

        function debounce(fn, ms) {
            let t;
            return (...a) => {
                clearTimeout(t);
                t = setTimeout(() => fn(...a), ms);
            };
        }

        function processInBatches(items, processFn, batchSize = 15, delay = 50) {
            return new Promise(resolve => {
                if (!items || items.length === 0) {
                    resolve();
                    return;
                }
                let i = 0;
                function chunk() {
                    try {
                        const end = Math.min(i + batchSize, items.length);
                        for (; i < end; i++) {
                            try {
                                processFn(items[i]);
                            } catch (e) {
                                log.debug('Batch item error:', e);
                            }
                        }
                        if (i < items.length) {
                            setTimeout(chunk, delay);
                        } else {
                            resolve();
                        }
                    } catch (e) {
                        log.error('Batch processing error:', e);
                        resolve();
                    }
                }
                setTimeout(chunk, 0);
            });
        }
        return { waitForElement, parsePrice, parseHumanNumber, debounce, processInBatches };
    })();

    // ============================================
    // MODULE: Link Resolution
    // ============================================
    const LinkResolutionModule = (function () {
        const TRACKING_PARAMS = ['pno', 'sdtid', 'tid', 'pcoid', 'lno', 'u2'];

        function isTrackingLink(url) {
            if (!url) return false;
            try {
                const u = new URL(url);
                if (!u.hostname.includes('slickdeals.net')) return false;
                if (u.pathname.startsWith('/f/') || u.pathname.startsWith('/g/') || u.pathname === '/click') return true;
                return TRACKING_PARAMS.some(p => u.searchParams.has(p));
            } catch {
                return false;
            }
        }

        function extractDestinationUrl(url) {
            try {
                const u2 = new URL(url).searchParams.get('u2');
                if (!u2) return null;
                const dest = decodeURIComponent(u2);
                // Only accept absolute http(s) destinations. Blocks javascript:/data: (and any
                // other scheme) from being stored in data-resolved-href or window.open()ed. A
                // relative or malformed u2 throws here and is dropped — we don't bypass to
                // same-site paths anyway. Caller (processLinksInCard) is also try/catch-wrapped.
                const parsed = new URL(dest);
                if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
                return dest;
            } catch {
                return null;
            }
        }

        return { isTrackingLink, extractDestinationUrl };
    })();

    // ============================================
    // MODULE: Deal Data (v33.0.0 — API enrichment)
    // ============================================
    // The Nuxt migration renamed every card class but left the JSON deal API intact. We fetch
    // the same 3 same-origin endpoints the page itself calls (so they're HTTP-cached and cheap)
    // and key every deal by threadId. Processing reads structured fields (exact discount, numeric
    // votes, real "promoted" badge) from here first, falling back to DOM scraping when a card has
    // no API match. Enhancement-only: if every fetch fails, the map is empty and the script still
    // works entirely off the DOM — zero regression risk.
    function DataModule() {
        const dealMap = new Map(); // String(threadId) -> deal object

        // Each endpoint wraps its deals differently; normalize to a flat array.
        const ENDPOINTS = [
            '/web-api/frontpage/missed-deals/?isReturningVisitor=true&showExpired=true', // { deals: [...] }
            '/frontpage/recommendation-carousel/recommendations?count=20&useForYouBadge=1&useFrontpageBadge=0&useCategoryBadge=0&nuxt=1', // { jfyDeals: [...] }
            '/frontpage/promoted-content/json?nuxt=1' // [ ... ] (bare array)
        ];

        function extractDeals(json) {
            if (Array.isArray(json)) return json;
            if (json && Array.isArray(json.deals)) return json.deals;
            if (json && Array.isArray(json.jfyDeals)) return json.jfyDeals;
            return [];
        }

        async function fetchEndpoint(url) {
            try {
                const res = await fetch(url, {
                    credentials: 'same-origin',
                    headers: { 'Accept': 'application/json' }
                });
                if (!res.ok) {
                    log.debug('DataModule non-OK response:', res.status, url);
                    return [];
                }
                return extractDeals(await res.json());
            } catch (e) {
                log.debug('DataModule fetch failed:', url, e);
                return [];
            }
        }

        async function load() {
            try {
                const results = await Promise.all(ENDPOINTS.map(fetchEndpoint));
                let rows = 0;
                results.forEach(deals => deals.forEach(d => {
                    if (d && d.threadId != null) {
                        dealMap.set(String(d.threadId), d);
                        rows++;
                    }
                }));
                log.info(`Deal data: ${dealMap.size} unique deals from API (${rows} rows fetched)`);
            } catch (e) {
                log.warn('DataModule load error (DOM fallback active):', e);
            }
        }

        return {
            load,
            lookup: id => (id == null ? undefined : dealMap.get(String(id))),
            count: () => dealMap.size
        };
    }

    // ============================================
    // MODULE: Settings (BUG FIX #4 - Null guards)
    // ============================================
    function SettingsModule() {
        let settings = null;
        let originalPosCounter = 0;
        const STORAGE_KEY = 'sdPlus_settings_master';
        const LEGACY_KEYS = ['sdPlus_settings_v32', 'sdPlus_settings_v31', 'sdPlus_settings_v30', 'sdPlus_settings_v28'];

        function loadSettings() {
            log.info('Loading settings...');
            let raw = null, migratedFrom = null;

            try {
                // Try GM_getValue first
                if (typeof GM_getValue === 'function') {
                    raw = GM_getValue(STORAGE_KEY);
                }

                // Fallback to localStorage
                if (!raw) {
                    try {
                        raw = localStorage.getItem(STORAGE_KEY);
                    } catch { /* localStorage may be blocked */ }
                }

                // Try legacy keys
                if (!raw) {
                    for (const oldKey of LEGACY_KEYS) {
                        try {
                            const oldData = typeof GM_getValue === 'function' ? GM_getValue(oldKey) : localStorage.getItem(oldKey);
                            if (oldData) {
                                raw = oldData;
                                migratedFrom = oldKey;
                                break;
                            }
                        } catch { /* ignore */ }
                    }
                }

                if (raw) {
                    const parsed = JSON.parse(raw);
                    const validation = ValidationModule.validateSettings(parsed, ConstantsModule.DEFAULTS);
                    settings = validation.settings;
                    log.info('Settings loaded:', Object.keys(settings).length, 'keys');
                    if (migratedFrom) {
                        saveSettings();
                        // Delay toast to avoid init issues
                        setTimeout(() => ToastModule.show('Settings migrated', 'success', 2000), 1000);
                    }
                } else {
                    settings = { ...ConstantsModule.DEFAULTS };
                    log.info('Using defaults');
                    saveSettings();
                }
            } catch (e) {
                log.error('Load error:', e);
                settings = { ...ConstantsModule.DEFAULTS };
            }

            // CRITICAL: Ensure settings is never null
            if (!settings) {
                settings = { ...ConstantsModule.DEFAULTS };
            }
        }

        function saveSettings() {
            if (!settings) {
                log.warn('Cannot save - settings is null');
                return;
            }
            try {
                const json = JSON.stringify(settings);

                // Save to GM storage
                if (typeof GM_setValue === 'function') {
                    GM_setValue(STORAGE_KEY, json);
                }

                // Also save to localStorage as backup
                try {
                    localStorage.setItem(STORAGE_KEY, json);
                } catch { /* localStorage may be blocked */ }

                // Sync debug toggle to localStorage for pre-init access
                try { localStorage.setItem('sdPlus_debug', String(settings.debugMode)); } catch {}

                log.debug('Settings saved');
            } catch (e) {
                log.error('Save error:', e);
            }
        }

        function getSettings() {
            if (!settings) loadSettings();
            // Double-check: return defaults if still null
            return settings || { ...ConstantsModule.DEFAULTS };
        }

        return {
            loadSettings,
            saveSettings,
            getSettings,
            getOriginalPosCounter: () => originalPosCounter++,
            debugDump: () => {
                console.log('='.repeat(60));
                console.log('[Slickdeals+] DIAGNOSTIC REPORT');
                console.log('='.repeat(60));
                console.log('[Slickdeals+] Version:', VERSION);
                console.log('[Slickdeals+] Timestamp:', new Date().toISOString());
                console.log('[Slickdeals+] URL:', window.location.href);
                console.log('-'.repeat(60));

                // Settings
                console.log('[Slickdeals+] SETTINGS:');
                console.log('[Slickdeals+]   Current settings object:', settings);
                console.log('[Slickdeals+]   GM_getValue available:', typeof GM_getValue === 'function');
                if (typeof GM_getValue === 'function') {
                    try {
                        console.log('[Slickdeals+]   GM storage raw:', GM_getValue(STORAGE_KEY));
                    } catch (e) {
                        console.log('[Slickdeals+]   GM storage error:', e.message);
                    }
                }
                try {
                    console.log('[Slickdeals+]   localStorage raw:', localStorage.getItem(STORAGE_KEY));
                    console.log('[Slickdeals+]   Debug mode:', localStorage.getItem('sdPlus_debug'));
                } catch (e) {
                    console.log('[Slickdeals+]   localStorage error:', e.message);
                }
                console.log('-'.repeat(60));

                // DOM State
                console.log('[Slickdeals+] DOM STATE:');
                const allCards = document.querySelectorAll('.dealCardV3, .dealCard, [data-threadid]');
                const processedCards = document.querySelectorAll('[data-sdp-processed]');
                const unprocessedCards = document.querySelectorAll('.dealCardV3:not([data-sdp-processed]), .dealCard:not([data-sdp-processed]), [data-threadid]:not([data-sdp-processed])');
                const hiddenCards = document.querySelectorAll('.sd-plus-hide');
                const goldCards = document.querySelectorAll('.isGold');
                console.log('[Slickdeals+]   Total deal cards:', allCards.length);
                console.log('[Slickdeals+]   Processed cards:', processedCards.length);
                console.log('[Slickdeals+]   Unprocessed cards:', unprocessedCards.length);
                console.log('[Slickdeals+]   Hidden cards:', hiddenCards.length);
                console.log('[Slickdeals+]   Gold deals:', goldCards.length);
                console.log('-'.repeat(60));

                // UI State
                console.log('[Slickdeals+] UI STATE:');
                console.log('[Slickdeals+]   Menu exists:', !!document.getElementById('sdPlusNavMenu'));
                console.log('[Slickdeals+]   Static CSS exists:', !!document.getElementById('sdPlusStyles-static'));
                console.log('[Slickdeals+]   Dynamic CSS exists:', !!document.getElementById('sdPlusStyles-dynamic'));
                console.log('[Slickdeals+]   Toast container exists:', !!document.getElementById('sdPlusToastContainer'));
                console.log('[Slickdeals+]   Feed element exists:', !!document.querySelector('ul.frontpageGrid, ul.cmsDealFeed__dealContainer'));
                console.log('-'.repeat(60));

                // Active Filters
                console.log('[Slickdeals+] ACTIVE FILTERS:');
                if (settings) {
                    const filters = [];
                    if (settings.freeOnly) filters.push('freeOnly');
                    if (settings.goldTierOnly) filters.push('goldTierOnly');
                    if (settings.hidePromoted) filters.push('hidePromoted');
                    if (settings.minPrice) filters.push(`minPrice: $${settings.minPrice}`);
                    if (settings.maxPrice) filters.push(`maxPrice: $${settings.maxPrice}`);
                    if (settings.excludeKeywords) filters.push(`excludeKeywords: "${settings.excludeKeywords}"`);
                    if (settings.includeKeywords) filters.push(`includeKeywords: "${settings.includeKeywords}"`);
                    if (settings.sortBy !== 'default') filters.push(`sortBy: ${settings.sortBy}`);
                    console.log('[Slickdeals+]   Active:', filters.length > 0 ? filters.join(', ') : 'None');
                }
                console.log('='.repeat(60));

                return 'Diagnostic report printed above. Copy and share if reporting issues.';
            }
        };
    }

    // ============================================
    // MODULE: Menu
    // ============================================
    function MenuModule(context) {
        let navBarObserver = null;
        let documentClickHandler = null;
        let documentKeydownHandler = null;

        async function createMenu() {
            try {
                // 10s (was 3s): nav bar can render past 3s on a cold load. If it still
                // misses, navBarObserver below re-inserts the menu when the bar appears.
                const navBar = await UtilsModule.waitForElement(ConstantsModule.SELECTORS.navBar, document, 10000);
                if (!navBar) {
                    log.warn('Navigation bar not found - menu not created');
                    return;
                }

                const insertMenu = () => {
                    try {
                        if (document.getElementById('sdPlusNavMenu')) return;
                        const menuHTML = `<li class="slickdealsHeader__link slickdealsHeaderLink" id="sdPlusNavMenu">
                            <div class="sd-plus-menu-button">Slickdeals+</div>
                            <div id="sdPlusMenuDropdown" class="sd-plus-menu-dropdown">
                                <div id="sdPlusMenuBody">
                                    <div class="sd-plus-section collapsed"><div class="sd-plus-header">Display & Layout <span class="arrow">&#9660;</span></div><div class="sd-plus-content">
                                        <label class="switch-row"><span>Hide Page Clutter</span><input type="checkbox" data-setting="hidePageClutter" class="sd-switch-input"><span class="sd-switch-slider"></span></label>
                                        <label class="switch-row"><span>Hide Ads</span><input type="checkbox" data-setting="hideFeedAds" class="sd-switch-input"><span class="sd-switch-slider"></span></label>
                                        <label class="switch-row"><span>Hide Promoted</span><input type="checkbox" data-setting="hidePromoted" class="sd-switch-input"><span class="sd-switch-slider"></span></label>
                                        <label class="switch-row"><span>Price First</span><input type="checkbox" data-setting="priceFirst" class="sd-switch-input"><span class="sd-switch-slider"></span></label>
                                        <label class="switch-row"><span>Show Price Diff</span><input type="checkbox" data-setting="showDiff" class="sd-switch-input"><span class="sd-switch-slider"></span></label>
                                        <label class="switch-row"><span>Bypass Redirects</span><input type="checkbox" data-setting="bypassRedirects" class="sd-switch-input"><span class="sd-switch-slider"></span></label>
                                    </div></div>
                                    <div class="sd-plus-section"><div class="sd-plus-header">Filters & Sort <span class="arrow">&#9660;</span></div><div class="sd-plus-content">
                                        <label class="switch-row"><span>Show Free Only</span><input type="checkbox" data-setting="freeOnly" class="sd-switch-input"><span class="sd-switch-slider"></span></label>
                                        <label class="switch-row"><span>Gold Tier Only</span><input type="checkbox" data-setting="goldTierOnly" class="sd-switch-input"><span class="sd-switch-slider"></span></label>
                                        <div class="control-group"><span>Sort By:</span><select data-setting="sortBy" class="sd-plus-select"><option value="default">Default</option><option value="discount">Discount %</option><option value="rating">Rating</option></select></div>
                                        <div class="control-group"><span>Price Range ($):</span><div class="range-inputs"><input type="number" data-setting="minPrice" placeholder="Min" class="sd-plus-input-text"><span>-</span><input type="number" data-setting="maxPrice" placeholder="Max" class="sd-plus-input-text"></div></div>
                                        <div class="control-group"><span>Block Keywords:</span><textarea data-setting="excludeKeywords" class="sd-plus-textarea" placeholder="e.g. refurbished, used"></textarea></div>
                                        <div class="control-group"><span>Include Keywords:</span><textarea data-setting="includeKeywords" class="sd-plus-textarea" placeholder="e.g. sunglasses, rayban (show only matching)"></textarea></div>
                                    </div></div>
                                    <div class="sd-plus-section collapsed"><div class="sd-plus-header">Highlighting <span class="arrow">&#9660;</span></div><div class="sd-plus-content">
                                        <div class="control-row"><span>Min Score:</span><input type="number" data-setting="highlightRating" class="sd-plus-input-number"></div>
                                        <div class="control-row"><span>Score Color:</span><input type="color" data-setting="colorRatingBG"></div>
                                        <div class="control-row"><span>Min Diff %:</span><input type="number" data-setting="highlightDiff" class="sd-plus-input-number"></div>
                                        <div class="control-row"><span>Diff Color:</span><input type="color" data-setting="colorDiffBG"></div>
                                        <div class="control-row"><span>Gold Color:</span><input type="color" data-setting="colorBothBG"></div>
                                    </div></div>
                                    <div class="sd-plus-footer"><button id="sdPlusClearFiltersButton" class="sd-plus-clear-btn">Clear Filters</button><button id="sdPlusResetButton">Reset All</button></div>
                                    <div class="sd-plus-button-group" style="margin-top:5px;display:flex;justify-content:space-between;"><button id="sdPlusExportButton">Export</button><button id="sdPlusImportButton">Import</button><button id="sdPlusDebugButton" style="background-color:#2196f3;">Debug</button></div>
                                </div>
                            </div>
                        </li>`;
                        navBar.insertAdjacentHTML('beforeend', menuHTML);
                        populateMenu();
                        setupEventListeners();
                    } catch (e) {
                        log.error('insertMenu error:', e);
                    }
                };

                insertMenu();

                // Re-insert menu if it gets removed
                if (navBarObserver) navBarObserver.disconnect();
                navBarObserver = new MutationObserver(() => {
                    if (!document.getElementById('sdPlusNavMenu')) insertMenu();
                });
                navBarObserver.observe(navBar, { childList: true });

            } catch (e) {
                log.error('createMenu error:', e);
            }
        }

        function updateFilterBadge() {
            try {
                // Count hidden deals instead of active filters
                const hiddenCards = document.querySelectorAll('.sd-plus-hide');
                const hiddenCount = hiddenCards.length;

                const btn = document.querySelector('.sd-plus-menu-button');
                if (btn) {
                    if (hiddenCount > 0) {
                        btn.innerHTML = `Slickdeals+<span class="filter-badge">${hiddenCount} hidden</span>`;
                    } else {
                        btn.innerHTML = 'Slickdeals+';
                    }
                }
            } catch (e) {
                log.debug('updateFilterBadge error:', e);
            }
        }

        function populateMenu() {
            try {
                const s = context.settings.getSettings();
                document.querySelectorAll('[data-setting]').forEach(el => {
                    const key = el.dataset.setting;
                    if (s[key] !== undefined) {
                        if (el.type === 'checkbox') el.checked = s[key];
                        else el.value = s[key];
                    }
                });
                updateFilterBadge();
            } catch (e) {
                log.error('populateMenu error:', e);
            }
        }

        function setupEventListeners() {
            try {
                const menuContainer = document.getElementById('sdPlusNavMenu');
                if (!menuContainer) return;
                const menuBody = menuContainer.querySelector('#sdPlusMenuBody');
                if (!menuBody) return;

                // Clone to remove old listeners
                const newMenuBody = menuBody.cloneNode(true);
                menuBody.parentNode.replaceChild(newMenuBody, menuBody);

                // Section collapse toggles
                newMenuBody.querySelectorAll('.sd-plus-header').forEach(h => {
                    h.addEventListener('click', e => {
                        e.stopPropagation();
                        h.parentElement.classList.toggle('collapsed');
                    });
                });

                // Setting changes
                newMenuBody.addEventListener('change', e => {
                    try {
                        const el = e.target, key = el.dataset.setting;
                        if (!key) return;
                        if (['excludeKeywords', 'includeKeywords', 'minPrice', 'maxPrice'].includes(key)) return;
                        let value = el.type === 'checkbox' ? el.checked : (el.type === 'number' ? parseFloat(el.value) || 0 : el.value);
                        if (key.startsWith('color') && !ValidationModule.isValidHexColor(value)) {
                            ToastModule.show('Invalid color', 'warning');
                            return;
                        }
                        const s = context.settings.getSettings();
                        s[key] = value;
                        if (key === 'freeOnly' && value) s.goldTierOnly = false;
                        if (key === 'goldTierOnly' && value) s.freeOnly = false;
                        populateMenu();
                        context.settings.saveSettings();
                        context.eventBus.emit('settingsChanged', { key, value, allSettings: s });
                    } catch (err) {
                        log.error('Setting change error:', err);
                    }
                });

                // Debounced input for text fields
                const debouncedSave = UtilsModule.debounce((key, value) => {
                    try {
                        const s = context.settings.getSettings();
                        s[key] = value;
                        context.settings.saveSettings();
                        context.eventBus.emit('settingsChanged', { key, value, allSettings: s });
                    } catch (err) {
                        log.error('Debounced save error:', err);
                    }
                }, 600);

                newMenuBody.addEventListener('input', e => {
                    const key = e.target.dataset.setting;
                    if (['excludeKeywords', 'includeKeywords', 'minPrice', 'maxPrice'].includes(key)) {
                        debouncedSave(key, e.target.value);
                    }
                });

                // Clear filters button
                const clearBtn = newMenuBody.querySelector('#sdPlusClearFiltersButton');
                if (clearBtn) {
                    clearBtn.addEventListener('click', () => {
                        try {
                            const s = context.settings.getSettings();
                            Object.assign(s, { freeOnly: false, goldTierOnly: false, minPrice: '', maxPrice: '', excludeKeywords: '', includeKeywords: '', sortBy: 'default' });
                            populateMenu();
                            context.settings.saveSettings();
                            context.eventBus.emit('settingsChanged', { key: 'all', allSettings: s });
                            ToastModule.show('Filters cleared', 'success');
                        } catch (err) {
                            log.error('Clear filters error:', err);
                        }
                    });
                }

                // Reset button
                const resetBtn = newMenuBody.querySelector('#sdPlusResetButton');
                if (resetBtn) {
                    resetBtn.addEventListener('click', () => {
                        if (confirm('Reset all settings?')) {
                            try {
                                const s = context.settings.getSettings();
                                Object.assign(s, ConstantsModule.DEFAULTS);
                                populateMenu();
                                context.settings.saveSettings();
                                context.eventBus.emit('settingsChanged', { key: 'all', allSettings: s });
                                ToastModule.show('Settings reset', 'success');
                            } catch (err) {
                                log.error('Reset error:', err);
                            }
                        }
                    });
                }

                // Export button
                const exportBtn = newMenuBody.querySelector('#sdPlusExportButton');
                if (exportBtn) {
                    exportBtn.addEventListener('click', () => {
                        try {
                            const blob = new Blob([JSON.stringify(context.settings.getSettings(), null, 2)], { type: 'application/json' });
                            const a = document.createElement('a');
                            a.href = URL.createObjectURL(blob);
                            a.download = 'slickdeals-plus-settings.json';
                            a.click();
                            URL.revokeObjectURL(a.href);
                            ToastModule.show('Settings exported', 'success');
                        } catch (err) {
                            log.error('Export error:', err);
                            ToastModule.show('Export failed', 'error');
                        }
                    });
                }

                // Import button
                const importBtn = newMenuBody.querySelector('#sdPlusImportButton');
                if (importBtn) {
                    importBtn.addEventListener('click', () => {
                        try {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = '.json';
                            input.onchange = e => {
                                const reader = new FileReader();
                                reader.onload = ev => {
                                    try {
                                        const parsed = JSON.parse(ev.target.result);
                                        const validation = ValidationModule.validateSettings(parsed, ConstantsModule.DEFAULTS);
                                        if (validation.warnings.length) {
                                            ToastModule.show(`Imported with ${validation.warnings.length} warning(s)`, 'warning');
                                        } else {
                                            ToastModule.show('Settings imported', 'success');
                                        }
                                        Object.assign(context.settings.getSettings(), validation.settings);
                                        populateMenu();
                                        context.settings.saveSettings();
                                        context.eventBus.emit('settingsChanged', { key: 'all', allSettings: context.settings.getSettings() });
                                    } catch {
                                        ToastModule.show('Import failed', 'error');
                                    }
                                };
                                if (e.target.files[0]) {
                                    reader.readAsText(e.target.files[0]);
                                }
                            };
                            input.click();
                        } catch (err) {
                            log.error('Import error:', err);
                        }
                    });
                }

                // Debug button
                const debugBtn = newMenuBody.querySelector('#sdPlusDebugButton');
                if (debugBtn) {
                    debugBtn.addEventListener('click', () => {
                        context.settings.debugDump();
                        ToastModule.show('Debug info in console', 'info');
                    });
                }

                // Menu toggle button
                const btn = menuContainer.querySelector('.sd-plus-menu-button');
                if (btn) {
                    const newBtn = btn.cloneNode(true);
                    btn.parentNode.replaceChild(newBtn, btn);
                    newBtn.addEventListener('click', e => {
                        e.stopPropagation();
                        menuContainer.classList.toggle('menu-open');
                    });
                }

                // Document click to close menu
                if (documentClickHandler) document.removeEventListener('click', documentClickHandler);
                if (documentKeydownHandler) document.removeEventListener('keydown', documentKeydownHandler);

                documentClickHandler = e => {
                    if (menuContainer && !menuContainer.contains(e.target)) {
                        menuContainer.classList.remove('menu-open');
                    }
                };
                documentKeydownHandler = e => {
                    if (e.key === 'Escape' && menuContainer && menuContainer.classList.contains('menu-open')) {
                        e.preventDefault();
                        menuContainer.classList.remove('menu-open');
                    }
                };

                document.addEventListener('click', documentClickHandler);
                document.addEventListener('keydown', documentKeydownHandler);

                newMenuBody.addEventListener('click', e => e.stopPropagation());
                log.debug('Event listeners attached');

            } catch (e) {
                log.error('setupEventListeners error:', e);
            }
        }

        return { createMenu, updateFilterBadge };
    }

    // ============================================
    // MODULE: Styles
    // ============================================
    function StylesModule(context) {
        const styleSheets = { static: null, dynamic: null };
        const STATIC_CSS = `#sdPlusToastContainer{pointer-events:none}#sdPlusToastContainer>div{pointer-events:auto}#sdPlusNavMenu{position:relative}.sd-plus-menu-button{cursor:pointer;color:#333;font-weight:bold;padding:6px 10px;background:#fff;border:1px solid #ccc;border-radius:4px;display:inline-flex;align-items:center}.sd-plus-menu-dropdown{display:none}#sdPlusNavMenu.menu-open .sd-plus-menu-dropdown{display:block;position:absolute;top:100%;left:0;width:340px;background:#fff;border:1px solid #ccc;border-radius:8px;z-index:10000;font-family:Arial,sans-serif;font-size:13px;color:#333;text-align:left;box-shadow:0 4px 15px rgba(0,0,0,0.2)}#sdPlusMenuBody{padding:12px;max-height:85vh;overflow-y:auto}.filter-badge{display:inline-block;background:#ff5252;color:#fff;font-size:10px;font-weight:bold;border-radius:10px;padding:2px 6px;margin-left:5px}.filter-active{background:#e8f5e9!important;border-left:3px solid #34C759;padding-left:5px}.sd-plus-clear-btn{background:#FF9800!important;color:#fff}.sd-plus-section{border-bottom:1px solid #eee;margin-bottom:5px;padding-bottom:5px}.sd-plus-header{font-weight:bold;cursor:pointer;padding:8px 5px;background:#f9f9f9;display:flex;justify-content:space-between;border-radius:4px}.sd-plus-header:hover{background:#eee}.sd-plus-section.collapsed .sd-plus-content{display:none}.sd-plus-section.collapsed .arrow{transform:rotate(-90deg)}.sd-plus-content{padding:8px 5px}.switch-row{display:flex;justify-content:space-between;margin-bottom:8px;cursor:pointer;align-items:center}.sd-switch-input{display:none}.sd-switch-slider{position:relative;width:34px;height:18px;background:#ccc;border-radius:20px;transition:.3s}.sd-switch-slider:before{content:"";position:absolute;width:14px;height:14px;left:2px;bottom:2px;background:#fff;border-radius:50%;transition:.3s}.sd-switch-input:checked+.sd-switch-slider{background:#34C759}.sd-switch-input:checked+.sd-switch-slider:before{transform:translateX(16px)}.control-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}.control-group{margin-bottom:10px}.control-group span{display:block;margin-bottom:4px;color:#666;font-weight:500}.sd-plus-input-number{width:50px;padding:4px;border:1px solid #ddd;text-align:center;border-radius:4px}.sd-plus-input-text{width:60px;padding:4px;border:1px solid #ddd;border-radius:4px}.sd-plus-textarea{width:96%;padding:5px;border:1px solid #ddd;border-radius:4px;resize:vertical;min-height:40px;font-family:Arial}.sd-plus-select{padding:4px;border:1px solid #ddd;width:120px;border-radius:4px}.range-inputs{display:flex;gap:8px;align-items:center}.sd-plus-footer{display:flex;gap:5px;margin-top:15px;padding-top:10px;border-top:1px solid #eee}.sd-plus-footer button{flex:1;border:none;padding:8px;border-radius:4px;cursor:pointer;color:#fff;font-weight:bold}#sdPlusResetButton{background:#607d8b}.sd-plus-button-group button{background:#607d8b;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;color:#fff;width:32%}.sd-plus-hide{display:none!important}html.hidePageClutter-enabled .redesignFrontpageDesktop{display:block!important;width:96%!important;max-width:none!important;margin:0 auto!important}ul.frontpageGrid,ul.cmsDealFeed__dealContainer{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(230px,1fr))!important;gap:20px!important;width:100%!important}.dealCardV3,.dealCard,[data-threadid]{width:auto!important;max-width:none!important;height:100%!important}html.priceFirst-enabled .dealCardGrid.dealCardVariant1{grid-template-areas:"userInfo" "image" "priceRow" "title" "extraInfo" "store" "actions"!important;grid-template-rows:repeat(7,auto)!important}html.priceFirst-enabled .dealCardVariant1__priceRow{grid-area:priceRow!important}html.showDiff-enabled .dealCardVariant1__priceRow[data-deal-percent]::after,html.showDiff-enabled .dealCardV3__priceContainer[data-deal-percent]::after,html.showDiff-enabled .dealCard__priceContainer[data-deal-percent]::after{content:"($" attr(data-deal-diff) " | " attr(data-deal-percent) "%)";display:block;width:100%;font-style:italic;margin-top:4px;color:#555;font-size:0.9em}.dealCardVariant1__priceRow,.dealCardV3__priceContainer,.dealCard__priceContainer{display:flex!important;flex-wrap:wrap!important;align-items:baseline;overflow:visible!important;height:auto!important;max-height:none!important}html.hidePageClutter-enabled #sideColumn,html.hidePageClutter-enabled aside.slickdealsSidebar{display:none!important}html.hidePageClutter-enabled #mainColumn,html.hidePageClutter-enabled main.redesignFrontpageDesktop__main{width:100%!important;max-width:100%!important}a[data-resolved-href]{position:relative;text-decoration:none!important}a[data-resolved-href] .dealCardGrid__title,a[data-resolved-href].dealCardGrid__title,a[data-resolved-href] .dealCard__title,a[data-resolved-href].dealCard__title{color:#2e7d32!important}.sdp-bypass-indicator{display:inline-block;width:12px;height:12px;margin-left:5px;background:#4CAF50;border-radius:50%}`;

        function updateHtmlClasses(s) {
            try {
                for (const k in s) {
                    if (typeof s[k] === 'boolean') {
                        document.documentElement.classList.toggle(`${k}-enabled`, s[k]);
                    }
                }
            } catch (e) {
                log.error('updateHtmlClasses error:', e);
            }
        }

        function initializeStyles() {
            try {
                if (!styleSheets.static) {
                    const existing = document.getElementById('sdPlusStyles-static');
                    if (existing) {
                        styleSheets.static = existing;
                    } else {
                        const st = document.createElement('style');
                        st.id = 'sdPlusStyles-static';
                        st.textContent = STATIC_CSS;
                        document.head.appendChild(st);
                        styleSheets.static = st;
                    }
                }
                if (!styleSheets.dynamic) {
                    const existing = document.getElementById('sdPlusStyles-dynamic');
                    if (existing) {
                        styleSheets.dynamic = existing;
                    } else {
                        const st = document.createElement('style');
                        st.id = 'sdPlusStyles-dynamic';
                        document.head.appendChild(st);
                        styleSheets.dynamic = st;
                    }
                }
            } catch (e) {
                log.error('initializeStyles error:', e);
            }
        }

        function updateDynamicStyles(s) {
            try {
                if (!styleSheets.dynamic) initializeStyles();
                if (!styleSheets.dynamic) return;

                const cR = ValidationModule.sanitizeColor(s.colorRatingBG, '#dff0d8');
                const cD = ValidationModule.sanitizeColor(s.colorDiffBG, '#d9edf7');
                const cB = ValidationModule.sanitizeColor(s.colorBothBG, '#FFF9C4');

                // Class-agnostic highlight: the highlight* classes are added to the processed card,
                // which always carries data-sdp-processed. This survives card-class renames (the
                // Nuxt migration broke the old `.dealCard.highlight*` form).
                let css = `[data-sdp-processed].highlightRating{background:${cR}!important}[data-sdp-processed].highlightDiff{background:${cD}!important}[data-sdp-processed].highlightBoth{background:${cB}!important}`;

                if (s.hideFeedAds) {
                    css += ConstantsModule.SELECTORS.ads.join(',') + '{display:none!important}';
                }
                if (s.hidePageClutter) {
                    css += ConstantsModule.SELECTORS.clutterElements.join(',') + '{display:none!important}';
                    // Non-deal grid items — expired-deal slots (a bare <li><button>) and banner/
                    // wallpaper ad slots (obfuscated per-session classes, no [data-threadid]) — render
                    // as grid <li>s holding no deal. JJ's call: treat them as page clutter rather than
                    // ads, since this broad :not(:has()) sweeps up expired cards too. (Was under Hide
                    // Ads in the first pass.) Note: also catches any future non-deal <li> in the grid.
                    css += 'ul.frontpageGrid>li:not(:has([data-threadid])){display:none!important}';
                }
                if (s.hidePromoted) {
                    // Class-agnostic (sits on the <li> for grid cards, on the card for wrapper-less).
                    css += '.sdp-has-promoted{display:none!important}';
                }

                styleSheets.dynamic.textContent = css;
                updateHtmlClasses(s);
            } catch (e) {
                log.error('updateDynamicStyles error:', e);
            }
        }

        return { updateHtmlClasses, initializeStyles, updateDynamicStyles };
    }

    // ============================================
    // MODULE: Processing
    // ============================================
    function ProcessingModule(context) {
        const linkClickHandlers = new WeakMap();
        const elementCache = new WeakMap();

        // v33.0.0: resolves a card's deal data API-first (by data-threadid), DOM-second.
        // Returns the DOM element refs still needed for mutation (price-row badge ::after,
        // price-first reorder, link bypass, keyword title text) AND the resolved numeric/
        // semantic values (price, votes, discount, promoted). Cached per card in the WeakMap.
        function getDealData(card) {
            if (elementCache.has(card)) return elementCache.get(card);
            try {
                const S = ConstantsModule.SELECTORS;
                const titleEl = card.querySelector(S.dealTitle);
                const priceEl = card.querySelector(S.dealPrice);
                const priceContainer = card.querySelector(S.priceContainer);
                const originalEl = card.querySelector(S.originalPrice);
                const voteEl = card.querySelector(S.voteCount);
                const badgeEl = card.querySelector(S.dealBadge);
                const titleText = titleEl ? (titleEl.innerText || titleEl.textContent || '').toLowerCase() : '';

                // The dealCard selector matches the [data-threadid] element itself; the fallbacks
                // cover the legacy-class case where the id lives on a descendant/ancestor.
                const threadId = card.dataset?.threadid
                    || card.querySelector?.('[data-threadid]')?.dataset.threadid
                    || card.closest?.('[data-threadid]')?.dataset.threadid;
                const apiDeal = threadId ? context.data?.lookup(threadId) : undefined;

                let currentPrice, originalPrice, votes, percent, source;
                if (apiDeal) {
                    currentPrice = UtilsModule.parsePrice(apiDeal.finalPriceText);
                    originalPrice = UtilsModule.parsePrice(apiDeal.listPriceText);
                    votes = Number(apiDeal.socialVoteCount) || 0;
                    percent = Number(apiDeal.discount) || 0; // exact — no parse/rounding
                    source = 'api';
                } else {
                    currentPrice = UtilsModule.parsePrice(priceEl?.textContent);
                    originalPrice = UtilsModule.parsePrice(originalEl?.textContent);
                    votes = UtilsModule.parseHumanNumber(voteEl?.textContent);
                    percent = (!isNaN(currentPrice) && !isNaN(originalPrice) && originalPrice > currentPrice)
                        ? Math.round((1 - currentPrice / originalPrice) * 100) : 0;
                    source = 'dom';
                }

                // Promoted/Personalized: the *rendered badge* is ground truth. The API variant is
                // unreliable — live data showed it returning 'foryou' or null on cards that still
                // display a "Promoted" pill, and Personalized cards (AMEX/movie offers) aren't in any
                // deal endpoint at all. So match the visible badge text, with the API variant as a
                // backstop. (Per JJ: Personalized is bucketed in with Promoted.) Supersedes the old
                // variant-only check that closed backlog #11 but missed these real-world cases.
                const PROMO_RE = /promoted|sponsored|personalized/i;
                const isPromoted = PROMO_RE.test(badgeEl?.textContent || '') || PROMO_RE.test(apiDeal?.dealCardBadge?.variant || '');

                // hasData distinguishes a real deal from a structural element that merely matched
                // the selector — preserves v32's "skip price-less cards" behavior for highlight/sort/
                // keyword. Price-less-but-badged cards are handled explicitly in processDealCard so
                // Hide Promoted / Gold Tier Only still apply to them.
                const hasData = !!apiDeal || !isNaN(currentPrice);

                const data = {
                    titleEl, priceEl, priceContainer, originalEl, voteEl, badgeEl, titleText,
                    currentPrice, originalPrice, votes, percent, isPromoted, hasData, source
                };
                elementCache.set(card, data);
                return data;
            } catch (e) {
                log.debug('getDealData error:', e);
                return null;
            }
        }

        // v33.0.0: price-first is handled in CSS (StylesModule) by overriding the card's
        // grid-template-areas — the Nuxt card is a named-area CSS grid, so DOM reorder is ignored.
        // See `html.priceFirst-enabled .dealCardGrid.dealCardVariant1` in STATIC_CSS.

        function processLinksInCard(card) {
            if (card.dataset.sdpLinksProcessed) return;
            try {
                card.querySelectorAll('a').forEach(link => {
                    if (LinkResolutionModule.isTrackingLink(link.href)) {
                        const dest = LinkResolutionModule.extractDestinationUrl(link.href);
                        if (dest) {
                            link.dataset.resolvedHref = dest;
                            const handler = e => {
                                if (context.settings.getSettings().bypassRedirects) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    window.open(dest, '_blank', 'noopener,noreferrer');
                                }
                            };
                            linkClickHandlers.set(link, handler);
                            link.addEventListener('click', handler, { capture: true });
                        }
                    }
                });
                card.dataset.sdpLinksProcessed = 'true';
            } catch (e) {
                log.debug('processLinksInCard error:', e);
            }
        }

        function processDealCard(card) {
            if (!card || card.dataset.sdpProcessed) return;
            card.dataset.sdpProcessed = 'true'; // Mark early to prevent observer echo-loop

            try {
                const li = card.closest('li');
                if (li && !li.dataset.sdOriginalPos) {
                    li.dataset.sdOriginalPos = context.settings.getOriginalPosCounter();
                }

                const el = getDealData(card);
                if (!el) return;

                // Hide/promoted state lives on the wrapper: the <li> for grid cards, or the card
                // itself for wrapper-less slots (carousel/banner cards have no <li> ancestor, so
                // li-only toggles let those cards slip past every filter — diag showed ~20).
                const wrapper = li || card;

                // Price-less-but-badged cards (Personalized/AMEX offers, sweepstakes "See Official
                // Rules" slots) carry a badge but no deal data, so they'd bail before the highlight/
                // sort/keyword pipeline below. They still need promoted-state AND the "only" filters:
                // they're never gold or free, so Gold Tier Only / Free Only must hide them, and Hide
                // Promoted catches them via the class. Without this, Gold Tier Only leaks promo cards.
                if (!el.hasData) {
                    const s0 = context.settings.getSettings();
                    card.classList.toggle('isPromoted', el.isPromoted);
                    wrapper.classList.toggle('sdp-has-promoted', el.isPromoted);
                    const hide0 = s0.goldTierOnly || s0.freeOnly || (s0.hidePromoted && el.isPromoted);
                    wrapper.classList.toggle('sd-plus-hide', hide0);
                    wrapper.style.display = hide0 ? 'none' : '';
                    return;
                }

                const { currentPrice, originalPrice, votes, percent, isPromoted } = el;

                // Price-diff badge data (consumed by the showDiff ::after). Needs the price-row
                // element + a valid dollar delta; the percent prefers the API's exact discount.
                if (el.priceContainer && !isNaN(currentPrice) && !isNaN(originalPrice) && originalPrice > currentPrice) {
                    el.priceContainer.dataset.dealDiff = (originalPrice - currentPrice).toFixed(2);
                    el.priceContainer.dataset.dealPercent = String(percent || Math.round((1 - currentPrice / originalPrice) * 100));
                }

                if (li) {
                    li.dataset.sdpPrice = String(currentPrice);
                    li.dataset.sdpRating = String(votes);
                    li.dataset.sdpDiscount = String(percent);
                }

                const s = context.settings.getSettings();
                const isFree = currentPrice === 0;
                const meetsRating = votes >= s.highlightRating;
                const meetsDiff = percent >= s.highlightDiff;
                const isGold = meetsRating && meetsDiff;

                card.classList.remove('highlightRating', 'highlightDiff', 'highlightBoth', 'isFree', 'isPromoted', 'isGold');
                if (isGold) card.classList.add('highlightBoth', 'isGold');
                else if (meetsRating) card.classList.add('highlightRating');
                else if (meetsDiff) card.classList.add('highlightDiff');
                card.classList.toggle('isFree', isFree);
                card.classList.toggle('isPromoted', isPromoted);
                wrapper.classList.toggle('sdp-has-promoted', isPromoted);

                // hidePromoted is also enforced by the .sdp-has-promoted{display:none!important} CSS
                // rule, so this JS clause is belt-and-suspenders — it keeps the inline display in sync
                // with that rule (mirrors the no-data hide0 path) rather than relying on !important
                // beating the inline style on reprocess.
                let shouldHide = (s.freeOnly && !isFree) || (s.goldTierOnly && !isGold) || (s.hidePromoted && isPromoted);
                if (!shouldHide && !isNaN(currentPrice)) {
                    const min = parseFloat(s.minPrice);
                    const max = parseFloat(s.maxPrice);
                    if (!isNaN(min) && min > 0 && currentPrice < min) shouldHide = true;
                    if (!isNaN(max) && max > 0 && currentPrice > max) shouldHide = true;
                }
                if (!shouldHide && s.excludeKeywords && el.titleText) {
                    const kws = s.excludeKeywords.toLowerCase().split(',');
                    if (kws.some(k => k.trim() && el.titleText.includes(k.trim()))) shouldHide = true;
                }
                // Include keywords filter - show only deals matching at least one keyword (OR logic)
                if (!shouldHide && s.includeKeywords && s.includeKeywords.trim() && el.titleText) {
                    const includeKws = s.includeKeywords.toLowerCase().split(',');
                    const matchesInclude = includeKws.some(k => k.trim() && el.titleText.includes(k.trim()));
                    if (!matchesInclude) shouldHide = true;
                }
                wrapper.classList.toggle('sd-plus-hide', shouldHide);
                wrapper.style.display = shouldHide ? 'none' : '';

                processLinksInCard(card);

            } catch (e) {
                log.debug('processDealCard error:', e);
            }
        }

        return {
            processAllCards: async (force) => {
                // Set processing lock to prevent observer echo loop
                context.isProcessing = true;
                try {
                    const cards = Array.from(document.querySelectorAll(ConstantsModule.SELECTORS.dealCard));
                    log.debug(`Processing ${cards.length} cards (force: ${force})`);

                    if (force) {
                        cards.forEach(c => {
                            delete c.dataset.sdpProcessed;
                            delete c.dataset.sdpLinksProcessed;
                            elementCache.delete(c);
                        });
                    }
                    await UtilsModule.processInBatches(cards, processDealCard);
                } catch (e) {
                    log.error('processAllCards error:', e);
                } finally {
                    // Always release lock, even on error
                    context.isProcessing = false;
                }
            },
            // v32.3.0: Expose for delta processing in observer
            processCards: async (cards) => {
                if (!cards || cards.length === 0) return;
                context.isProcessing = true;
                try {
                    await UtilsModule.processInBatches(Array.from(cards), processDealCard);
                } finally {
                    context.isProcessing = false;
                }
            }
        };
    }

    // ============================================
    // MODULE: Sorting
    // ============================================
    function SortingModule(context) {
        function applySorting() {
            try {
                const s = context.settings.getSettings();
                const feeds = document.querySelectorAll(ConstantsModule.SELECTORS.dealFeed);
                if (!feeds.length) {
                    log.debug('Feed not found for sorting');
                    return;
                }

                const compare = (a, b) => {
                    if (s.sortBy === 'default') {
                        return (parseInt(a.dataset.sdOriginalPos, 10) || 0) - (parseInt(b.dataset.sdOriginalPos, 10) || 0);
                    }
                    const k = s.sortBy === 'rating' ? 'sdpRating' : 'sdpDiscount';
                    return (parseFloat(b.dataset[k]) || 0) - (parseFloat(a.dataset[k]) || 0);
                };

                // The Nuxt frontpage renders multiple ul.frontpageGrid sections (missed deals,
                // frontpage grid, …). Sort each independently with CSS order so each grid stays
                // internally consistent.
                feeds.forEach(feed => {
                    const items = Array.from(feed.children).filter(n => n.nodeName === 'LI');
                    items.sort(compare);
                    items.forEach((li, i) => {
                        li.style.order = String(i);
                        if (li.classList.contains('sd-plus-hide')) {
                            li.style.display = 'none';
                        } else {
                            li.style.removeProperty('display');
                        }
                    });
                });

                if (context.menu?.updateFilterBadge) {
                    context.menu.updateFilterBadge();
                }
            } catch (e) {
                log.error('applySorting error:', e);
            }
        }
        return { applySorting };
    }

    // ============================================
    // MAIN INITIALIZATION
    // ============================================
    (async function init() {
        await safeExecute(async () => {
            log.info(`Initializing v${VERSION}...`);

            // Event bus for inter-module communication
            const callbacks = {};
            const context = {
                eventBus: {
                    emit: (e, d) => {
                        if (callbacks[e]) {
                            callbacks[e].forEach(cb => {
                                try { cb(d); } catch (err) { log.error(`Event ${e} handler error:`, err); }
                            });
                        }
                    },
                    on: (e, cb) => {
                        callbacks[e] = callbacks[e] || [];
                        callbacks[e].push(cb);
                    }
                },
                settings: null,
                // Processing lock to prevent observer echo loop
                // When true, observer ignores mutations (they're from our own processing)
                isProcessing: false
            };

            // Initialize settings
            context.settings = SettingsModule();
            context.settings.loadSettings();

            // Initialize styles
            const styles = StylesModule(context);
            styles.initializeStyles();
            styles.updateDynamicStyles(context.settings.getSettings());

            // Initialize modules
            context.linkResolver = LinkResolutionModule;
            context.data = DataModule();
            context.processing = ProcessingModule(context);
            context.sorting = SortingModule(context);
            const menu = MenuModule(context);
            context.menu = menu;

            // v33.0.0: kick off the API deal fetch now so it overlaps with menu creation; await it
            // just before the first card pass so structured data is ready. DOM fallback covers
            // anything the API misses, so a slow/failed fetch never blocks enhancement.
            const dealDataReady = context.data.load();

            // Create UI
            await menu.createMenu();

            // Process existing cards
            await dealDataReady;
            await context.processing.processAllCards(true);
            context.sorting.applySorting();

            // BUG FIX: Delayed reprocess to catch lazy-loaded deals
            // Slickdeals lazy-loads content that may not trigger MutationObserver
            // v32.3.4: Added retry mechanism with coalescing to fix race condition
            let reprocessRetries = 0;
            let isRetryPending = false;
            const MAX_REPROCESS_RETRIES = 10;

            const reprocessUnprocessed = () => {
                // Skip if already processing (prevents stacking)
                if (context.isProcessing) {
                    // Coalesce: If a retry is already scheduled, don't spawn another one
                    if (isRetryPending) {
                        log.debug('reprocessUnprocessed ignored (retry already pending)');
                        return;
                    }

                    if (reprocessRetries < MAX_REPROCESS_RETRIES) {
                        reprocessRetries++;
                        isRetryPending = true;
                        log.debug(`reprocessUnprocessed deferred (retry ${reprocessRetries}/${MAX_REPROCESS_RETRIES})`);

                        setTimeout(() => {
                            isRetryPending = false;
                            reprocessUnprocessed();
                        }, 200);
                    } else {
                        log.warn('reprocessUnprocessed max retries reached');
                        // Reset for future external calls
                        reprocessRetries = 0;
                    }
                    return;
                }

                // Reset counters on successful entry
                reprocessRetries = 0;
                isRetryPending = false;

                const unprocessed = document.querySelectorAll(
                    '.dealCardV3:not([data-sdp-processed]), .dealCard:not([data-sdp-processed]), [data-threadid]:not([data-sdp-processed])'
                );
                if (unprocessed.length > 0) {
                    log.info(`Found ${unprocessed.length} unprocessed deals, processing...`);
                    context.processing.processAllCards(false).then(() => context.sorting.applySorting());
                }
            };

            // Run reprocess checks at intervals to catch lazy-loaded content
            setTimeout(reprocessUnprocessed, 500);
            setTimeout(reprocessUnprocessed, 1500);
            setTimeout(reprocessUnprocessed, 3000);

            // Also reprocess on scroll (deals may load on scroll)
            let scrollTimeout;
            const handleScroll = () => {
                clearTimeout(scrollTimeout);
                scrollTimeout = setTimeout(reprocessUnprocessed, 300);
            };
            window.addEventListener('scroll', handleScroll, { passive: true });

            // BUG FIX #3: Safe observer setup with processing lock + delta processing (v32.3.0).
            // Attach the delta-processing childList observer to the feed container.
            const attachFeedObserver = feed => {
                const observer = new MutationObserver(ms => {
                    // ECHO LOOP FIX: Skip if we're currently processing
                    // This prevents observer from firing when we add our own classes
                    if (context.isProcessing) {
                        log.debug('Observer skipped (processing lock active)');
                        return;
                    }

                    try {
                        // DELTA PROCESSING: Collect only newly added deal cards
                        // Instead of re-querying the entire DOM, we process just the new nodes
                        const newCards = [];

                        ms.forEach(m => {
                            // Check for new nodes added to the DOM
                            m.addedNodes.forEach(n => {
                                if (n.nodeType === 1) {
                                    // Is this node itself a deal card?
                                    if (n.matches?.(ConstantsModule.SELECTORS.dealCard)) {
                                        if (!n.dataset.sdpProcessed) {
                                            newCards.push(n);
                                        }
                                    }
                                    // Does this node contain deal cards?
                                    const innerCards = n.querySelectorAll?.(ConstantsModule.SELECTORS.dealCard);
                                    if (innerCards) {
                                        innerCards.forEach(card => {
                                            if (!card.dataset.sdpProcessed) {
                                                newCards.push(card);
                                            }
                                        });
                                    }
                                }
                            });

                        });

                        // Process only the new cards (deduplicated)
                        if (newCards.length > 0) {
                            const uniqueCards = [...new Set(newCards)];
                            log.debug(`Observer found ${uniqueCards.length} new cards to process`);

                            // Use the dedicated processCards method for delta processing
                            context.processing.processCards(uniqueCards).then(() => {
                                context.sorting.applySorting();
                            });
                        }
                    } catch (e) {
                        log.debug('Observer callback error:', e);
                        context.isProcessing = false; // Ensure lock is released on error
                    }
                });
                observer.observe(feed, { childList: true, subtree: true });
                log.debug('Feed observer attached');
            };

            // BUG FIX #7: the old one-shot `await waitForElement(dealFeed, 3000)` gate meant a
            // cold load past 3s resolved null → the feed observer never attached for the whole
            // session, with no recovery. Instead, if the feed is already present attach now;
            // otherwise watch document.body until it appears, attach, then DISCONNECT the body
            // observer immediately. We never leave a subtree:true observer on document.body for
            // the session — that's a perf hazard on SD's ad-heavy, infinite-scroll DOM.
            try {
                const existingFeeds = document.querySelectorAll(ConstantsModule.SELECTORS.dealFeed);
                if (existingFeeds.length) {
                    existingFeeds.forEach(attachFeedObserver);
                } else {
                    const bodyObserver = new MutationObserver(() => {
                        const feeds = document.querySelectorAll(ConstantsModule.SELECTORS.dealFeed);
                        if (!feeds.length) return;
                        bodyObserver.disconnect();
                        feeds.forEach(attachFeedObserver);
                        // Cards may have rendered before the observer was wired — sweep once.
                        context.processing.processAllCards(true).then(() => context.sorting.applySorting());
                    });
                    bodyObserver.observe(document.body, { childList: true, subtree: true });
                    log.debug('Deal feed not present yet - watching document.body until it appears');
                }
            } catch (e) {
                log.error('Observer setup error:', e);
            }

            // Event handlers
            context.eventBus.on('settingsChanged', ({ allSettings }) => {
                styles.updateHtmlClasses(allSettings);
                styles.updateDynamicStyles(allSettings);
                context.menu?.updateFilterBadge();
            });

            context.eventBus.on('settingsChanged', ({ key }) => {
                const reprocessKeys = ['hidePromoted', 'freeOnly', 'goldTierOnly', 'highlightRating', 'highlightDiff', 'bypassRedirects', 'showDiff', 'minPrice', 'maxPrice', 'excludeKeywords', 'includeKeywords'];
                if (reprocessKeys.includes(key) || key === 'all') {
                    context.processing.processAllCards(true).then(() => context.sorting.applySorting());
                } else if (key === 'sortBy') {
                    context.sorting.applySorting();
                }
            });

            // Expose debug interface to BOTH contexts
            const debugInterface = {
                version: VERSION,
                settings: context.settings,
                testToast: (m, t) => ToastModule.show(m || 'Test!', t || 'info'),
                dump: () => context.settings.debugDump(),
                reprocess: () => context.processing.processAllCards(true).then(() => context.sorting.applySorting()),
                // v32.3.0: Expose processing state for debugging
                get isProcessing() { return context.isProcessing; },
                // v33.0.0: API deal map + a layout/selector probe (call sdPlus.diag()) so we can
                // inspect the live Nuxt card without pasting fragile console snippets.
                data: context.data,
                diag: () => {
                    try {
                        const card = document.querySelector('[data-threadid].isGold') || document.querySelector('[data-threadid]');
                        if (!card) { console.log('[Slickdeals+] diag: no card found'); return null; }
                        const title = card.querySelector('a.dealCardGrid__title');
                        const price = card.querySelector('a.dealCardVariant1__priceRow');
                        const kids = Array.from(card.children);
                        const cs = getComputedStyle(card);
                        const adSelectors = ['#crt-adblock-a', '.frontpageGrid__bannerAd', '.frontpageAd__middleBanner', '[data-googleQueryId]', '.adunit', 'div[data-adlocation]', '[data-adlocation]', '.bannerAd', '[id*="google_ads"]', 'iframe[id*="ad"]', '[class*="dealCardBanner"]', '[class*="frontpageAd"]', '[class*="advertisement"]'];
                        const ads = {};
                        adSelectors.forEach(s => { try { ads[s] = document.querySelectorAll(s).length; } catch { ads[s] = 'ERR'; } });
                        const out = {
                            cardClass: card.className,
                            cardDisplay: cs.display,
                            cardFlexDirection: cs.flexDirection,
                            cardGridTemplateAreas: cs.gridTemplateAreas,
                            cardGridTemplateColumns: cs.gridTemplateColumns,
                            cardGridTemplateRows: cs.gridTemplateRows,
                            titleIdx: kids.indexOf(title),
                            priceIdx: kids.indexOf(price),
                            samePar: !!(title && price) && title.parentNode === price.parentNode,
                            titleOrder: title && getComputedStyle(title).order,
                            priceOrder: price && getComputedStyle(price).order,
                            titleGridArea: title && getComputedStyle(title).gridArea,
                            priceGridArea: price && getComputedStyle(price).gridArea,
                            priceDisplay: price && getComputedStyle(price).display,
                            priceOverflow: price && getComputedStyle(price).overflow,
                            htmlShowDiff: document.documentElement.classList.contains('showDiff-enabled'),
                            dataDealDiff: price && price.getAttribute('data-deal-diff'),
                            dataDealPercent: price && price.getAttribute('data-deal-percent'),
                            afterContent: price && getComputedStyle(price, '::after').content,
                            promotedCards: document.querySelectorAll('[data-threadid].isPromoted').length,
                            freeCards: document.querySelectorAll('[data-threadid].isFree').length,
                            cardsNoLi: Array.from(document.querySelectorAll('[data-threadid]')).filter(c => !c.closest('li')).length,
                            apiDealCount: context.data ? context.data.count() : 'n/a',
                            sampleThreadId: card.dataset.threadid,
                            sampleApiDeal: context.data ? context.data.lookup(card.dataset.threadid) : 'n/a',
                            ads
                        };
                        console.log('[Slickdeals+] DIAG\n' + JSON.stringify(out, (k, v) => v === undefined ? null : v, 2));
                        return out;
                    } catch (e) {
                        console.log('[Slickdeals+] diag error:', e);
                        return null;
                    }
                }
            };

            // Expose to sandbox context
            window.sdPlus = debugInterface;

            // Expose to page context (for console access)
            if (typeof unsafeWindow !== 'undefined') {
                unsafeWindow.sdPlus = debugInterface;
            }

            log.info('Ready. Debug: window.sdPlus.dump()');

            // Delay toast to ensure everything is stable
            setTimeout(() => {
                ToastModule.show(`Slickdeals+ v${VERSION} loaded`, 'success', 2000);
            }, 500);

            // AUTO-DIAGNOSTIC: Run full diagnostic if debug mode is enabled
            // This helps with troubleshooting by automatically printing state on load
            setTimeout(() => {
                try {
                    if (localStorage.getItem('sdPlus_debug') === 'true') {
                        console.log('[Slickdeals+] Debug mode ON - running auto-diagnostic...');
                        context.settings.debugDump();
                    }
                } catch { /* ignore */ }
            }, 2000); // Wait 2s for everything to settle

        }, 'Init');
    })();
})();
