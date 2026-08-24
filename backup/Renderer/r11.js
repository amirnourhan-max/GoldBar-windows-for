(() => {
  'use strict';

  const ENTRY_KEY = 'goldbar.windows.entries.v2';
  const SESSION_KEY = 'goldbar.windows.r4.session';
  const IMPORT_RELOAD_KEY = 'goldbar.windows.r4.openRegister';
  const RESET_KEY = 'goldbar.windows.r11.businessReset';
  const ASSAY_RESET_KEY = 'goldbar.windows.r11.assayPageReset';
  const QUICK_RESET_KEY = 'goldbar.windows.r11.quickPageReset';
  const selfTest = Boolean(window.__goldbarR4SelfTest);
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  let requestSeq = 0;
  const pending = new Map();
  let silverObserver = null;
  let pageObserver = null;

  function normalizeDigits(value) {
    const fa = '۰۱۲۳۴۵۶۷۸۹';
    const ar = '٠١٢٣٤٥٦٧٨٩';
    return String(value ?? '')
      .replace(/[۰-۹]/g, d => String(fa.indexOf(d)))
      .replace(/[٠-٩]/g, d => String(ar.indexOf(d)))
      .replace(/,/g, '.');
  }

  function numberValue(value) {
    const n = Number(normalizeDigits(value));
    return Number.isFinite(n) ? n : NaN;
  }

  function formatNumber(value, digits = 3) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0';
    return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: digits });
  }

  function readEntries() {
    try {
      const parsed = JSON.parse(localStorage.getItem(ENTRY_KEY) || '[]');
      return Array.isArray(parsed)
        ? parsed.filter(x => Number(x?.weight) > 0 && Number(x?.assay) > 0 && Number(x?.assay) <= 1000)
        : [];
    } catch { return []; }
  }

  function r11Request(action, payload = null) {
    if (!window.chrome?.webview) return Promise.reject(new Error('ارتباط با برنامه ویندوز در دسترس نیست.'));
    const id = `r11-${++requestSeq}`;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      window.chrome.webview.postMessage({ kind: 'r4request', id, action, payload });
      setTimeout(() => {
        const item = pending.get(id);
        if (!item) return;
        pending.delete(id);
        reject(new Error(`Timeout: ${action}`));
      }, 30000);
    });
  }

  window.chrome?.webview?.addEventListener('message', event => {
    const msg = event.data;
    if (!msg || msg.kind !== 'r4response') return;
    const item = pending.get(msg.id);
    if (!item) return;
    pending.delete(msg.id);
    msg.ok === false ? item.reject(new Error(msg.error || 'Host error')) : item.resolve(msg.data);
  });

  function toast(message) {
    let el = $('#r11Toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'r11Toast';
      el.style.cssText = 'position:fixed;z-index:1000001;left:50%;bottom:28px;transform:translateX(-50%);background:#171a1f;border:1px solid rgba(242,196,91,.45);color:#f4f1e9;border-radius:12px;padding:11px 18px;font:800 13px Tahoma,Arial,sans-serif;box-shadow:0 10px 35px rgba(0,0,0,.4);opacity:0;transition:opacity .18s;direction:rtl';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.style.opacity = '1';
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.style.opacity = '0'; }, 1800);
  }

  // Exact workbook rule (Sheet1 / Table14 / AB6):
  // silverRequired = (silverPercent / 100) * totalAlloyRequired
  // totalAlloyRequired = weight * weightedAverageAssay / targetAssay - weight
  function updateDashboardSilver() {
    const engine = window.__goldbarAssayEngineV2;
    const card = $$('.calc-card')[1];
    if (!engine || !card) return false;

    const inputs = [...card.querySelectorAll('input')];
    const targetAssay = numberValue(inputs[0]?.value);
    const silverPercent = numberValue(inputs[1]?.value);
    const summary = engine.summarize(readEntries());
    const result = engine.alloyForTarget(summary, targetAssay, silverPercent, summary.weight);

    const stat = card.querySelector('.mini-stats > div:first-child');
    const label = stat?.querySelector('span');
    const value = stat?.querySelector('b');
    if (label && label.textContent.trim() !== 'نقره مورد نیاز (g)') label.textContent = 'نقره مورد نیاز (g)';

    const silver = Number.isFinite(result.silverRequired) && result.totalAlloyRequired > 0
      ? result.silverRequired
      : 0;
    const text = formatNumber(silver, 3);
    if (value && value.textContent.trim() !== text) value.textContent = text;

    card.dataset.silverRequired = Number.isFinite(result.silverRequired) ? String(result.silverRequired) : '';
    card.dataset.r11Silver = String(silver);
    return true;
  }

  function bindDashboardSilver() {
    const card = $$('.calc-card')[1];
    if (!card || card.dataset.r11SilverBound === '1') return false;
    card.dataset.r11SilverBound = '1';

    card.querySelectorAll('input').forEach(input => {
      input.addEventListener('input', () => setTimeout(updateDashboardSilver, 0));
      input.addEventListener('change', () => setTimeout(updateDashboardSilver, 0));
    });
    $('#quickSave')?.addEventListener('click', () => setTimeout(updateDashboardSilver, 10));
    $('#quickClearAll')?.addEventListener('click', () => setTimeout(updateDashboardSilver, 10));
    $('#purityInput')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') setTimeout(updateDashboardSilver, 10);
    });

    const stat = card.querySelector('.mini-stats > div:first-child');
    if (stat && !silverObserver) {
      silverObserver = new MutationObserver(() => setTimeout(updateDashboardSilver, 0));
      silverObserver.observe(stat, { childList: true, characterData: true, subtree: true });
    }

    updateDashboardSilver();
    return true;
  }

  function clearInput(id) {
    const el = document.getElementById(id);
    if (!el) return false;
    el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function clearBusinessDataAtStartup() {
    if (selfTest) return;
    if (sessionStorage.getItem(RESET_KEY) === '1') return;
    // Importing an Excel report deliberately reloads the renderer. Never erase the
    // just-imported list on that reload.
    if (sessionStorage.getItem(IMPORT_RELOAD_KEY) === '1') return;
    if (sessionStorage.getItem(SESSION_KEY) !== '1') return;

    localStorage.removeItem(ENTRY_KEY);
    ['weightInput', 'purityInput', 'descriptionInput'].forEach(clearInput);
    $$('.calc-card input').forEach(input => {
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    sessionStorage.setItem(RESET_KEY, '1');
    setTimeout(() => {
      window.__goldbarRecalculate?.();
      updateDashboardSilver();
    }, 20);
  }

  function resetDynamicCalculationPageOnce() {
    if (selfTest) return;
    const title = $('.dash-title span:last-child')?.textContent?.trim() || '';

    if (title === 'محاسبات عیار' && sessionStorage.getItem(ASSAY_RESET_KEY) !== '1') {
      const ids = ['r7IncreaseTarget', 'r7BarAssay', 'r7AlloyTarget', 'r7SilverPercent'];
      if (!ids.every(id => document.getElementById(id))) {
        setTimeout(resetDynamicCalculationPageOnce, 40);
        return;
      }
      ids.forEach(clearInput);
      sessionStorage.setItem(ASSAY_RESET_KEY, '1');
    }

    if (title === 'محاسبه سریع' && sessionStorage.getItem(QUICK_RESET_KEY) !== '1') {
      const ids = ['splitBaseWin', 'corrWeightWin', 'corrTargetWin', 'corrDropWin', 'r7Pct995', 'r7Pct750'];
      if (!ids.every(id => document.getElementById(id))) {
        setTimeout(resetDynamicCalculationPageOnce, 40);
        return;
      }
      ids.forEach(clearInput);
      sessionStorage.setItem(QUICK_RESET_KEY, '1');
    }
  }

  function observeDynamicPages() {
    const host = $('#pageHost');
    const title = $('.dash-title span:last-child');
    if (pageObserver || (!host && !title)) return;
    pageObserver = new MutationObserver(() => setTimeout(resetDynamicCalculationPageOnce, 0));
    if (host) pageObserver.observe(host, { childList: true, subtree: true });
    if (title) pageObserver.observe(title, { childList: true, characterData: true, subtree: true });
  }

  function installPasswordChange() {
    const button = $('.top-actions .circle-btn.gold');
    if (!button || button.dataset.r11Password === '1') return false;
    button.dataset.r11Password = '1';
    button.title = 'تغییر رمز عبور';
    button.addEventListener('click', async event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      try {
        const result = await r11Request('user:change-password');
        if (result?.ok) toast('رمز عبور با موفقیت تغییر کرد');
      } catch (error) {
        toast(error?.message || 'خطا در تغییر رمز عبور');
      }
    }, true);
    return true;
  }

  function updateVersion() {
    const version = $('.version');
    if (version) version.textContent = 'GOLD BAR v2.0.0-r11';
  }

  function installRecalculateTail() {
    const original = window.__goldbarRecalculate;
    if (typeof original !== 'function' || original.__r11Wrapped) return;
    const wrapped = (...args) => {
      const result = original(...args);
      setTimeout(updateDashboardSilver, 0);
      return result;
    };
    wrapped.__r11Wrapped = true;
    window.__goldbarRecalculate = wrapped;
  }

  function workbookProbe() {
    const engine = window.__goldbarAssayEngineV2;
    if (!engine) return { ok: false, reason: 'engine-missing' };
    const summary = { weight: 353.11, averageAssay: 775.5433717538443 };
    const alloy = engine.alloyForTarget(summary, 747, 45, 353.11);
    const silverOk = Number.isFinite(alloy.silverRequired)
      && Math.abs(alloy.silverRequired - 6.071656626506012) < 1e-9;
    return {
      ok: silverOk && Boolean($('.top-actions .circle-btn.gold')?.dataset.r11Password === '1'),
      silverOk,
      silverRequired: alloy.silverRequired,
      passwordChangeBound: $('.top-actions .circle-btn.gold')?.dataset.r11Password === '1'
    };
  }

  function init(attempt = 0) {
    const ready = Boolean(window.__goldbarAssayEngineV2 && window.__goldbarRecalculate && $$('.calc-card')[1]);
    if (!ready) {
      if (attempt < 80) setTimeout(() => init(attempt + 1), 100);
      return;
    }

    installRecalculateTail();
    bindDashboardSilver();
    installPasswordChange();
    observeDynamicPages();
    clearBusinessDataAtStartup();
    resetDynamicCalculationPageOnce();
    updateDashboardSilver();
    updateVersion();
    window.__goldbarR11Probe = workbookProbe;
  }

  init();
})();
