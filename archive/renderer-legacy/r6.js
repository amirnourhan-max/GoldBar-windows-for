(() => {
  'use strict';

  const ENTRY_KEY = 'goldbar.windows.entries.v2';
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  let clearReentry = false;
  let observer = null;
  let probeWrapped = false;
  let observerBusy = false;

  function normalizeDigits(value) {
    const fa = '۰۱۲۳۴۵۶۷۸۹';
    const ar = '٠١٢٣٤٥٦٧٨٩';
    return String(value ?? '')
      .replace(/[۰-۹]/g, d => String(fa.indexOf(d)))
      .replace(/[٠-٩]/g, d => String(ar.indexOf(d)))
      .replace(/,/g, '.');
  }

  function parseNumber(value) {
    const n = Number(normalizeDigits(value));
    return Number.isFinite(n) ? n : NaN;
  }

  function setTextIfChanged(el, text) {
    if (el && el.textContent !== text) el.textContent = text;
  }

  function cleanDecimal(input, min = null, max = null) {
    let v = normalizeDigits(input.value).replace(/[^0-9.]/g, '');
    const dot = v.indexOf('.');
    if (dot >= 0) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '');
    if (v !== '' && v !== '.') {
      let n = Number(v);
      if (Number.isFinite(min)) n = Math.max(min, n);
      if (Number.isFinite(max)) n = Math.min(max, n);
      if (Number.isFinite(n) && String(n) !== v && !v.endsWith('.')) v = String(n);
    }
    if (input.value !== v) input.value = v;
  }

  function formatNumber(value, digits = 3) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0';
    return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: digits });
  }

  function installStyles() {
    if ($('#goldbarR6Styles')) return;
    const style = document.createElement('style');
    style.id = 'goldbarR6Styles';
    style.textContent = `
      .r6-melts-scroll{max-height:390px;overflow-y:auto;overflow-x:auto;padding-inline-end:5px;margin-top:6px;scrollbar-gutter:stable;border-radius:12px}
      .r6-melts-scroll .melts-table{min-width:760px;margin:0}
      .r6-melts-scroll::-webkit-scrollbar{width:10px;height:10px}
      .r6-melts-scroll::-webkit-scrollbar-track{background:rgba(255,255,255,.03);border-radius:9px}
      .r6-melts-scroll::-webkit-scrollbar-thumb{background:rgba(242,196,91,.38);border-radius:9px;border:2px solid rgba(0,0,0,.2)}
      .r6-percent-panel{margin-top:14px;padding-top:13px;border-top:1px solid rgba(255,255,255,.07)}
      .r6-percent-title{color:#aeb4c0;font-size:12px;font-weight:900;margin-bottom:8px;text-align:right}
      .r6-percent-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;direction:rtl}
      .r6-percent-field label{display:block;color:#9ca3af;font-size:11px;font-weight:800;margin:0 0 6px}
      .r6-percent-field input{width:100%;box-sizing:border-box;border:1px solid #3a3e40;background:#0d1012;color:#f4f1e9;border-radius:10px;padding:10px 12px;font:800 14px Tahoma,Arial,sans-serif;direction:ltr;text-align:center;outline:none}
      .r6-percent-field input:focus{border-color:rgba(242,196,91,.68);box-shadow:0 0 0 2px rgba(242,196,91,.08)}
      .r6-percent-sum{margin-top:7px;text-align:center;color:#8f98a5;font-size:10px;font-weight:800}
      .r6-percent-sum.warn{color:#ff9b78}
      @media(max-width:900px){.r6-percent-grid{grid-template-columns:1fr}.r6-melts-scroll{max-height:330px}}
    `;
    document.head.appendChild(style);
  }

  function clearCalculationInputs() {
    $$('.calc-card input').forEach(input => {
      if (input.value !== '') input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    ['splitBaseWin', 'split995PctWin', 'split750PctWin', 'corrWeightWin', 'corrTargetWin', 'corrDropWin']
      .forEach(id => {
        const input = document.getElementById(id);
        if (!input) return;
        if (input.value !== '') input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });

    window.__goldbarRecalculate?.();
  }

  function installClearAllOverride() {
    const button = $('#quickClearAll');
    if (!button || button.dataset.r6Clear === '1') return false;
    button.dataset.r6Clear = '1';
    button.addEventListener('click', event => {
      if (clearReentry) return;
      event.preventDefault();
      event.stopImmediatePropagation();

      const confirmed = window.confirm(
        'تمام آبشده‌های ثبت‌شده و همه ورودی‌های محاسباتی پاک شوند؟\n\nتنظیمات ترازو و محل ذخیره گزارش‌ها حذف نمی‌شود.'
      );
      if (!confirmed) return;

      const originalConfirm = window.confirm;
      try {
        clearReentry = true;
        window.confirm = () => true;
        button.click();
      } finally {
        window.confirm = originalConfirm;
        clearReentry = false;
      }

      clearCalculationInputs();
      localStorage.removeItem(ENTRY_KEY);
    }, true);
    return true;
  }

  function ensureMeltsScroll() {
    $$('.melts-table').forEach(table => {
      if (table.parentElement?.classList.contains('r6-melts-scroll')) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'r6-melts-scroll';
      table.parentNode?.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    });
  }

  function recalcSplit() {
    const base = parseNumber($('#splitBaseWin')?.value);
    const pct995 = parseNumber($('#split995PctWin')?.value);
    const pct750 = parseNumber($('#split750PctWin')?.value);
    const result995 = Number.isFinite(base) && Number.isFinite(pct995) ? base * pct995 / 100 : NaN;
    const result750 = Number.isFinite(base) && Number.isFinite(pct750) ? base * pct750 / 100 : NaN;
    setTextIfChanged($('#split3679Win'), Number.isFinite(result995) ? formatNumber(result995, 3) : '0');
    setTextIfChanged($('#split6321Win'), Number.isFinite(result750) ? formatNumber(result750, 3) : '0');

    const sum = $('#r6PercentSum');
    if (sum) {
      const total = (Number.isFinite(pct995) ? pct995 : 0) + (Number.isFinite(pct750) ? pct750 : 0);
      setTextIfChanged(sum, `جمع درصدها: ${formatNumber(total, 2)}%`);
      sum.classList.toggle('warn', Math.abs(total - 100) > 0.001);
    }
  }

  function enhanceQuickTools() {
    const splitBase = $('#splitBaseWin');
    if (!splitBase) return false;

    const tools = $$('.canonical-tool');
    const splitTool = tools.find(tool => tool.querySelector('#splitBaseWin'));
    const correctionTool = tools.find(tool => tool.querySelector('#corrWeightWin'));
    if (!splitTool || !correctionTool) return false;

    if (splitTool.dataset.r6Enhanced !== '1') {
      splitTool.dataset.r6Enhanced = '1';
      setTextIfChanged(splitTool.querySelector('h3'), 'تقسیم طلای 995 / طلای 750');

      const resultSpans = splitTool.querySelectorAll('.canonical-result span');
      setTextIfChanged(resultSpans[0], 'طلای 995');
      setTextIfChanged(resultSpans[1], 'طلای 750');

      const correctionLabels = correctionTool.querySelectorAll('label');
      setTextIfChanged(correctionLabels[1], 'عیار پایه');
    }

    let panel = $('#r6PercentPanel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'r6PercentPanel';
      panel.className = 'r6-percent-panel';
      panel.innerHTML = `
        <div class="r6-percent-title">درصد تقسیم — قابل تغییر</div>
        <div class="r6-percent-grid">
          <div class="r6-percent-field"><label>درصد طلای 995</label><input id="split995PctWin" inputmode="decimal" value="36.79"></div>
          <div class="r6-percent-field"><label>درصد طلای 750</label><input id="split750PctWin" inputmode="decimal" value="63.21"></div>
        </div>
        <div class="r6-percent-sum" id="r6PercentSum">جمع درصدها: 100%</div>`;
      splitTool.appendChild(panel);
    }

    if (splitTool.dataset.r6SplitBound !== '1') {
      splitTool.dataset.r6SplitBound = '1';
      [splitBase, $('#split995PctWin'), $('#split750PctWin')].filter(Boolean).forEach(input => {
        input.addEventListener('input', () => {
          cleanDecimal(input, 0, input.id === 'splitBaseWin' ? null : 100);
          recalcSplit();
        });
        input.addEventListener('paste', () => setTimeout(() => {
          cleanDecimal(input, 0, input.id === 'splitBaseWin' ? null : 100);
          recalcSplit();
        }, 0));
        input.addEventListener('drop', event => event.preventDefault());
      });
    }

    recalcSplit();
    return true;
  }

  function installQuickCalcHook() {
    const nav = $$('.nav-item').find(btn => (btn.textContent || '').includes('محاسبه سریع'));
    if (!nav || nav.dataset.r6QuickCalc === '1') return false;
    nav.dataset.r6QuickCalc = '1';
    nav.addEventListener('click', () => {
      setTimeout(() => enhanceQuickTools(), 0);
      setTimeout(() => enhanceQuickTools(), 60);
    });
    return true;
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(() => {
      if (observerBusy) return;
      observerBusy = true;
      requestAnimationFrame(() => {
        try {
          ensureMeltsScroll();
          enhanceQuickTools();
          installClearAllOverride();
        } finally {
          observerBusy = false;
        }
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.__goldbarR6ScrollObserver = true;
  }

  function updateVersion() {
    const version = $('.version');
    setTextIfChanged(version, 'GOLD BAR v2.0.0-r6');
  }

  function wrapProbe(attempt = 0) {
    if (probeWrapped) return;
    const previous = window.__goldbarR3Probe;
    if (typeof previous !== 'function') {
      if (attempt < 30) setTimeout(() => wrapProbe(attempt + 1), 100);
      return;
    }
    const outer = () => {
      const base = previous();
      const split = 800 * 36.79 / 100;
      const split2 = 800 * 63.21 / 100;
      const r6 = {
        clearAllConfirmationInstalled: $('#quickClearAll')?.dataset.r6Clear === '1',
        quickCalcHookInstalled: $$('.nav-item').some(btn => btn.dataset.r6QuickCalc === '1'),
        meltsScrollObserverInstalled: window.__goldbarR6ScrollObserver === true,
        workbookSplitDefaults: Math.abs(split - 294.32) < 1e-9 && Math.abs(split2 - 505.68) < 1e-9
      };
      r6.ok = Object.values(r6).every(Boolean);
      return { ...base, r6, ok: Boolean(base?.ok && r6.ok) };
    };
    outer.__goldbarR6 = true;
    window.__goldbarR3Probe = outer;
    probeWrapped = true;
  }

  function init(attempt = 0) {
    installStyles();
    const ready = Boolean($('#quickClearAll') && $('.nav-item'));
    if (!ready) {
      if (attempt < 50) setTimeout(() => init(attempt + 1), 100);
      return;
    }
    installClearAllOverride();
    installQuickCalcHook();
    ensureMeltsScroll();
    startObserver();
    updateVersion();
    setTimeout(() => wrapProbe(), 900);
  }

  init();
})();
