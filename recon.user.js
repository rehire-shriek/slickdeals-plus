// ==UserScript==
// @name         Slickdeals+ Recon (READ-ONLY)
// @namespace    rehire-shriek
// @version      0.1.0
// @description  READ-ONLY reconnaissance for slickdeals.net. Diffs the LIVE DOM against v32.3.9's hardcoded selector contract (which selectors still match? which are DEAD?), discovers deal cards heuristically (independent of the old class names), drafts a replacement SELECTORS block, and passively peeks at the network/hydration layer to find any JSON deal-feed API. NOTHING leaves the browser until you click a Copy button. Goal: turn "the script is broken" into "here are the new class names." DELETE after the selector fix ships.
// @match        *://slickdeals.net/*
// @match        *://*.slickdeals.net/*
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// ==/UserScript==

/*
 * WHY THIS EXISTS
 * ---------------
 * Slickdeals+ v32.3.9 is entirely selector-driven: every feature funnels through 14 hardcoded
 * BEM class selectors (ConstantsModule.SELECTORS). When Slickdeals redesigns the frontpage, the
 * class names drift, every selector misses at once, and because the script is wrapped in
 * try/catch everywhere it fails SILENTLY — it just stops doing anything. That's the symptom.
 *
 * This script reads nothing of yours and sends nothing anywhere. It just answers:
 *   1. SELECTOR HEALTH — of v32.3.9's 14 selectors, which still match the live DOM, and how
 *      many? (0 = DEAD = the thing that broke.)
 *   2. CARD DISCOVERY — without trusting the old classes, where are the deal cards now, what is
 *      the feed container, and what are the NEW class names? It drafts a replacement SELECTORS.
 *   3. NETWORK / HYDRATION — do deals arrive as a JSON API response or sit in a hydration blob
 *      (__NEXT_DATA__ / <script type=application/json>)? If so, that's a far more stable source
 *      than scraping volatile CSS classes.
 *
 * HOW TO USE
 *   1. Install in Tampermonkey. DISABLE the real Slickdeals+ userscript first (avoid its hooks
 *      and DOM mutations polluting the read).
 *   2. Load slickdeals.net frontpage. Let it settle (~3s) and scroll once so lazy deals render.
 *   3. Click "📋 Copy All" in the floating panel (or use the individual buttons).
 *   4. Paste the result back to Claude. That's the whole selector-relock step.
 *
 * READ-ONLY GUARANTEE: network hooks only observe (clone responses, pass through, try/catch
 * everywhere — never clobber handlers, never block a request). No app DOM is mutated except our
 * own floating panel. No automatic egress.
 */

