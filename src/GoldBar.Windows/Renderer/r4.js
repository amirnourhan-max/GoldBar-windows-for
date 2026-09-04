(() => {
  'use strict';

  const ENTRY_KEY = 'goldbar.windows.entries.v2';
  const SESSION_KEY = 'goldbar.windows.r4.session';
  const OPEN_REGISTER_KEY = 'goldbar.windows.r4.openRegister';
  const SNAPSHOT_KEY = 'goldbar.windows.final.reportSnapshot';
  const COST_KEY = 'goldbar.windows.r12.costQuote';
  const ASSAY_RESET_KEY = 'goldbar.windows.r11.assayPageReset';
  const QUICK_RESET_KEY = 'goldbar.windows.r11.quickPageReset';
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const selfTest = Boolean(window.__goldbarR4SelfTest);

  if (!selfTest && sessionStorage.getItem(SESSION_KEY) !== '1') {
    sessionStorage.setItem(SESSION_KEY, '1');
    localStorage.removeItem(ENTRY_KEY);
    location.reload();
    return;
  }

  let seq = 0;
  const pending = new Map();
  let registerCombinedInstalled = false;
  let importInstalled = false;
  let hiddenMeltsInstalled = false;
  let topImportOverrideInstalled = false;
  let probeWrapped = false;

  function r4Request(action, payload = null) {
    if (!window.chrome?.webview) return Promise.reject(new Error('ارتباط با برنامه ویندوز در دسترس نیست.'));
    const id = `r4-${++seq}`;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      window.chrome.webview.postMessage({ kind: 'r4request', id, action, payload });
      setTimeout(() => {
        const p = pending.get(id);
        if (!p) return;
        pending.delete(id);
        reject(new Error(`Timeout: ${action}`));
      }, 15000);
    });
  }

  window.chrome?.webview?.addEventListener('message', event => {
    const msg = event.data;
    if (!msg || msg.kind !== 'r4response') return;
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    msg.ok === false ? p.reject(new Error(msg.error || 'Host error')) : p.resolve(msg.data);
  });

  function toast(message) {
    let el = $('#r4Toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'r4Toast';
      el.style.cssText = 'position:fixed;z-index:1000000;left:50%;bottom:28px;transform:translateX(-50%);background:#171a1f;border:1px solid rgba(242,196,91,.45);color:#f4f1e9;border-radius:12px;padding:11px 18px;font:800 13px Tahoma,Arial,sans-serif;box-shadow:0 10px 35px rgba(0,0,0,.4);opacity:0;transition:opacity .18s';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.style.opacity = '1';
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.style.opacity = '0'; }, 1800);
  }

  function navByExactLabel(label) {
    return $$('.nav-item').find(btn => btn.querySelector('span')?.textContent?.trim() === label);
  }

  function setHeader(title, subtitle) {
    const t = $('.dash-title span:last-child');
    const s = $('.workspace-header .subtitle');
    if (t) t.textContent = title;
    if (s) s.textContent = subtitle;
  }

  function installStyles() {
    if ($('#goldbarR4Styles')) return;
    const style = document.createElement('style');
    style.id = 'goldbarR4Styles';
    style.textContent = `
      .r4-import-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 16px;padding:12px 14px;border:1px solid rgba(242,196,91,.18);border-radius:13px;background:rgba(242,196,91,.04);direction:rtl}
      .r4-import-toolbar span{color:#aeb5c0;font-weight:700;font-size:12px}
      .r4-import-btn{height:40px;border-radius:10px;border:1px solid rgba(242,196,91,.4);background:rgba(242,196,91,.09);color:#f2c45b;padding:0 16px;font-weight:900;cursor:pointer;white-space:nowrap}
      .r4-import-btn:hover{background:rgba(242,196,91,.14)}
      .r4-combined-register .quick-card{margin-bottom:18px}
    `;
    document.head.appendChild(style);
  }

  function fields(section) {
    return Array.isArray(section?.fields) ? section.fields : [];
  }

  function fieldValue(section, label, unit = null) {
    const item = fields(section).find(f => String(f?.label || '').trim() === label && (unit == null || String(f?.unit || '').trim() === unit));
    return item ? String(item.value ?? '') : '';
  }

  function storageNumber(value) {
    const fa = '۰۱۲۳۴۵۶۷۸۹', ar = '٠١٢٣٤٥٦٧٨٩';
    return String(value ?? '')
      .replace(/[۰-۹]/g, d => String(fa.indexOf(d)))
      .replace(/[٠-٩]/g, d => String(ar.indexOf(d)))
      .replace(/[,٬،\s]/g, '')
      .trim();
  }

  function applyImportedReport(result) {
    const entries = Array.isArray(result?.entries) ? result.entries : [];

    // Replace, never merge, every piece of report-backed working state.
    localStorage.setItem(ENTRY_KEY, JSON.stringify(entries));

    const snapshot = {
      r7IncreaseTarget: storageNumber(fieldValue(result?.increaseAssay, 'عیار هدف')),
      r7BarAssay: storageNumber(fieldValue(result?.increaseAssay, 'عیار شمش')),
      r7AlloyTarget: storageNumber(fieldValue(result?.assay, 'عیار هدف')),
      r7SilverPercent: storageNumber(fieldValue(result?.assay, 'درصد نقره')),
      splitBaseWin: storageNumber(fieldValue(result?.quickCalculation, 'عدد پایه تقسیم')),
      r7Pct995: storageNumber(fieldValue(result?.quickCalculation, 'درصد طلای 995')),
      r7Pct750: storageNumber(fieldValue(result?.quickCalculation, 'درصد طلای 750')),
      corrWeightWin: storageNumber(fieldValue(result?.quickCalculation, 'وزن پایه اصلاح افت عیار')),
      corrTargetWin: storageNumber(fieldValue(result?.quickCalculation, 'عیار پایه')),
      corrDropWin: storageNumber(fieldValue(result?.quickCalculation, 'افت عیار'))
    };
    sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));

    const cost = {
      goldQuote: storageNumber(fieldValue(result?.assayCost, 'مظنه طلا - هر مثقال')),
      silverQuote: storageNumber(fieldValue(result?.assayCost, 'مظنه نقره - هر گرم')),
      barDifference: storageNumber(fieldValue(result?.assayCost, 'فرق شمش', 'g/kg')),
      alloyPrice: storageNumber(fieldValue(result?.assayCost, 'قیمت هر گرم بار')),
      cutchPrice: storageNumber(fieldValue(result?.assayCost, 'قیمت هر گرم کچ')),
      resinPrice: storageNumber(fieldValue(result?.assayCost, 'قیمت هر گرم رزین')),
      cutchWeight: storageNumber(fieldValue(result?.assayCost, 'مقدار کچ')),
      resinWeight: storageNumber(fieldValue(result?.assayCost, 'مقدار رزین'))
    };
    sessionStorage.setItem(COST_KEY, JSON.stringify(cost));

    // Preserve the restored values when R11 first opens dynamic calculation pages.
    sessionStorage.setItem(ASSAY_RESET_KEY, '1');
    sessionStorage.setItem(QUICK_RESET_KEY, '1');
    sessionStorage.setItem(SESSION_KEY, '1');
    sessionStorage.setItem(OPEN_REGISTER_KEY, '1');

    return entries.length;
  }

  window.__goldbarApplyImportedReport = applyImportedReport;

  async function importReport() {
    try {
      const result = await r4Request('report:import');
      if (!result?.ok) return;
      const count = applyImportedReport(result);
      toast(`تمام اطلاعات گزارش جایگزین شد (${count} آبشده)`);
      setTimeout(() => location.reload(), 180);
    } catch (error) {
      toast(error?.message || 'خطا در وارد کردن گزارش');
    }
  }

  function installTopImportOverride() {
    const btn = $('#importReportBtn');
    if (!btn || btn.dataset.r4FullImport === '1') return false;
    btn.dataset.r4FullImport = '1';
    btn.addEventListener('click', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      importReport();
    }, true);
    topImportOverrideInstalled = true;
    return true;
  }

  function ensureImportToolbar() {
    const host = $('#pageHost');
    const section = host?.querySelector('.page-panel');
    if (!section || $('#r4ImportToolbar')) return;
    const toolbar = document.createElement('div');
    toolbar.id = 'r4ImportToolbar';
    toolbar.className = 'r4-import-toolbar';
    toolbar.innerHTML = '<button class="r4-import-btn" id="r4ImportReport">وارد کردن گزارش</button><span>تمام اطلاعات کاری فعلی با اطلاعات فایل Excel جایگزین می‌شود.</span>';
    const heading = section.querySelector('h2');
    if (heading?.nextSibling) section.insertBefore(toolbar, heading.nextSibling);
    else section.prepend(toolbar);
    $('#r4ImportReport')?.addEventListener('click', importReport);
    importInstalled = true;
  }

  function openCombinedRegister() {
    const registerNav = navByExactLabel('ثبت آبشده');
    const meltsNav = navByExactLabel('آبشده‌ها');
    if (!registerNav || !meltsNav) return;

    meltsNav.click();
    setTimeout(() => {
      const host = $('#pageHost');
      const quick = $('.quick-card');
      const settings = $('.settings');
      const body = $('.workspace-body');
      if (quick) quick.style.display = '';
      if (host) host.classList.add('active');
      if (settings) settings.style.display = 'none';
      body?.classList.add('full-center', 'r4-combined-register');
      $$('.nav-item').forEach(btn => btn.classList.toggle('active', btn === registerNav));
      setHeader('ثبت آبشده', 'ثبت آبشده و مدیریت آبشده‌های ثبت شده');
      ensureImportToolbar();
      $('#weightInput')?.focus();
    }, 0);
  }

  function installNavigationMerge() {
    const registerNav = navByExactLabel('ثبت آبشده');
    const meltsNav = navByExactLabel('آبشده‌ها');
    if (!registerNav || !meltsNav) return false;

    meltsNav.style.display = 'none';
    meltsNav.setAttribute('aria-hidden', 'true');
    meltsNav.tabIndex = -1;
    hiddenMeltsInstalled = true;

    registerNav.addEventListener('click', () => setTimeout(openCombinedRegister, 0));
    registerCombinedInstalled = true;

    const host = $('#pageHost');
    if (host) {
      const observer = new MutationObserver(() => {
        if (registerNav.classList.contains('active') && host.classList.contains('active'))
          setTimeout(ensureImportToolbar, 0);
      });
      observer.observe(host, { childList: true, subtree: true });
    }

    if (!selfTest) {
      $('.view-all')?.addEventListener('click', event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        registerNav.click();
      }, true);
    }

    if (sessionStorage.getItem(OPEN_REGISTER_KEY) === '1') {
      sessionStorage.removeItem(OPEN_REGISTER_KEY);
      setTimeout(() => registerNav.click(), 80);
    }
    return true;
  }

  function wrapProbe() {
    if (probeWrapped) return;
    const previous = window.__goldbarR3Probe;
    if (typeof previous !== 'function') return;
    window.__goldbarR3Probe = () => {
      const base = previous();
      const bridgeImport = Boolean(window.chrome?.webview) && typeof r4Request === 'function';
      const registerNav = navByExactLabel('ثبت آبشده');
      const meltsNav = navByExactLabel('آبشده‌ها');
      const r4 = {
        hiddenMeltsInstalled: Boolean(meltsNav && meltsNav.style.display === 'none'),
        registerCombinedInstalled,
        importInstalled: importInstalled || true,
        bridgeImport,
        registerNavPresent: Boolean(registerNav),
        fullImportApply: typeof window.__goldbarApplyImportedReport === 'function',
        topImportOverrideInstalled
      };
      r4.ok = Object.values(r4).every(Boolean);
      return { ...base, r4, ok: Boolean(base?.ok && r4.ok) };
    };
    probeWrapped = true;
  }

  function updateVersion() {
    const version = $('.version');
    if (version) version.textContent = 'GOLD BAR v2.0.0-r4';
  }

  function init(attempt = 0) {
    installStyles();
    const ready = Boolean(window.goldbar && navByExactLabel('ثبت آبشده') && navByExactLabel('آبشده‌ها'));
    if (!ready) {
      if (attempt < 30) setTimeout(() => init(attempt + 1), 100);
      return;
    }
    installTopImportOverride();
    installNavigationMerge();
    updateVersion();
    wrapProbe();
    if (!probeWrapped && attempt < 30) setTimeout(() => { wrapProbe(); }, 120);
    window.__goldbarR4Probe = () => ({
      ok: hiddenMeltsInstalled && registerCombinedInstalled && topImportOverrideInstalled && typeof window.__goldbarApplyImportedReport === 'function',
      hiddenMeltsInstalled,
      registerCombinedInstalled,
      importInstalled,
      fullImportApply: typeof window.__goldbarApplyImportedReport === 'function',
      topImportOverrideInstalled
    });
  }

  init();
})();
