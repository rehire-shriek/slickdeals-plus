// ==UserScript==
// @name         Slickdeals+
// @namespace    V@no
// @description  Adds a dropdown menu with advanced filtering, highlighting, ad blocking, and price difference display.
// @match        https://slickdeals.net/*
// @version      32.2.0
// @license      MIT
// @run-at       document-idle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// ==/UserScript==

/*
 * ============================================================================
 * TODO - Quick Reference (see TODO.md for full details)
 * ============================================================================
 * 
 * KNOWN ISSUES:
 * - [ ] Console spam from Slickdeals ads (not our bug, won't fix)
 * - [ ] dump() output not visible in page console (low priority)
 * 
 * NEXT UP:
 * - [ ] Add loading indicator while processing deals
 * - [ ] Show "X deals hidden" count in menu badge
 * - [ ] Filter presets (save/load combinations)
 * 
 * LAST UPDATED: 2025-01-09
 * ============================================================================
 */

(function() {
    'use strict';

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
            try {
                const settings = localStorage.getItem('sdPlus_debug');
                if (settings === 'true') console.debug(LOG_PREFIX, '🐛', ...args);
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
    const ToastModule = (function() {
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
            
            const { message, type, duration } = toastQueue.shift();
            const container = ensureContainer();
            
            if (!container) {
                isProcessing = false;
                // Retry queue after delay if body not ready
                if (!document.body) {
                    setTimeout(processQueue, 200);
                }
                return;
            }

            try {
                const toast = document.createElement('div');
                const colors = { info: '#2196F3', success: '#4CAF50', warning: '#FF9800', error: '#f44336' };
                toast.style.cssText = `padding:12px 20px;border-radius:6px;font-family:Arial,sans-serif;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.2);background-color:${colors[type]||colors.info};color:#fff;opacity:0;transform:translateX(100%);transition:all 0.3s ease;pointer-events:auto;`;
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
    const ConstantsModule = (function() {
        const SELECTORS = {
            navBar: 'ul.slickdealsHeader__linkSection',
            sideColumn: '#sideColumn, aside.slickdealsSidebar',
            mainContent: '#mainColumn, main.redesignFrontpageDesktop__main',
            pageGrid: '.redesignFrontpageDesktop',
            clutterElements: ['#sideColumn','aside.slickdealsSidebar','[data-section-title="Just For You"]','.frontpageRecommendationCarousel','.justForYouCarousel','.dealAlertsForYou','li.dealAlertsForYou'],
            ads: ["#crt-adblock-a","#crt-adblock-b",".frontpageGrid__bannerAd",".ad",".variableWidthAd",".variableHeightAd",".frontpageAd__middleBanner","[data-googleQueryId]",".adunit","div[data-adlocation]"],
            dealFeed: 'ul.frontpageGrid, ul.cmsDealFeed__dealContainer',
            dealCard: '.dealCardV3, .dealCard, [data-threadid]',
            dealCardContent: '.dealCard__content, .dealCardV3__mainContent',
            dealPrice: '.dealCardV3__price, .dealCard__price',
            originalPrice: '.dealCardV3__originalPrice, .dealCard__originalPrice',
            voteCount: '.dealCardSocialControls__voteCount',
            dealBadge: '.dealCardBadge, .dealCardV3__badgeContainer',
            priceContainer: '.dealCardV3__priceContainer, .dealCard__priceContainer',
            dealTitle: 'a.dealCard__title, a.dealCardV3__title'
        };
        const CLASS_NAMES = { 
            HIGHLIGHT_RATING:'highlightRating', 
            HIGHLIGHT_DIFF:'highlightDiff', 
            HIGHLIGHT_BOTH:'highlightBoth', 
            IS_FREE:'isFree', 
            IS_PROMOTED:'isPromoted', 
            IS_GOLD:'isGold', 
            HIDE:'sd-plus-hide', 
            HAS_PROMOTED:'sdp-has-promoted', 
            HAS_EXPIRED:'sdp-has-expired' 
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
    const ValidationModule = (function() {
        function isValidHexColor(str) { 
            return typeof str === 'string' && /^#[0-9A-Fa-f]{6}$/.test(str); 
        }
        function validateSettings(imported, defaults) {
            const validated = {}, warnings = [];
            if (typeof imported !== 'object' || imported === null) {
                return { settings: {...defaults}, isValid: false, errors: ['Invalid object'], warnings: [] };
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
    const UtilsModule = (function() {
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
        return { waitForElement, parsePrice, debounce, processInBatches };
    })();

    // ============================================
    // MODULE: Link Resolution
    // ============================================
    const LinkResolutionModule = (function() {
        const TRACKING_PARAMS = ['pno','sdtid','tid','pcoid','lno','u2'];
        
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
                return u2 ? decodeURIComponent(u2) : null; 
            } catch { 
                return null; 
            }
        }
        
        function resolveRedirectWithGM(trackingUrl) {
            return new Promise(resolve => {
                if (typeof GM_xmlhttpRequest === 'undefined') {
                    return resolve({ finalUrl: null });
                }
                try {
                    GM_xmlhttpRequest({
                        method: 'HEAD', 
                        url: trackingUrl,
                        timeout: 5000,
                        onload: res => resolve({ finalUrl: res.finalUrl && res.finalUrl !== trackingUrl ? res.finalUrl : null }),
                        onerror: () => resolve({ finalUrl: null }),
                        ontimeout: () => resolve({ finalUrl: null })
                    });
                } catch {
                    resolve({ finalUrl: null });
                }
            });
        }
        return { isTrackingLink, extractDestinationUrl, resolveRedirectWithGM };
    })();

    // ============================================
    // MODULE: Settings (BUG FIX #4 - Null guards)
    // ============================================
    function SettingsModule() {
        let settings = null;
        let originalPosCounter = 0;
        const STORAGE_KEY = 'sdPlus_settings_master';
        const LEGACY_KEYS = ['sdPlus_settings_v32','sdPlus_settings_v31','sdPlus_settings_v30','sdPlus_settings_v28'];

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
                log.info('Settings:', settings);
                log.info('GM Raw:', typeof GM_getValue === 'function' ? GM_getValue(STORAGE_KEY) : 'GM_getValue not available');
                try {
                    log.info('localStorage Raw:', localStorage.getItem(STORAGE_KEY));
                } catch {
                    log.info('localStorage: blocked');
                }
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
                const navBar = await UtilsModule.waitForElement(ConstantsModule.SELECTORS.navBar);
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
                                    <div class="sd-plus-section collapsed"><div class="sd-plus-header">Display & Layout <span class="arrow">▼</span></div><div class="sd-plus-content">
                                        <label class="switch-row"><span>Hide Page Clutter</span><input type="checkbox" data-setting="hidePageClutter" class="sd-switch-input"><span class="sd-switch-slider"></span></label>
                                        <label class="switch-row"><span>Hide Ads</span><input type="checkbox" data-setting="hideFeedAds" class="sd-switch-input"><span class="sd-switch-slider"></span></label>
                                        <label class="switch-row"><span>Hide Promoted</span><input type="checkbox" data-setting="hidePromoted" class="sd-switch-input"><span class="sd-switch-slider"></span></label>
                                        <label class="switch-row"><span>Price First</span><input type="checkbox" data-setting="priceFirst" class="sd-switch-input"><span class="sd-switch-slider"></span></label>
                                        <label class="switch-row"><span>Show Price Diff</span><input type="checkbox" data-setting="showDiff" class="sd-switch-input"><span class="sd-switch-slider"></span></label>
                                        <label class="switch-row"><span>Bypass Redirects</span><input type="checkbox" data-setting="bypassRedirects" class="sd-switch-input"><span class="sd-switch-slider"></span></label>
                                    </div></div>
                                    <div class="sd-plus-section"><div class="sd-plus-header">Filters & Sort <span class="arrow">▼</span></div><div class="sd-plus-content">
                                        <label class="switch-row"><span>Show Free Only</span><input type="checkbox" data-setting="freeOnly" class="sd-switch-input"><span class="sd-switch-slider"></span></label>
                                        <label class="switch-row"><span>Gold Tier Only</span><input type="checkbox" data-setting="goldTierOnly" class="sd-switch-input"><span class="sd-switch-slider"></span></label>
                                        <div class="control-group"><span>Sort By:</span><select data-setting="sortBy" class="sd-plus-select"><option value="default">Default</option><option value="date">Newest</option><option value="discount">Discount %</option><option value="rating">Rating</option></select></div>
                                        <div class="control-group"><span>Price Range ($):</span><div class="range-inputs"><input type="number" data-setting="minPrice" placeholder="Min" class="sd-plus-input-text"><span>-</span><input type="number" data-setting="maxPrice" placeholder="Max" class="sd-plus-input-text"></div></div>
                                        <div class="control-group"><span>Block Keywords:</span><textarea data-setting="excludeKeywords" class="sd-plus-textarea" placeholder="e.g. refurbished, used"></textarea></div>
                                    </div></div>
                                    <div class="sd-plus-section collapsed"><div class="sd-plus-header">Highlighting <span class="arrow">▼</span></div><div class="sd-plus-content">
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
                const s = context.settings.getSettings();
                let count = 0;
                if (s.freeOnly) count++;
                if (s.goldTierOnly) count++;
                if (s.minPrice && parseFloat(s.minPrice) > 0) count++;
                if (s.maxPrice && parseFloat(s.maxPrice) > 0) count++;
                if (s.excludeKeywords && s.excludeKeywords.trim()) count++;
                if (s.sortBy !== 'default') count++;
                const btn = document.querySelector('.sd-plus-menu-button');
                if (btn) btn.innerHTML = `Slickdeals+${count > 0 ? `<span class="filter-badge">${count}</span>` : ''}`;
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
                        let value = el.type === 'checkbox' ? el.checked : (el.type === 'number' ? parseInt(el.value, 10) || 0 : el.value);
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
                    if (['excludeKeywords','minPrice','maxPrice'].includes(key)) {
                        debouncedSave(key, e.target.value);
                    }
                });

                // Clear filters button
                const clearBtn = newMenuBody.querySelector('#sdPlusClearFiltersButton');
                if (clearBtn) {
                    clearBtn.addEventListener('click', () => {
                        try {
                            const s = context.settings.getSettings();
                            Object.assign(s, { freeOnly:false, goldTierOnly:false, minPrice:'', maxPrice:'', excludeKeywords:'', sortBy:'default' });
                            populateMenu();
                            context.settings.saveSettings();
                            context.eventBus.emit('settingsChanged', { key:'all', allSettings:s });
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
                                context.eventBus.emit('settingsChanged', { key:'all', allSettings:s });
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
                            const blob = new Blob([JSON.stringify(context.settings.getSettings(), null, 2)], { type:'application/json' });
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
                                        context.eventBus.emit('settingsChanged', { key:'all', allSettings:context.settings.getSettings() });
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
        const STATIC_CSS = `#sdPlusToastContainer{pointer-events:none}#sdPlusToastContainer>div{pointer-events:auto}#sdPlusNavMenu{position:relative}.sd-plus-menu-button{cursor:pointer;color:#333;font-weight:bold;padding:6px 10px;background:#fff;border:1px solid #ccc;border-radius:4px;display:inline-flex;align-items:center}.sd-plus-menu-dropdown{display:none}#sdPlusNavMenu.menu-open .sd-plus-menu-dropdown{display:block;position:absolute;top:100%;left:0;width:340px;background:#fff;border:1px solid #ccc;border-radius:8px;z-index:10000;font-family:Arial,sans-serif;font-size:13px;color:#333;text-align:left;box-shadow:0 4px 15px rgba(0,0,0,0.2)}#sdPlusMenuBody{padding:12px;max-height:85vh;overflow-y:auto}.filter-badge{display:inline-block;background:#ff5252;color:#fff;font-size:10px;font-weight:bold;border-radius:10px;padding:2px 6px;margin-left:5px}.filter-active{background:#e8f5e9!important;border-left:3px solid #34C759;padding-left:5px}.sd-plus-clear-btn{background:#FF9800!important;color:#fff}.sd-plus-section{border-bottom:1px solid #eee;margin-bottom:5px;padding-bottom:5px}.sd-plus-header{font-weight:bold;cursor:pointer;padding:8px 5px;background:#f9f9f9;display:flex;justify-content:space-between;border-radius:4px}.sd-plus-header:hover{background:#eee}.sd-plus-section.collapsed .sd-plus-content{display:none}.sd-plus-section.collapsed .arrow{transform:rotate(-90deg)}.sd-plus-content{padding:8px 5px}.switch-row{display:flex;justify-content:space-between;margin-bottom:8px;cursor:pointer;align-items:center}.sd-switch-input{display:none}.sd-switch-slider{position:relative;width:34px;height:18px;background:#ccc;border-radius:20px;transition:.3s}.sd-switch-slider:before{content:"";position:absolute;width:14px;height:14px;left:2px;bottom:2px;background:#fff;border-radius:50%;transition:.3s}.sd-switch-input:checked+.sd-switch-slider{background:#34C759}.sd-switch-input:checked+.sd-switch-slider:before{transform:translateX(16px)}.control-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}.control-group{margin-bottom:10px}.control-group span{display:block;margin-bottom:4px;color:#666;font-weight:500}.sd-plus-input-number{width:50px;padding:4px;border:1px solid #ddd;text-align:center;border-radius:4px}.sd-plus-input-text{width:60px;padding:4px;border:1px solid #ddd;border-radius:4px}.sd-plus-textarea{width:96%;padding:5px;border:1px solid #ddd;border-radius:4px;resize:vertical;min-height:40px;font-family:Arial}.sd-plus-select{padding:4px;border:1px solid #ddd;width:120px;border-radius:4px}.range-inputs{display:flex;gap:8px;align-items:center}.sd-plus-footer{display:flex;gap:5px;margin-top:15px;padding-top:10px;border-top:1px solid #eee}.sd-plus-footer button{flex:1;border:none;padding:8px;border-radius:4px;cursor:pointer;color:#fff;font-weight:bold}#sdPlusResetButton{background:#607d8b}.sd-plus-button-group button{background:#607d8b;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;color:#fff;width:32%}.dealCard.sd-plus-hide{display:none!important}html.hidePageClutter-enabled .redesignFrontpageDesktop{display:block!important;width:96%!important;max-width:none!important;margin:0 auto!important}ul.frontpageGrid,ul.cmsDealFeed__dealContainer{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(230px,1fr))!important;gap:20px!important;width:100%!important}.dealCardV3,.dealCard,[data-threadid]{width:auto!important;max-width:none!important;height:100%!important}html:not(.priceFirst-enabled) .dealCard__content,html:not(.priceFirst-enabled) .dealCardV3__mainContent{grid-template-areas:"image image image" "title title title" "price originalPrice fireIcon" "extraInfo extraInfo extraInfo" "store store store"!important;grid-template-rows:auto auto 1.5em 1fr 20px!important}html:not(.priceFirst-enabled).showDiff-enabled .dealCard__content,html:not(.priceFirst-enabled).showDiff-enabled .dealCardV3__mainContent{grid-template-rows:auto auto 3em 1fr 20px!important}html.priceFirst-enabled .dealCard__content,html.priceFirst-enabled .dealCardV3__mainContent{grid-template-areas:"image image image" "price originalPrice fireIcon" "title title title" "extraInfo extraInfo extraInfo" "store store store"!important;grid-template-rows:auto 1.5em auto 1fr 20px!important}html.priceFirst-enabled.showDiff-enabled .dealCard__content,html.priceFirst-enabled.showDiff-enabled .dealCardV3__mainContent{grid-template-rows:auto 3em auto 1fr 20px!important}html.showDiff-enabled .dealCardV3__priceContainer[data-deal-percent]::after,html.showDiff-enabled .dealCard__priceContainer[data-deal-percent]::after{content:"($" attr(data-deal-diff) " | " attr(data-deal-percent) "%)";display:block;width:100%;font-style:italic;margin-top:4px;color:#555;font-size:0.9em}.dealCardV3__priceContainer,.dealCard__priceContainer{display:flex!important;flex-wrap:wrap!important;align-items:baseline}html.hidePageClutter-enabled #sideColumn,html.hidePageClutter-enabled aside.slickdealsSidebar{display:none!important}html.hidePageClutter-enabled #mainColumn,html.hidePageClutter-enabled main.redesignFrontpageDesktop__main{width:100%!important;max-width:100%!important}li.frontpageGrid__feedItem.sdp-has-expired,li.frontpageGrid__feedItem.expired{order:999!important}a[data-resolved-href]{position:relative;text-decoration:none!important}a[data-resolved-href] .dealCard__title,a[data-resolved-href].dealCard__title{color:#2e7d32!important}.sdp-bypass-indicator{display:inline-block;width:12px;height:12px;margin-left:5px;background:#4CAF50;border-radius:50%}`;

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
                
                let css = `.dealCard.highlightRating{background:${cR}!important}.dealCard.highlightDiff{background:${cD}!important}.dealCard.highlightBoth{background:${cB}!important}`;
                
                if (s.hideFeedAds) {
                    css += ConstantsModule.SELECTORS.ads.join(',') + '{display:none!important}';
                }
                if (s.hidePageClutter) {
                    css += ConstantsModule.SELECTORS.clutterElements.join(',') + '{display:none!important}';
                }
                if (s.hidePromoted) {
                    css += 'li.sdp-has-promoted{display:none!important}';
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

        function getCachedElements(card) {
            if (!elementCache.has(card)) {
                try {
                    const titleEl = card.querySelector(ConstantsModule.SELECTORS.dealTitle);
                    elementCache.set(card, {
                        priceEl: card.querySelector(ConstantsModule.SELECTORS.dealPrice),
                        priceContainer: card.querySelector(ConstantsModule.SELECTORS.priceContainer),
                        originalEl: card.querySelector(ConstantsModule.SELECTORS.originalPrice),
                        voteEl: card.querySelector(ConstantsModule.SELECTORS.voteCount),
                        badgeEl: card.querySelector(ConstantsModule.SELECTORS.dealBadge),
                        dateCard: card.querySelector('.slickdealsTimestamp'),
                        titleText: titleEl ? titleEl.innerText?.toLowerCase() || '' : ''
                    });
                } catch (e) {
                    log.debug('getCachedElements error:', e);
                    return null;
                }
            }
            return elementCache.get(card);
        }

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
                                    window.open(dest, '_blank'); 
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
            
            try {
                const li = card.closest('li');
                if (li && !li.dataset.sdOriginalPos) {
                    li.dataset.sdOriginalPos = context.settings.getOriginalPosCounter();
                }

                const el = getCachedElements(card);
                if (!el || !el.priceEl || !el.priceContainer) {
                    card.dataset.sdpProcessed = 'true';
                    return;
                }

                const currentPrice = UtilsModule.parsePrice(el.priceEl.textContent);
                const originalPrice = UtilsModule.parsePrice(el.originalEl?.textContent);
                const votes = parseInt(el.voteEl?.textContent || '0', 10) || 0;

                let percent = 0;
                if (!isNaN(currentPrice) && !isNaN(originalPrice) && originalPrice > currentPrice) {
                    percent = Math.round((1 - currentPrice / originalPrice) * 100);
                    el.priceContainer.dataset.dealDiff = (originalPrice - currentPrice).toFixed(2);
                    el.priceContainer.dataset.dealPercent = String(percent);
                }

                if (li) { 
                    li.dataset.sdpPrice = String(currentPrice); 
                    li.dataset.sdpRating = String(votes); 
                    li.dataset.sdpDiscount = String(percent); 
                }

                const s = context.settings.getSettings();
                const isFree = currentPrice === 0;
                const isPromoted = el.badgeEl?.textContent?.toLowerCase().includes('promoted') || false;
                const meetsRating = votes >= s.highlightRating;
                const meetsDiff = percent >= s.highlightDiff;
                const isGold = meetsRating && meetsDiff;

                card.classList.remove('highlightRating', 'highlightDiff', 'highlightBoth', 'isFree', 'isPromoted', 'isGold');
                if (isGold) card.classList.add('highlightBoth', 'isGold');
                else if (meetsRating) card.classList.add('highlightRating');
                else if (meetsDiff) card.classList.add('highlightDiff');
                card.classList.toggle('isFree', isFree);
                card.classList.toggle('isPromoted', isPromoted);
                if (li) li.classList.toggle('sdp-has-promoted', isPromoted);

                let shouldHide = (s.freeOnly && !isFree) || (s.goldTierOnly && !isGold);
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
                if (li) { 
                    li.classList.toggle('sd-plus-hide', shouldHide); 
                    li.style.display = shouldHide ? 'none' : ''; 
                }

                processLinksInCard(card);
                card.dataset.sdpProcessed = 'true';
                
            } catch (e) {
                log.debug('processDealCard error:', e);
                card.dataset.sdpProcessed = 'true'; // Mark as processed to avoid retrying
            }
        }

        const debouncedProcess = UtilsModule.debounce(cards => {
            UtilsModule.processInBatches(cards, processDealCard).then(() => {
                context.eventBus.emit('batchComplete');
            });
        }, 300);

        return {
            processAllCards: async (force) => {
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
                }
            },
            debouncedProcess
        };
    }

    // ============================================
    // MODULE: Sorting
    // ============================================
    function SortingModule(context) {
        function applySorting() {
            try {
                const s = context.settings.getSettings();
                const feed = document.querySelector(ConstantsModule.SELECTORS.dealFeed);
                if (!feed) {
                    log.debug('Feed not found for sorting');
                    return;
                }

                const items = Array.from(feed.children).filter(n => n.nodeName === 'LI');
                
                const compare = (a, b) => {
                    if (s.sortBy === 'default') {
                        return (parseInt(a.dataset.sdOriginalPos, 10) || 0) - (parseInt(b.dataset.sdOriginalPos, 10) || 0);
                    }
                    const k = s.sortBy === 'date' ? 'sdpDate' : (s.sortBy === 'rating' ? 'sdpRating' : 'sdpDiscount');
                    return (parseFloat(b.dataset[k]) || 0) - (parseFloat(a.dataset[k]) || 0);
                };
                
                items.sort(compare);
                items.forEach((li, i) => { 
                    li.style.order = String(i); 
                    if (li.classList.contains('sd-plus-hide')) {
                        li.style.display = 'none';
                    } else {
                        li.style.removeProperty('display');
                    }
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
            log.info('Initializing v32.2.0...');

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
                settings: null 
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
            context.processing = ProcessingModule(context);
            context.sorting = SortingModule(context);
            const menu = MenuModule(context);
            context.menu = menu;

            // Create UI
            await menu.createMenu();
            
            // Process existing cards
            await context.processing.processAllCards(true);
            context.sorting.applySorting();

            // BUG FIX: Delayed reprocess to catch lazy-loaded deals
            // Slickdeals lazy-loads content that may not trigger MutationObserver
            const reprocessUnprocessed = () => {
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

            // BUG FIX #3: Safe observer setup - watch document.body for broader coverage
            try {
                const feed = await UtilsModule.waitForElement(ConstantsModule.SELECTORS.dealFeed);
                if (feed) {
                    const observer = new MutationObserver(ms => {
                        try {
                            let hasNewContent = false;
                            ms.forEach(m => {
                                // Check for new nodes
                                m.addedNodes.forEach(n => { 
                                    if (n.nodeType === 1) {
                                        if (n.matches?.(ConstantsModule.SELECTORS.dealCard) || 
                                            n.querySelector?.(ConstantsModule.SELECTORS.dealCard)) {
                                            hasNewContent = true;
                                        }
                                    }
                                });
                                // Also check for attribute/class changes that might reveal hidden deals
                                if (m.type === 'attributes' && m.target.matches?.(ConstantsModule.SELECTORS.dealCard)) {
                                    hasNewContent = true;
                                }
                            });
                            if (hasNewContent) {
                                reprocessUnprocessed();
                            }
                        } catch (e) {
                            log.debug('Observer callback error:', e);
                        }
                    });
                    // Watch for childList AND attributes (for lazy-reveal)
                    observer.observe(feed, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
                    log.debug('Feed observer attached');
                } else {
                    log.warn('Deal feed not found - observer not attached');
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
                const reprocessKeys = ['hidePromoted','freeOnly','goldTierOnly','highlightRating','highlightDiff','bypassRedirects','showDiff','minPrice','maxPrice','excludeKeywords'];
                if (reprocessKeys.includes(key) || key === 'all') {
                    context.processing.processAllCards(true).then(() => context.sorting.applySorting());
                } else if (key === 'sortBy') {
                    context.sorting.applySorting();
                }
            });
            
            context.eventBus.on('batchComplete', () => context.sorting.applySorting());

            // Expose debug interface to BOTH contexts
            const debugInterface = { 
                version: '32.2.0',
                settings: context.settings, 
                testToast: (m, t) => ToastModule.show(m || 'Test!', t || 'info'), 
                dump: () => context.settings.debugDump(),
                reprocess: () => context.processing.processAllCards(true).then(() => context.sorting.applySorting())
            };
            
            // Expose to sandbox context
            window.sdPlus = debugInterface;
            
            // Expose to page context (for console access)
            if (typeof unsafeWindow !== 'undefined') {
                unsafeWindow.sdPlus = debugInterface;
            }

            log.info('Ready. Debug: window.sdPlus');
            
            // Delay toast to ensure everything is stable
            setTimeout(() => {
                ToastModule.show('Slickdeals+ v32.2.0 loaded', 'success', 2000);
            }, 500);
            
        }, 'Init');
    })();
})();
