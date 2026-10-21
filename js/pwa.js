/* ============================================================
   PLUTUS — install as an app (PWA)
   • Registers the service worker.
   • Shows ONE "Install PLUTUS" modal on a visitor's first visit
     (remembered in localStorage, so it never nags again).
   • Chrome / Edge / Android: uses the browser's install prompt.
   • iPhone / iPad (Safari): shows the "Add to Home Screen" steps.
   • Nothing is shown if the app is already installed / running
     as an installed app, or if the browser can't install it.
   ============================================================ */
(function () {
  'use strict';
  const KEY = 'plutus.installPrompt.v1';
  const ls = {
    get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } },
    set() { try { localStorage.setItem(KEY, String(Date.now())); } catch (e) { /* private mode: shown at most once per page load below */ } }
  };
  let shownThisLoad = false, deferred = null, modal = null, lastFocus = null;

  /* ---------- service worker ---------- */
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }

  /* ---------- environment ---------- */
  const isStandalone = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isIOSSafari = () => isIOS() && /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios|opios|gsa\//i.test(navigator.userAgent);

  /* ---------- modal ---------- */
  const SHARE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>';
  const PLUS_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/></svg>';

  function build(mode) {
    const el = document.createElement('div');
    el.className = 'pwa-overlay';
    el.innerHTML = `
      <div class="pwa-modal" role="dialog" aria-modal="true" aria-labelledby="pwaTitle" aria-describedby="pwaDesc">
        <button type="button" class="pwa-close" data-close aria-label="Close">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
        <div class="pwa-orb" aria-hidden="true"><span></span></div>
        <p class="pwa-eyebrow">Install app</p>
        <h2 id="pwaTitle">Keep PLUTUS<br />one tap away</h2>
        <p class="pwa-desc" id="pwaDesc">Add PLUTUS to your device and open it like any other app — straight from your home screen or desktop, in its own full-screen window.</p>
        <ul class="pwa-perks">
          <li><b>Faster</b><span>One tap to launch</span></li>
          <li><b>Cleaner</b><span>No browser bars</span></li>
          <li><b>Anywhere</b><span>Phone, tablet, desktop</span></li>
        </ul>
        ${mode === 'ios' ? `
        <ol class="pwa-steps">
          <li><span class="pwa-step-ico">${SHARE_ICON}</span><span>Tap the <b>Share</b> button in Safari’s toolbar</span></li>
          <li><span class="pwa-step-ico">${PLUS_ICON}</span><span>Choose <b>Add to Home Screen</b>, then tap <b>Add</b></span></li>
        </ol>
        <div class="pwa-actions"><button type="button" class="pwa-btn pwa-btn-primary" data-close>Got it</button></div>` : `
        <div class="pwa-actions">
          <button type="button" class="pwa-btn pwa-btn-primary" data-install>Install app</button>
          <button type="button" class="pwa-btn pwa-btn-ghost" data-close>Not now</button>
        </div>`}
        <p class="pwa-note">Free · no download from a store · remove it any time</p>
      </div>`;
    return el;
  }

  function onKey(e) {
    if (e.key === 'Escape') { close(); return; }
    if (e.key !== 'Tab' || !modal) return;
    const f = Array.from(modal.querySelectorAll('button:not([disabled])'));
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
    else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
  }
  function close() {
    if (!modal) return;
    const m = modal; modal = null;
    document.removeEventListener('keydown', onKey, true);
    document.documentElement.classList.remove('pwa-lock');
    m.classList.remove('in');
    setTimeout(() => m.remove(), 260);
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) { /* ignore */ } }
  }
  async function install() {
    if (!deferred) { close(); return; }
    const d = deferred; deferred = null;
    close();
    try { d.prompt(); await d.userChoice; } catch (e) { /* ignore */ }
  }

  function show(mode) {
    if (shownThisLoad || modal || isStandalone()) return;
    shownThisLoad = true; ls.set();      // "once": remembered the moment it is shown
    lastFocus = document.activeElement;
    modal = build(mode);
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('[data-close]')) close();
      else if (e.target.closest('[data-install]')) install();
    });
    document.body.appendChild(modal);
    document.documentElement.classList.add('pwa-lock');
    document.addEventListener('keydown', onKey, true);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      modal.classList.add('in');
      const b = modal.querySelector('.pwa-btn-primary'); if (b) b.focus({ preventScroll: true });
    }));
  }

  /* ---------- when to show ---------- */
  const seen = () => !!ls.get();
  const afterLoad = (fn, ms) => {
    const go = () => setTimeout(fn, ms);
    if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
  };

  // Chrome / Edge / Samsung Internet / Android: the browser tells us the site is installable
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    if (!seen() && !isStandalone()) afterLoad(() => show('native'), 1200);
  });
  window.addEventListener('appinstalled', () => { deferred = null; ls.set(); close(); });

  // iPhone / iPad Safari has no install event: explain Add to Home Screen instead
  if (isIOSSafari() && !isStandalone() && !seen()) afterLoad(() => show('ios'), 1800);
})();