(function () {
  'use strict';

  const VERSION = '0.1.0';
  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

  const CONFIG = {
    maxEvents: 800,        // network ring-buffer cap
    bodyMaxLen: 5000,      // per response body kept in the report
    sampleMaxLen: 2500,    // JSON "sample record" truncation
    cardOutlineMax: 6000,  // sanitized sample-card HTML cap
    minListChildren: 5,    // a container needs >= this many similar children to count as a "feed"
    modalShareMin: 0.55,   // >= this fraction of children sharing one signature => it's a list
  };

  // ---- v32.3.9's EXACT selector contract (verbatim) — what we diff against ----
  const V3239_SELECTORS = {
    navBar: 'ul.slickdealsHeader__linkSection',
    sideColumn: '#sideColumn, aside.slickdealsSidebar',
    mainContent: '#mainColumn, main.redesignFrontpageDesktop__main',
    pageGrid: '.redesignFrontpageDesktop',
    clutterElements: ['#sideColumn', 'aside.slickdealsSidebar', '[data-section-title="Just For You"]', '.frontpageRecommendationCarousel', '.justForYouCarousel', '.dealAlertsForYou', 'li.dealAlertsForYou'],
    ads: ['#crt-adblock-a', '#crt-adblock-b', '.frontpageGrid__bannerAd', '.ad', '.variableWidthAd', '.variableHeightAd', '.frontpageAd__middleBanner', '[data-googleQueryId]', '.adunit', 'div[data-adlocation]'],
    dealFeed: 'ul.frontpageGrid, ul.cmsDealFeed__dealContainer',
    dealCard: '.dealCardV3, .dealCard, [data-threadid]',
    dealCardContent: '.dealCard__content, .dealCardV3__mainContent',
    dealPrice: '.dealCardV3__price, .dealCard__price',
    originalPrice: '.dealCardV3__originalPrice, .dealCard__originalPrice',
    voteCount: '.dealCardSocialControls__voteCount',
    dealBadge: '.dealCardBadge, .dealCardV3__badgeContainer',
    priceContainer: '.dealCardV3__priceContainer, .dealCard__priceContainer',
    dealTitle: 'a.dealCard__title, a.dealCardV3__title',
  };

  // ---- shared helpers --------------------------------------------------------
  function trunc(s, n) {
    if (s == null) return '';
    s = String(s);
    return s.length > n ? s.slice(0, n) + ` …[+${s.length - n} chars]` : s;
  }
  function safeCount(sel) {
    try { return document.querySelectorAll(sel).length; } catch (e) { return `(bad selector: ${e.message})`; }
  }
  function sig(el) {
    if (!el || !el.tagName) return '';
    const cls = el.classList && el.classList.length ? '.' + [...el.classList].join('.') : '';
    const id = el.id ? '#' + el.id : '';
    return el.tagName.toLowerCase() + id + cls;
  }
  function classSel(el) { // a usable CSS selector from an element's own classes
    if (!el || !el.classList || !el.classList.length) return el ? el.tagName.toLowerCase() : '';
    return el.tagName.toLowerCase() + '.' + [...el.classList].join('.');
  }
  // Depth-limited shape summary for JSON bodies.
  function shapeOf(v, depth) {
    depth = depth == null ? 0 : depth;
    if (depth > 4) return '…';
    if (v === null) return 'null';
    if (Array.isArray(v)) return v.length === 0 ? '[]' : `[${v.length} × ${shapeOf(v[0], depth + 1)}]`;
    if (typeof v === 'object') {
      const keys = Object.keys(v);
      const head = keys.slice(0, 40);
      return `{ ${head.map(k => `${k}: ${shapeOf(v[k], depth + 1)}`).join(', ')}${keys.length > head.length ? ', …' : ''} }`;
    }
    if (typeof v === 'string') return `str(${v.length})`;
    return typeof v;
  }
  function summarizeJSON(text) {
    try {
      const obj = JSON.parse(text);
      return { shape: shapeOf(obj, 0), sample: trunc(JSON.stringify(obj, null, 1), CONFIG.sampleMaxLen) };
    } catch (e) { return { shape: '(non-JSON or parse failed)', sample: '' }; }
  }
  // Heuristic: does this text/JSON look like deal data?
  const DEAL_KEY_RE = /"(threadId|thread_id|dealId|deal_id|threads|deals|salePrice|listPrice|dealPrice|storeName|attributes|ratingCount|totalVotes|originalPrice)"\s*:/i;

  // ---- network hooks (passive, clone-only) -----------------------------------
  const api = []; // {seq, via, method, url, status, ctype, shape, sample, dealish, err}
  let seq = 0, healthy = true;
  function cap(item) { api.push(item); if (api.length > CONFIG.maxEvents) api.shift(); }

  function hookFetch() {
    const orig = W.fetch;
    if (typeof orig !== 'function') return;
    W.fetch = function (input, init) {
      let url = '', method = 'GET';
      try {
        url = (typeof input === 'string') ? input : (input && input.url) || '';
        method = (init && init.method) || (input && input.method) || 'GET';
      } catch (e) {}
      const rec = { seq: ++seq, via: 'fetch', method, url, status: '', ctype: '', shape: '', sample: '', dealish: false, err: '' };
      cap(rec);
      let p;
      try { p = orig.apply(this, arguments); } catch (e) { rec.err = 'call threw: ' + e; throw e; }
      return p.then(res => {
        try {
          rec.status = res.status;
          rec.ctype = res.headers && res.headers.get ? (res.headers.get('content-type') || '') : '';
          if (/json|text|graphql/i.test(rec.ctype)) {
            res.clone().text().then(t => {
              rec.dealish = DEAL_KEY_RE.test(t);
              const s = summarizeJSON(t);
              rec.shape = s.shape; rec.sample = s.sample || trunc(t, CONFIG.bodyMaxLen);
            }).catch(() => {});
          } else { rec.shape = '(binary/non-text — body not read)'; }
        } catch (e) { rec.err = 'resp read: ' + e; }
        return res;
      }).catch(err => { rec.err = 'rejected: ' + err; throw err; });
    };
  }
  function hookXHR() {
    const XHR = W.XMLHttpRequest;
    if (!XHR || !XHR.prototype) return;
    const open = XHR.prototype.open, send = XHR.prototype.send;
    XHR.prototype.open = function (method, url) { try { this.__recon = { method, url }; } catch (e) {} return open.apply(this, arguments); };
    XHR.prototype.send = function (body) {
      const info = this.__recon || {};
      const rec = { seq: ++seq, via: 'xhr', method: info.method || 'GET', url: info.url || '', status: '', ctype: '', shape: '', sample: '', dealish: false, err: '' };
      cap(rec);
      try {
        this.addEventListener('load', function () {
          try {
            rec.status = this.status;
            rec.ctype = this.getResponseHeader ? (this.getResponseHeader('content-type') || '') : '';
            let t = '';
            if (this.responseType === 'json' && this.response) t = JSON.stringify(this.response);
            else if (typeof this.responseText === 'string') t = this.responseText;
            if (t) { rec.dealish = DEAL_KEY_RE.test(t); const s = summarizeJSON(t); rec.shape = s.shape; rec.sample = s.sample || trunc(t, CONFIG.bodyMaxLen); }
          } catch (e) { rec.err = 'xhr load: ' + e; }
        });
      } catch (e) { rec.err = 'xhr hook: ' + e; }
      return send.apply(this, arguments);
    };
  }

  // ============================================================================
  // REPORT 1 — SELECTOR HEALTH (the headline: what drifted?)
  // ============================================================================
  function buildSelectorHealth() {
    const L = [];
    L.push(`=== SLICKDEALS+ RECON v${VERSION} — SELECTOR HEALTH ===`);
    L.push(`url: ${location.href}`);
    L.push(`title: ${document.title}`);
    L.push('Diffing v32.3.9 ConstantsModule.SELECTORS against the live DOM. 0 = DEAD (this is what broke).');
    L.push('');
    for (const [name, val] of Object.entries(V3239_SELECTORS)) {
      const list = Array.isArray(val) ? val : [val];
      // a single selector string may contain comma-separated alternatives — break those out too
      const clauses = list.flatMap(s => s.split(',').map(x => x.trim()));
      const total = clauses.reduce((acc, c) => { const n = safeCount(c); return acc + (typeof n === 'number' ? n : 0); }, 0);
      const flag = total === 0 ? '  ❌ DEAD' : (total > 0 ? '  ✅' : '');
      L.push(`${name}: ${total} match${total === 1 ? '' : 'es'}${flag}`);
      // per-clause breakdown so we see WHICH alternative carried it (or that all are dead)
      if (clauses.length > 1) {
        clauses.forEach(c => L.push(`     ${String(safeCount(c)).padStart(4)}  ${c}`));
      }
    }
    L.push('');
    L.push('Reading: if dealCard / dealFeed / dealTitle / dealPrice are 0, that is the silent break —');
    L.push('processAllCards() finds nothing and every feature no-ops. navBar=0 means the settings menu vanished.');
    return L.join('\n');
  }

  // ============================================================================
  // REPORT 2 — CARD DISCOVERY (selector-independent) + draft replacement SELECTORS
  // ============================================================================
  // Find containers whose children are mostly the same shape (= a list/feed), score by how
  // "deal-like" a sample child is (contains a $price and an anchor), and report the winners.
  function findRepeatedLists() {
    const out = [];
    let els;
    try { els = document.querySelectorAll('ul, ol, div, section'); } catch (e) { return out; }
    els.forEach(container => {
      const kids = container.children;
      if (!kids || kids.length < CONFIG.minListChildren) return;
      const counts = new Map();
      for (const k of kids) { const s = sig(k); counts.set(s, (counts.get(s) || 0) + 1); }
      let modalSig = '', modalN = 0;
      for (const [s, n] of counts) if (n > modalN) { modalN = n; modalSig = s; }
      if (modalN / kids.length < CONFIG.modalShareMin) return;
      // sample item = first child matching the modal signature
      let sample = null;
      for (const k of kids) if (sig(k) === modalSig) { sample = k; break; }
      if (!sample) return;
      const txt = (sample.textContent || '');
      const hasPrice = /\$\s?\d/.test(txt) || /\bfree\b/i.test(txt);
      const hasLink = !!sample.querySelector('a[href]');
      const hasThread = !!(sample.matches('[data-threadid]') || sample.querySelector('[data-threadid]'));
      const dealScore = (hasPrice ? 2 : 0) + (hasLink ? 1 : 0) + (hasThread ? 2 : 0);
      out.push({ container, modalSig, modalN, total: kids.length, sample, hasPrice, hasLink, hasThread, dealScore });
    });
    // most deal-like first, then largest lists
    out.sort((a, b) => (b.dealScore - a.dealScore) || (b.modalN - a.modalN));
    return out;
  }

  // Within a sample card, best-guess the role-bearing descendants for a SELECTORS draft.
  function guessRoles(card) {
    const roles = {};
    const q = (fn) => { try { return [...card.querySelectorAll('*')].find(fn) || null; } catch (e) { return null; } };
    // title: an anchor with real text linking to a thread/deal
    roles.dealTitle = q(el => el.tagName === 'A' && el.getAttribute('href') && /\/f\/|\/g\/|threadid|\/p\//i.test(el.getAttribute('href') || '') && (el.textContent || '').trim().length > 12)
                   || q(el => el.tagName === 'A' && (el.textContent || '').trim().length > 20);
    // price: a smallish element whose trimmed text starts with $ (or is "Free")
    roles.dealPrice = q(el => el.children.length <= 1 && /^\$\s?[\d,]+(\.\d+)?$/.test((el.textContent || '').trim()))
                   || q(el => el.children.length <= 1 && /^free$/i.test((el.textContent || '').trim()));
    // originalPrice: struck-through $ text, or an element whose class hints "original/old/list/strike"
    roles.originalPrice = q(el => el.children.length <= 1 && /\$\s?[\d,]/.test(el.textContent || '') && /line-through/i.test(getComputedStyle(el).textDecorationLine || ''))
                       || q(el => /original|oldprice|listprice|strike|wasprice/i.test(el.className || ''));
    // vote/rating
    roles.voteCount = q(el => /vote|rating|thumb|reaction/i.test(el.className || ''))
                   || q(el => /\b\d+\s+(votes?|ratings?)\b/i.test((el.textContent || '').trim()) && el.children.length <= 2);
    // badge
    roles.dealBadge = q(el => /badge|tag|flag|label/i.test(el.className || '') && (el.textContent || '').trim().length > 0 && (el.textContent || '').trim().length < 30);
    return roles;
  }

  function describe(el, label) {
    if (!el) return `  ${label}: (not found)`;
    const t = (el.textContent || '').trim().replace(/\s+/g, ' ');
    return `  ${label}: ${classSel(el)}\n        text: "${trunc(t, 60)}"`;
  }

  // a compact outline of notable descendants (anchors, $-text, classed leaves)
  function cardOutline(card) {
    const L = [];
    const walk = (el, depth) => {
      if (depth > 6) return;
      for (const ch of el.children) {
        const txt = (ch.textContent || '').trim().replace(/\s+/g, ' ');
        const isA = ch.tagName === 'A';
        const hasPrice = /\$\s?\d/.test(txt) && txt.length < 24;
        const leafText = ch.children.length === 0 && txt;
        if (isA || hasPrice || (leafText && ch.classList.length)) {
          const extra = isA && ch.getAttribute('href') ? ` href="${trunc(ch.getAttribute('href'), 60)}"` : '';
          L.push(`${'  '.repeat(depth + 1)}${classSel(ch)}${extra}  →  "${trunc(txt, 50)}"`);
        }
        walk(ch, depth + 1);
        if (L.length > 120) return;
      }
    };
    walk(card, 0);
    return L.join('\n');
  }

  function attrHarvest(card) {
    const seen = new Map();
    const visit = el => {
      if (!el.attributes) return;
      for (const a of el.attributes) {
        if (/^data-|^aria-label$/.test(a.name)) {
          const key = a.name;
          if (!seen.has(key)) seen.set(key, trunc(a.value, 40));
        }
      }
    };
    visit(card);
    try { card.querySelectorAll('*').forEach(visit); } catch (e) {}
    return [...seen.entries()].map(([k, v]) => `  [${k}="${v}"]`).join('\n');
  }

  function buildCardDiscovery() {
    const L = [];
    L.push(`=== SLICKDEALS+ RECON v${VERSION} — CARD DISCOVERY ===`);
    L.push(`url: ${location.href}`);
    L.push('Heuristic (ignores v32.3.9 classes): containers whose children are mostly one shape = lists; scored by deal-likeness ($price + link + threadid).');
    L.push('');
    const lists = findRepeatedLists();
    if (!lists.length) { L.push('(no repeated-child lists found — is this the frontpage? did deals render? try scrolling then re-run.)'); return L.join('\n'); }

    L.push(`--- TOP CANDIDATE FEEDS (${lists.length} lists found, showing up to 4) ---`);
    lists.slice(0, 4).forEach((c, i) => {
      L.push(`[${i + 1}] score=${c.dealScore}  ${c.modalN}/${c.total} children match`);
      L.push(`     feed container : ${classSel(c.container)}`);
      L.push(`     card signature : ${c.modalSig}`);
      L.push(`     signals        : price=${c.hasPrice} link=${c.hasLink} threadid=${c.hasThread}`);
    });
    L.push('');

    const best = lists[0];
    const card = best.sample;
    L.push('--- BEST-GUESS CARD (sample from top candidate) ---');
    L.push(`feed selector : ${classSel(best.container)}`);
    L.push(`card selector : ${classSel(card)}`);
    L.push('');
    L.push('role guesses (map these onto the old SELECTORS keys):');
    const roles = guessRoles(card);
    L.push(describe(roles.dealTitle, 'dealTitle'));
    L.push(describe(roles.dealPrice, 'dealPrice'));
    L.push(describe(roles.originalPrice, 'originalPrice'));
    L.push(describe(roles.voteCount, 'voteCount'));
    L.push(describe(roles.dealBadge, 'dealBadge'));
    L.push('');
    L.push('--- DRAFT SELECTORS (paste-ready starting point — VERIFY each against the outline below) ---');
    L.push('const SELECTORS = {');
    L.push(`    dealFeed: '${classSel(best.container)}',`);
    L.push(`    dealCard: '${classSel(card)}',`);
    L.push(`    dealTitle: '${roles.dealTitle ? classSel(roles.dealTitle) : '/* not found */'}',`);
    L.push(`    dealPrice: '${roles.dealPrice ? classSel(roles.dealPrice) : '/* not found */'}',`);
    L.push(`    originalPrice: '${roles.originalPrice ? classSel(roles.originalPrice) : '/* not found */'}',`);
    L.push(`    voteCount: '${roles.voteCount ? classSel(roles.voteCount) : '/* not found */'}',`);
    L.push(`    dealBadge: '${roles.dealBadge ? classSel(roles.dealBadge) : '/* not found */'}',`);
    L.push('    // navBar / ads / clutter: confirm separately from the health report + page inspection');
    L.push('};');
    L.push('');
    L.push('--- SAMPLE CARD OUTLINE (anchors, $-prices, classed leaves) ---');
    L.push(cardOutline(card));
    L.push('');
    L.push('--- STABLE ANCHORS on the card (data-* / aria-label — survive redesigns better than classes) ---');
    L.push(attrHarvest(card) || '  (none found)');
    L.push('');
    L.push('--- SANITIZED CARD HTML (truncated) ---');
    try {
      const c = card.cloneNode(true);
      c.querySelectorAll('script,style,svg,noscript,path').forEach(n => n.remove());
      L.push(trunc(c.outerHTML.replace(/<!--[\s\S]*?-->/g, '').replace(/[ \t]+/g, ' '), CONFIG.cardOutlineMax));
    } catch (e) { L.push('  (card HTML unavailable: ' + e + ')'); }
    return L.join('\n');
  }

  // ============================================================================
  // REPORT 3 — NETWORK / HYDRATION (is there a JSON deal source?)
  // ============================================================================
  function scanHydration() {
    const L = [];
    // window globals commonly used by SSR frameworks
    for (const k of ['__NEXT_DATA__', '__INITIAL_STATE__', '__PRELOADED_STATE__', '__APP_STATE__', '__data', 'dealsData']) {
      try {
        if (W[k]) {
          const t = JSON.stringify(W[k]);
          L.push(`window.${k}: present (${(t.length / 1024).toFixed(0)}KB)  dealish=${DEAL_KEY_RE.test(t)}`);
          L.push(`   shape: ${shapeOf(W[k], 0)}`);
        }
      } catch (e) {}
    }
    // inline JSON <script> tags
    try {
      const scripts = document.querySelectorAll('script[type="application/json"], script[type="application/ld+json"], script#__NEXT_DATA__');
      scripts.forEach((s, i) => {
        const t = s.textContent || '';
        if (t.length < 40) return;
        const dealish = DEAL_KEY_RE.test(t);
        L.push(`<script ${s.id ? '#' + s.id : s.type}>: ${(t.length / 1024).toFixed(0)}KB  dealish=${dealish}`);
        if (dealish) { const sm = summarizeJSON(t); L.push(`   shape: ${sm.shape}`); }
      });
    } catch (e) {}
    return L.length ? L.join('\n') : '  (no hydration globals or JSON script tags detected)';
  }

  function buildNetwork() {
    const L = [];
    L.push(`=== SLICKDEALS+ RECON v${VERSION} — NETWORK / HYDRATION ===`);
    L.push(`url: ${location.href}`);
    L.push(`captured ${api.length} fetch/xhr calls`);
    L.push('');
    L.push('--- HYDRATION (deals baked into the page at load?) ---');
    L.push(scanHydration());
    L.push('');
    const dealish = api.filter(r => r.dealish);
    L.push(`--- 🎯 DEAL-LIKE API RESPONSES (${dealish.length}) — the live feed endpoint, if any ---`);
    if (!dealish.length) L.push('  (none — deals likely come from server-rendered HTML or the hydration blob above. REFRESH with recon active to be sure.)');
    dealish.forEach(r => {
      L.push(`  [${r.seq}] ${r.via} ${r.method} ${r.url}`);
      L.push(`     res(${r.status} ${r.ctype})  shape: ${r.shape}`);
      if (r.sample) L.push(`     sample: ${r.sample}`);
    });
    L.push('');
    L.push(`--- ALL JSON/TEXT API CALLS (${api.length}) ---`);
    api.forEach(r => {
      L.push(`[${r.seq}] ${r.via} ${r.method} ${r.url}  (${r.status} ${r.ctype})${r.dealish ? '  ★dealish' : ''}`);
      if (r.shape) L.push(`     shape: ${r.shape}`);
      if (r.err) L.push(`     ERR: ${r.err}`);
    });
    return L.join('\n');
  }

  // ---- copy plumbing ---------------------------------------------------------
  function toClip(txt) {
    try { GM_setClipboard(txt, { type: 'text', mimetype: 'text/plain' }); }
    catch (e) { try { navigator.clipboard.writeText(txt); } catch (e2) {} }
  }
  function copyHealth()   { const t = buildSelectorHealth(); toClip(t); flash('selector health copied'); console.log('[sd-recon HEALTH]\n' + t); }
  function copyCards()    { const t = buildCardDiscovery(); toClip(t); flash('card discovery copied'); console.log('[sd-recon CARDS]\n' + t); }
  function copyNetwork()  { const t = buildNetwork(); toClip(t); flash('network copied'); console.log('[sd-recon NET]\n' + t); }
  function copyAll() {
    const t = [buildSelectorHealth(), '', buildCardDiscovery(), '', buildNetwork(), '', '=== END SLICKDEALS+ RECON ==='].join('\n');
    toClip(t); flash(`copied all (${api.length} api calls)`); console.log('[sd-recon ALL]\n' + t);
  }

  // ---- floating panel --------------------------------------------------------
  let badge;
  function flash(msg) { if (badge) { badge.textContent = msg; setTimeout(refresh, 1800); } }
  function refresh() { if (badge) badge.textContent = `${healthy ? '🔍' : '⚠️'} ${api.length} api calls`; }
  function mkBtn(text, bg, fn) {
    const b = document.createElement('button');
    b.textContent = text;
    b.style.cssText = `cursor:pointer;margin:2px 4px 2px 0;padding:3px 7px;background:${bg};color:#fff;border:0;border-radius:5px;font:11px monospace`;
    b.onclick = fn;
    return b;
  }
  function buildPanel() {
    try {
      const box = document.createElement('div');
      box.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:2147483647;background:#1c1c22;color:#eee;font:12px/1.4 monospace;padding:8px 10px;border:1px solid #555;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,.5);max-width:340px';
      const title = document.createElement('div');
      title.textContent = `Slickdeals+ Recon v${VERSION} (read-only)`;
      title.style.cssText = 'opacity:.6;font-size:10px;margin-bottom:4px';
      badge = document.createElement('div');
      badge.style.cssText = 'margin-bottom:6px;font-weight:bold';
      box.append(title, badge,
        mkBtn('🩺 Selector Health', '#c0392b', copyHealth),
        mkBtn('🧩 Dump Cards', '#1f9d55', copyCards),
        mkBtn('🌐 Network', '#9b59b6', copyNetwork),
        mkBtn('📋 Copy All', '#2d6cdf', copyAll));
      (document.body || document.documentElement).appendChild(box);
      refresh();
    } catch (e) { console.error('[sd-recon] panel:', e); }
  }

  // ---- install ---------------------------------------------------------------
  try { hookFetch(); } catch (e) { healthy = false; console.error('[sd-recon] fetch hook', e); }
  try { hookXHR(); } catch (e) { healthy = false; console.error('[sd-recon] xhr hook', e); }
  try { GM_registerMenuCommand('Copy Selector Health', copyHealth); } catch (e) {}
  try { GM_registerMenuCommand('Dump Cards', copyCards); } catch (e) {}
  try { GM_registerMenuCommand('Copy Network', copyNetwork); } catch (e) {}
  try { GM_registerMenuCommand('Copy All', copyAll); } catch (e) {}

  if (document.body) buildPanel();
  else document.addEventListener('DOMContentLoaded', buildPanel);
  setInterval(refresh, 1500);

  console.log(`[sd-recon] v${VERSION} installed — read-only. Disable the real Slickdeals+ script, load the frontpage, scroll once, then click "Copy All".`);
})();
