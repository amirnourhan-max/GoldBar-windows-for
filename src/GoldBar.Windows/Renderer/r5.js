(() => {
  'use strict';

  const ENTRY_KEY = 'goldbar.windows.entries.v2';
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  let seq = 0;
  const pending = new Map();
  let probeWrapped = false;

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

  function r4Request(action, payload = null) {
    if (!window.chrome?.webview) return Promise.reject(new Error('ارتباط با برنامه ویندوز در دسترس نیست.'));
    const id = `r5-${++seq}`;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      window.chrome.webview.postMessage({ kind: 'r4request', id, action, payload });
      setTimeout(() => {
        const p = pending.get(id);
        if (!p) return;
        pending.delete(id);
        reject(new Error(`Timeout: ${action}`));
      }, 6000);
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

  function installStyles() {
    if ($('#goldbarR5Styles')) return;
    const style = document.createElement('style');
    style.id = 'goldbarR5Styles';
    style.textContent = `
      .r5-scale-name-wrap{width:144px;position:relative}
      .r5-scale-name-wrap input{width:100%;height:32px;box-sizing:border-box;border:1px solid #3a3e40;background:#0d1012;color:#f4f1e9;border-radius:8px;padding:0 9px;font:800 12px Tahoma,Arial,sans-serif;direction:rtl;text-align:right;outline:none}
      .r5-scale-name-wrap input:focus{border-color:rgba(242,196,91,.65);box-shadow:0 0 0 2px rgba(242,196,91,.08)}
      .r5-scale-test{margin-top:9px!important;border-color:rgba(242,196,91,.42)!important;color:#f2c45b!important;background:rgba(242,196,91,.07)!important}
      .r5-scale-test.testing{opacity:.65;pointer-events:none}
      .r5-scale-result{min-height:30px;margin-top:7px;padding:7px 8px;border-radius:8px;background:rgba(255,255,255,.025);color:#9fa6b2;font-size:10px;font-weight:800;line-height:1.45;text-align:right;direction:rtl;overflow-wrap:anywhere}
      .r5-scale-result.ok{color:#68d391;background:rgba(72,187,120,.07)}
      .r5-scale-result.error{color:#ff8d8d;background:rgba(255,90,90,.07)}
      .r5-silver-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}
      .r5-silver-stat{background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.045);border-radius:10px;padding:9px 7px;text-align:center}
      .r5-silver-stat span{display:block;color:#999faa;font-size:10px;font-weight:800;margin-bottom:4px}
      .r5-silver-stat b{display:block;color:#f2c45b;font-size:14px;font-weight:900;direction:ltr}
    `;
    document.head.appendChild(style);
  }

  async function currentSettingsFromUi() {
    let current = {};
    try { current = await window.goldbar.getSettings(); } catch { }
    const scaleName = ($('#scaleNameInput')?.value || current.scaleName || 'ترازو').trim() || 'ترازو';
    return {
      ...current,
      scaleName,
      port: $('#portSelect')?.value || current.port || 'COM4',
      baudRate: Number($('#baudSelect')?.value || current.baudRate || 2400),
      dataBits: Number($('#dataBitsSelect')?.value || current.dataBits || 7),
      parity: $('#paritySelect')?.value || current.parity || 'Even',
      stopBits: Number($('#stopBitsSelect')?.value || current.stopBits || 2),
      flowControl: $('#flowSelect')?.value || current.flowControl || 'None',
      autoRead: $('#autoReadToggle')?.classList.contains('on') ?? current.autoRead ?? true,
      readIntervalMs: Math.max(100, Number($('#readInterval')?.value || current.readIntervalMs || 800)),
      decimals: Math.max(0, Math.min(6, Number($('#decimals')?.value ?? current.decimals ?? 3))),
      requestCommand: 'P',
      keyboardRead: $('#keyboardReadToggle')?.classList.contains('on') ?? current.keyboardRead ?? true
    };
  }

  function setScaleName(name) {
    const clean = String(name || 'ترازو').trim() || 'ترازو';
    const input = $('#scaleNameInput');
    if (input && input.value !== clean) input.value = clean;
    const sidebarName = $('.scale-card .scale-name span');
    if (sidebarName) sidebarName.textContent = clean;
  }

  function installScaleName() {
    const form = $('.settings-form');
    if (!form || $('#scaleNameInput')) return;
    const first = form.querySelector('.setting-row');
    const row = document.createElement('div');
    row.className = 'setting-row r5-scale-name-row';
    row.dir = 'ltr';
    row.innerHTML = '<label dir="rtl">نام ترازو</label><div class="r5-scale-name-wrap"><input id="scaleNameInput" type="text" maxlength="60" autocomplete="off" value="ترازو" aria-label="نام ترازو"></div>';
    form.insertBefore(row, first || null);
    $('#scaleNameInput')?.addEventListener('input', e => setScaleName(e.currentTarget.value));
    window.goldbar.getSettings().then(s => setScaleName(s?.scaleName || 'ترازو')).catch(() => setScaleName('ترازو'));
  }

  function updateScaleResult(ok, message, weight) {
    const result = $('#r5ScaleResult');
    if (result) {
      result.classList.toggle('ok', Boolean(ok));
      result.classList.toggle('error', !ok);
      result.textContent = ok && Number.isFinite(Number(weight))
        ? `تست موفق: ${formatNumber(weight, 3)} g`
        : message;
    }
    const right = $('#testResult');
    if (right) {
      right.classList.toggle('error', !ok);
      right.innerHTML = ok && Number.isFinite(Number(weight))
        ? `نتیجه: <b>${formatNumber(weight, 3)} g</b> ✓`
        : `خطا: <b>${String(message || 'پاسخی دریافت نشد')}</b>`;
    }
    if (ok && Number.isFinite(Number(weight))) {
      const w = formatNumber(weight, 3);
      $('.scale-card [data-weight-value]')?.replaceChildren(document.createTextNode(w));
      const status = $('#scaleStatus');
      status?.classList.remove('offline');
      const text = status?.querySelector('span:last-child');
      if (text) text.textContent = 'متصل';
    }
  }

  async function testScale(button) {
    if (button?.classList.contains('testing')) return;
    button?.classList.add('testing');
    const result = $('#r5ScaleResult');
    if (result) {
      result.className = 'r5-scale-result';
      result.textContent = 'در حال تست اتصال و خواندن وزن...';
    }
    try {
      const settings = await currentSettingsFromUi();
      const response = await r4Request('scale:test', settings);
      const ok = Boolean(response?.ok);
      const message = response?.message || (ok ? 'تست موفق بود.' : 'ترازو پاسخ نداد.');
      updateScaleResult(ok, message, response?.weight);
      if (!ok && !window.__goldbarR4SelfTest) window.alert(`خطای تست ترازو\n\n${message}`);
    } catch (error) {
      const message = error?.message || 'خطای نامشخص در تست ترازو';
      updateScaleResult(false, message, null);
      if (!window.__goldbarR4SelfTest) window.alert(`خطای تست ترازو\n\n${message}`);
    } finally {
      button?.classList.remove('testing');
    }
  }

  function installSidebarScaleTest() {
    const card = $('.scale-card');
    const disconnect = $('#scaleDisconnect');
    if (!card || !disconnect || $('#r5ScaleTest')) return;
    const button = document.createElement('button');
    button.className = 'ghost-btn r5-scale-test';
    button.id = 'r5ScaleTest';
    button.textContent = 'تست ترازو';
    const result = document.createElement('div');
    result.id = 'r5ScaleResult';
    result.className = 'r5-scale-result';
    result.textContent = 'برای بررسی اتصال، تست ترازو را بزنید.';
    card.insertBefore(button, disconnect);
    card.insertBefore(result, disconnect);
    button.addEventListener('click', () => testScale(button));
  }

  function overrideRightScaleTest() {
    const button = $('#testScale');
    if (!button || button.dataset.r5Test === '1') return;
    button.dataset.r5Test = '1';
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      testScale(button);
    }, true);
  }

  function installSettingsSaveOverride() {
    const button = $('#saveSettings');
    if (!button || button.dataset.r5Save === '1') return;
    button.dataset.r5Save = '1';
    button.addEventListener('click', async event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      try {
        const next = await currentSettingsFromUi();
        const saved = await window.goldbar.saveSettings(next);
        setScaleName(saved?.scaleName || next.scaleName);
        const old = button.textContent;
        button.textContent = 'ذخیره شد ✓';
        setTimeout(() => { button.textContent = old; }, 900);
      } catch (error) {
        window.alert(`خطا در ذخیره تنظیمات\n\n${error?.message || 'خطای نامشخص'}`);
      }
    }, true);

    $('#resetSettings')?.addEventListener('click', () => {
      setTimeout(() => window.goldbar.getSettings().then(s => setScaleName(s?.scaleName || 'ترازو')).catch(() => {}), 250);
    });
  }

  function readEntries() {
    try {
      const list = JSON.parse(localStorage.getItem(ENTRY_KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch { return []; }
  }

  function installSilverBreakdown() {
    const card = $$('.calc-card')[1];
    if (!card) return false;
    let grid = $('#r5SilverBreakdown');
    if (!grid) {
      grid = document.createElement('div');
      grid.id = 'r5SilverBreakdown';
      grid.className = 'r5-silver-grid';
      grid.innerHTML = `
        <div class="r5-silver-stat"><span>نقره مورد نیاز (g)</span><b id="r5SilverRequired">0</b></div>
        <div class="r5-silver-stat"><span>بار بدون نقره (g)</span><b id="r5NonSilver">0</b></div>
        <div class="r5-silver-stat"><span>۰.۴٪ وزن (g)</span><b id="r5FourPermille">0</b></div>
        <div class="r5-silver-stat"><span>بار نهایی دیگر (g)</span><b id="r5FinalOther">0</b></div>`;
      card.appendChild(grid);
    }

    const inputs = [...card.querySelectorAll('input')];
    inputs.forEach(input => {
      if (input.dataset.r5SilverBound === '1') return;
      input.dataset.r5SilverBound = '1';
      input.addEventListener('input', () => updateSilverBreakdown());
      input.addEventListener('change', () => updateSilverBreakdown());
    });
    updateSilverBreakdown();
    return true;
  }

  function updateSilverBreakdown() {
    const engine = window.__goldbarFormulaEngine;
    const card = $$('.calc-card')[1];
    if (!engine || !card) return;
    const inputs = [...card.querySelectorAll('input')];
    const target = numberValue(inputs[0]?.value);
    const silverPercent = numberValue(inputs[1]?.value);
    const summary = engine.summarize(readEntries());
    const result = engine.requiredAlloy(summary, target, silverPercent, summary.weight);
    const set = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = Number.isFinite(value) ? formatNumber(value, 3) : '0';
    };
    set('r5SilverRequired', result.silverRequired);
    set('r5NonSilver', result.nonSilverRequired);
    set('r5FourPermille', result.fourPerThousand);
    set('r5FinalOther', result.finalOtherAlloy);
  }

  function changeTopAssayLabel() {
    const labels = $$('.summary-card .metric-label');
    if (labels[1]) labels[1].textContent = 'عیار آبشده‌ها (‰)';
  }

  function updateVersion() {
    const version = $('.version');
    if (version) version.textContent = 'GOLD BAR v2.0.0-r5';
  }

  function wrapProbe() {
    if (probeWrapped || typeof window.__goldbarR3Probe !== 'function') return;
    const previous = window.__goldbarR3Probe;
    window.__goldbarR3Probe = () => {
      const base = previous();
      const card = $$('.calc-card')[1];
      const silverInput = card?.querySelectorAll('input')?.[1];
      let silverVisibleRefresh = false;
      if (silverInput) {
        const old = silverInput.value;
        silverInput.value = '45';
        updateSilverBreakdown();
        const a = $('#r5SilverRequired')?.textContent || '';
        silverInput.value = '30';
        updateSilverBreakdown();
        const b = $('#r5SilverRequired')?.textContent || '';
        silverVisibleRefresh = a !== b;
        silverInput.value = old;
        updateSilverBreakdown();
      }
      const r5 = {
        scaleNameField: Boolean($('#scaleNameInput')),
        sidebarScaleTest: Boolean($('#r5ScaleTest') && $('#r5ScaleResult')),
        rightScaleTestHook: $('#testScale')?.dataset.r5Test === '1',
        silverBreakdown: Boolean($('#r5SilverBreakdown')),
        silverVisibleRefresh,
        topAssayLabel: $$('.summary-card .metric-label')[1]?.textContent?.includes('عیار آبشده‌ها') === true
      };
      r5.ok = Object.values(r5).every(Boolean);
      return { ...base, r5, ok: Boolean(base?.ok && r5.ok) };
    };
    probeWrapped = true;
  }

  function init(attempt = 0) {
    installStyles();
    const ready = Boolean(window.goldbar && window.__goldbarFormulaEngine && $('.settings-form') && $('.scale-card'));
    if (!ready) {
      if (attempt < 50) setTimeout(() => init(attempt + 1), 100);
      return;
    }
    installScaleName();
    installSidebarScaleTest();
    overrideRightScaleTest();
    installSettingsSaveOverride();
    installSilverBreakdown();
    changeTopAssayLabel();
    updateVersion();
    wrapProbe();
    if (!probeWrapped && attempt < 50) setTimeout(() => wrapProbe(), 120);
  }

  init();
})();
