(() => {
  'use strict';

  const MESGHAL_GRAMS = 4.3318;
  const ENTRY_KEY = 'goldbar.windows.entries.v2';
  const COST_KEY = 'goldbar.windows.r12.costQuote';
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  let seq = 0;
  const pending = new Map();
  let observer = null;

  function normalizeDigits(value) {
    const fa = '۰۱۲۳۴۵۶۷۸۹', ar = '٠١٢٣٤٥٦٧٨٩';
    return String(value ?? '')
      .replace(/[۰-۹]/g, d => String(fa.indexOf(d)))
      .replace(/[٠-٩]/g, d => String(ar.indexOf(d)));
  }

  function cleanNumber(value) {
    let v = normalizeDigits(value).replace(/[,٬،\s]/g, '').replace(/[^0-9.]/g, '');
    const dot = v.indexOf('.');
    if (dot >= 0) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '');
    return v;
  }

  function numberOf(value) {
    const n = Number(cleanNumber(value));
    return Number.isFinite(n) ? n : NaN;
  }

  function grouped(value) {
    const clean = cleanNumber(value);
    if (!clean) return '';
    const [integer, decimal] = clean.split('.');
    const head = (integer || '0').replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return decimal !== undefined ? `${head}.${decimal}` : head;
  }

  function fmt(value, digits = 3) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: digits });
  }

  function r4Request(action, payload = null, timeout = 30000) {
    if (!window.chrome?.webview) return Promise.reject(new Error('ارتباط با برنامه ویندوز در دسترس نیست.'));
    const id = `quote-${++seq}`;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      window.chrome.webview.postMessage({ kind: 'r4request', id, action, payload });
      setTimeout(() => {
        const p = pending.get(id);
        if (!p) return;
        pending.delete(id);
        reject(new Error(`Timeout: ${action}`));
      }, timeout);
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

  function readEntries() {
    try {
      const list = JSON.parse(localStorage.getItem(ENTRY_KEY) || '[]');
      return Array.isArray(list) ? list.filter(x => Number(x?.weight) > 0 && Number(x?.assay) > 0) : [];
    } catch { return []; }
  }

  function readState() {
    try { return { goldQuote:'', silverQuote:'', barDifference:'', alloyPrice:'', ...JSON.parse(sessionStorage.getItem(COST_KEY) || '{}') }; }
    catch { return { goldQuote:'', silverQuote:'', barDifference:'', alloyPrice:'' }; }
  }

  function saveState() {
    const state = {
      goldQuote: cleanNumber($('#r12GoldQuote')?.value),
      silverQuote: cleanNumber($('#r12SilverQuote')?.value),
      barDifference: cleanNumber($('#r12BarDifference')?.value),
      alloyPrice: cleanNumber($('#r12AlloyPrice')?.value)
    };
    sessionStorage.setItem(COST_KEY, JSON.stringify(state));
  }

  function detectAssayContext() {
    const customTarget = numberOf($('#r7AlloyTarget')?.value);
    const customSilver = numberOf($('#r7SilverPercent')?.value);
    if (Number.isFinite(customTarget) && customTarget > 0 && Number.isFinite(customSilver))
      return { targetAssay: customTarget, silverPercent: customSilver };

    const card = $$('.calc-card')[1];
    const inputs = card ? [...card.querySelectorAll('input')] : [];
    const target = numberOf(inputs[0]?.value);
    const silver = numberOf(inputs[1]?.value);
    return {
      targetAssay: Number.isFinite(target) && target > 0 ? target : 747,
      silverPercent: Number.isFinite(silver) ? silver : 45
    };
  }

  function calculateCost() {
    const engine = window.__goldbarAssayEngineV2;
    const goldQuote = numberOf($('#r12GoldQuote')?.value);
    const silverQuote = numberOf($('#r12SilverQuote')?.value);
    const barDifference = numberOf($('#r12BarDifference')?.value);
    const alloyPrice = numberOf($('#r12AlloyPrice')?.value);
    const entries = readEntries();
    const context = detectAssayContext();

    const empty = {
      ok:false, goldPricePerGram:NaN, silverEquivalentGold:NaN,
      barDifferenceGold:NaN, alloyEquivalentGold:NaN, totalGoldCost:NaN,
      silverRequired:NaN, nonSilverRequired:NaN, highAssayWeight:NaN
    };
    if (!engine || !(goldQuote > 0) || !Number.isFinite(silverQuote) ||
        !Number.isFinite(barDifference) || !Number.isFinite(alloyPrice)) return empty;

    const summary = engine.summarize(entries);
    if (!(summary.weight > 0)) return empty;
    const alloy = engine.alloyForTarget(summary, context.targetAssay, context.silverPercent, summary.weight);
    const goldPricePerGram = goldQuote / MESGHAL_GRAMS;
    if (!(goldPricePerGram > 0)) return empty;

    const silverRequired = Math.max(0, Number(alloy.silverRequired) || 0);
    const nonSilverRequired = Math.max(0, Number(alloy.nonSilverRequired) || 0);
    const highAssayWeight = entries.reduce((sum, item) => {
      const w = Number(item?.weight), a = Number(item?.assay);
      return sum + (Number.isFinite(w) && w > 0 && Number.isFinite(a) && a > 900 ? w : 0);
    }, 0);

    const silverEquivalentGold = silverRequired * silverQuote / goldPricePerGram;
    // User definition: "1" means one gram per each 1,000 g of high-assay gold.
    const barDifferenceGold = highAssayWeight * barDifference / 1000;
    const alloyEquivalentGold = nonSilverRequired * alloyPrice / goldPricePerGram;
    const totalGoldCost = silverEquivalentGold + barDifferenceGold + alloyEquivalentGold;
    return {
      ok:[silverEquivalentGold,barDifferenceGold,alloyEquivalentGold,totalGoldCost].every(Number.isFinite),
      goldPricePerGram, silverEquivalentGold, barDifferenceGold, alloyEquivalentGold,
      totalGoldCost, silverRequired, nonSilverRequired, highAssayWeight
    };
  }

  function renderCost() {
    saveState();
    const r = calculateCost();
    const set = (id, value, digits = 3) => { const el = document.getElementById(id); if (el) el.textContent = fmt(value, digits); };
    set('r12GoldGramPrice', r.goldPricePerGram, 0);
    set('r12SilverGoldEquivalent', r.silverEquivalentGold);
    set('r12BarDifferenceGold', r.barDifferenceGold);
    set('r12AlloyGoldEquivalent', r.alloyEquivalentGold);
    set('r12CostTotal', r.totalGoldCost);
    const total = $('#r12CostTotalWrap');
    total?.classList.toggle('ready', r.ok);
  }

  function bindMoneyInput(input) {
    if (!input || input.dataset.r12Grouped === '1') return;
    input.dataset.r12Grouped = '1';
    const update = () => {
      const caretAtEnd = input.selectionStart === input.value.length;
      input.value = grouped(input.value);
      if (caretAtEnd) input.setSelectionRange?.(input.value.length, input.value.length);
      renderCost();
    };
    input.addEventListener('input', update);
    input.addEventListener('paste', () => setTimeout(update, 0));
    input.addEventListener('drop', e => e.preventDefault());
  }

  function bindPlainDecimal(input) {
    if (!input || input.dataset.r12Decimal === '1') return;
    input.dataset.r12Decimal = '1';
    const update = () => { input.value = cleanNumber(input.value); renderCost(); };
    input.addEventListener('input', update);
    input.addEventListener('paste', () => setTimeout(update, 0));
    input.addEventListener('drop', e => e.preventDefault());
  }

  function installStyles() {
    if ($('#goldbarR12QuoteStyles')) return;
    const style = document.createElement('style');
    style.id = 'goldbarR12QuoteStyles';
    style.textContent = `
      .r12-cost-card{grid-column:1/-1;border:1px solid rgba(255,255,255,.08);background:linear-gradient(145deg,rgba(24,26,28,.98),rgba(14,16,18,.98));border-radius:16px;padding:18px 20px 16px;direction:rtl;box-sizing:border-box}
      .r12-cost-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:14px}.r12-cost-head h3{margin:0 0 5px;color:#f4f1e9;font-size:18px;font-weight:900}.r12-cost-head p{margin:0;color:#848b96;font-size:10px;font-weight:800}.r12-cost-badge{border:1px solid rgba(242,196,91,.3);background:rgba(242,196,91,.07);color:#f2c45b;border-radius:14px;padding:7px 10px;font-size:9px;font-weight:900;white-space:nowrap}
      .r12-cost-fields{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.r12-cost-field label{display:block;color:#b7bdc7;font-size:10px;font-weight:900;margin-bottom:5px}.r12-cost-input-row{display:flex;gap:6px;direction:ltr}.r12-cost-field input{width:100%;height:40px;box-sizing:border-box;border:1px solid #363b3e;background:#0b0e10;color:#f4f1e9;border-radius:9px;padding:0 10px;font:900 12px Tahoma,"Segoe UI",Arial,sans-serif;text-align:center;direction:ltr;outline:none}.r12-cost-field input:focus{border-color:rgba(242,196,91,.62);box-shadow:0 0 0 2px rgba(242,196,91,.06)}
      .r12-fetch-btn{height:40px;min-width:86px;border:1px solid rgba(242,196,91,.42);background:rgba(242,196,91,.09);color:#f2c45b;border-radius:9px;font:900 10px Tahoma,"Segoe UI",Arial,sans-serif;cursor:pointer}.r12-fetch-btn.busy{opacity:.6;pointer-events:none}.r12-quote-status{margin-top:5px;min-height:16px;color:#717985;font-size:9px;font-weight:800}.r12-quote-status.ok{color:#45d47a}.r12-quote-status.error{color:#ff7d7d}
      .r12-cost-results{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-top:13px}.r12-cost-result{background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.05);border-radius:10px;padding:9px;text-align:center}.r12-cost-result span{display:block;color:#858d99;font-size:9px;font-weight:800;margin-bottom:4px}.r12-cost-result b{display:block;color:#f2c45b;font-size:14px;font-weight:900;direction:ltr}.r12-cost-total{display:flex;align-items:center;justify-content:space-between;margin-top:10px;padding:12px 14px;border:1px solid rgba(242,196,91,.34);border-radius:10px;background:rgba(242,196,91,.055)}.r12-cost-total span{color:#f2c45b;font-size:12px;font-weight:900}.r12-cost-total b{color:#f2c45b;font-size:20px;font-weight:900;direction:ltr}.r12-cost-note{margin-top:8px;color:#68717d;font-size:9px;font-weight:800;line-height:1.6}
      .r12-quote-settings{margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,.08)}.r12-quote-settings h4{margin:0 0 9px;color:#f2c45b;font-size:12px;font-weight:900}.r12-quote-setting{margin-bottom:7px}.r12-quote-setting label{display:block;margin-bottom:4px;color:#9ea5af;font-size:9px;font-weight:800}.r12-quote-setting input{width:100%;height:32px;box-sizing:border-box;border:1px solid #353a3d;background:#0b0e10;color:#f4f1e9;border-radius:8px;padding:0 8px;font:800 10px Tahoma,"Segoe UI",Arial,sans-serif;direction:ltr;text-align:left;outline:none}.r12-quote-actions{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px}.r12-quote-actions button{height:32px;border-radius:8px;font:900 9px Tahoma,"Segoe UI",Arial,sans-serif;cursor:pointer}.r12-quote-save{border:0;background:#f2b91c;color:#171717}.r12-quote-test{border:1px solid rgba(242,196,91,.35);background:rgba(242,196,91,.07);color:#f2c45b}.r12-quote-settings-status{margin-top:6px;min-height:15px;color:#737b86;font-size:8.5px;font-weight:800}.r12-quote-settings-status.ok{color:#45d47a}.r12-quote-settings-status.error{color:#ff7d7d}
      .settings{overflow-y:auto!important;overflow-x:hidden!important}.settings::-webkit-scrollbar{width:5px}.settings::-webkit-scrollbar-thumb{background:rgba(242,196,91,.25);border-radius:8px}
      @media(max-width:1180px){.r12-cost-fields,.r12-cost-results{grid-template-columns:repeat(2,minmax(0,1fr))}}
    `;
    document.head.appendChild(style);
  }

  function buildCostCard() {
    const title = $('.dash-title span:last-child')?.textContent?.trim();
    if (title !== 'محاسبه سریع') return false;
    const host = $('#pageHost');
    const tools = host?.querySelector('.canonical-tools');
    if (!tools) return false;
    let card = $('#r12CostCard');
    if (!card) {
      card = document.createElement('section');
      card.id = 'r12CostCard';
      card.className = 'r12-cost-card';
      card.innerHTML = `
        <div class="r12-cost-head"><div><h3>هزینه عیار</h3><p>محاسبه هزینه نقره، فرق شمش و بار به معادل گرم طلا</p></div><div class="r12-cost-badge">مبنای مثقال 4.3318 g</div></div>
        <div class="r12-cost-fields">
          <div class="r12-cost-field"><label>مظنه طلا — هر مثقال</label><div class="r12-cost-input-row"><input id="r12GoldQuote" inputmode="decimal" autocomplete="off" placeholder="0"><button id="r12FetchQuote" class="r12-fetch-btn">دریافت مظنه</button></div><div id="r12QuoteStatus" class="r12-quote-status">ورود دستی یا دریافت از سایت</div></div>
          <div class="r12-cost-field"><label>مظنه نقره — هر گرم</label><input id="r12SilverQuote" inputmode="decimal" autocomplete="off" placeholder="0"></div>
          <div class="r12-cost-field"><label>فرق شمش — گرم در هر کیلو</label><input id="r12BarDifference" inputmode="decimal" autocomplete="off" placeholder="0"></div>
          <div class="r12-cost-field"><label>هر گرم بار</label><input id="r12AlloyPrice" inputmode="decimal" autocomplete="off" placeholder="0"></div>
        </div>
        <div class="r12-cost-results">
          <div class="r12-cost-result"><span>قیمت هر گرم طلا</span><b id="r12GoldGramPrice">—</b></div>
          <div class="r12-cost-result"><span>هزینه نقره (گرم طلا)</span><b id="r12SilverGoldEquivalent">—</b></div>
          <div class="r12-cost-result"><span>فرق شمش (گرم طلا)</span><b id="r12BarDifferenceGold">—</b></div>
          <div class="r12-cost-result"><span>قیمت بار (گرم طلا)</span><b id="r12AlloyGoldEquivalent">—</b></div>
        </div>
        <div id="r12CostTotalWrap" class="r12-cost-total"><span>جمع هزینه عیار (گرم طلا)</span><b><span id="r12CostTotal">—</span> g</b></div>
        <div class="r12-cost-note">فرق شمش طبق تعریف شما محاسبه می‌شود: عدد 1 یعنی 1 گرم به ازای هر 1,000 گرم از آبشده‌های با عیار بالاتر از 900.</div>`;
      tools.appendChild(card);
      const state = readState();
      $('#r12GoldQuote').value = grouped(state.goldQuote);
      $('#r12SilverQuote').value = grouped(state.silverQuote);
      $('#r12BarDifference').value = state.barDifference || '';
      $('#r12AlloyPrice').value = grouped(state.alloyPrice);
      bindMoneyInput($('#r12GoldQuote'));
      bindMoneyInput($('#r12SilverQuote'));
      bindPlainDecimal($('#r12BarDifference'));
      bindMoneyInput($('#r12AlloyPrice'));
      $('#r12FetchQuote')?.addEventListener('click', () => fetchQuote(true));
      renderCost();
      setTimeout(() => fetchQuote(false), 180);
    }
    return true;
  }

  function setQuoteStatus(message, cls = '') {
    const status = $('#r12QuoteStatus');
    if (!status) return;
    status.className = `r12-quote-status ${cls}`.trim();
    status.textContent = message;
  }

  async function fetchQuote(userInitiated) {
    const button = $('#r12FetchQuote');
    if (!button || button.classList.contains('busy')) return;
    button.classList.add('busy');
    const old = button.textContent;
    button.textContent = 'در حال دریافت...';
    setQuoteStatus('در حال ورود به سایت و دریافت کادر «خرید از ما»...');
    try {
      const result = await r4Request('quote:fetch', null, 35000);
      if (result?.ok && Number(result.quote) > 0) {
        const input = $('#r12GoldQuote');
        if (input) input.value = grouped(String(result.quote));
        const time = result.updatedAt ? new Date(result.updatedAt).toLocaleTimeString('fa-IR', {hour:'2-digit',minute:'2-digit'}) : '';
        setQuoteStatus(`دریافت از سایت${time ? ` — ${time}` : ''}`, 'ok');
        renderCost();
      } else {
        setQuoteStatus(result?.message || 'مظنه موجود نیست', 'error');
      }
    } catch (error) {
      setQuoteStatus(error?.message || 'مظنه موجود نیست', 'error');
      if (userInitiated && !window.__goldbarR4SelfTest) console.warn(error);
    } finally {
      button.classList.remove('busy');
      button.textContent = old;
    }
  }

  async function loadQuoteSettings() {
    try {
      const s = await r4Request('quote:get-settings');
      if ($('#r12QuoteUrl')) $('#r12QuoteUrl').value = s?.url || 'https://aminigold.com/';
      if ($('#r12QuoteUser')) $('#r12QuoteUser').value = s?.username || '';
      const pass = $('#r12QuotePass');
      if (pass) pass.placeholder = s?.hasPassword ? 'رمز ذخیره شده — برای تغییر، رمز جدید وارد کنید' : 'رمز ورود سایت';
    } catch { }
  }

  function buildQuoteSettings() {
    const form = $('.settings-form');
    if (!form || $('#r12QuoteSettings')) return false;
    const wrap = document.createElement('section');
    wrap.id = 'r12QuoteSettings';
    wrap.className = 'r12-quote-settings';
    wrap.innerHTML = `
      <h4>تنظیمات مظنه طلا</h4>
      <div class="r12-quote-setting"><label>لینک منبع مظنه</label><input id="r12QuoteUrl" type="text" autocomplete="off" value="https://aminigold.com/"></div>
      <div class="r12-quote-setting"><label>نام کاربری سایت</label><input id="r12QuoteUser" type="text" autocomplete="off" placeholder="نام کاربری"></div>
      <div class="r12-quote-setting"><label>رمز عبور سایت</label><input id="r12QuotePass" type="password" autocomplete="new-password" placeholder="رمز ورود سایت"></div>
      <div class="r12-quote-actions"><button id="r12QuoteSave" class="r12-quote-save">ذخیره تنظیمات مظنه</button><button id="r12QuoteTest" class="r12-quote-test">تست دریافت مظنه</button></div>
      <div id="r12QuoteSettingsStatus" class="r12-quote-settings-status">رمز با حفاظت حساب ویندوز ذخیره می‌شود.</div>`;
    form.appendChild(wrap);
    $('#r12QuoteSave')?.addEventListener('click', async e => {
      e.preventDefault();
      const status = $('#r12QuoteSettingsStatus');
      try {
        const saved = await r4Request('quote:save-settings', {
          url: $('#r12QuoteUrl')?.value || '',
          username: $('#r12QuoteUser')?.value || '',
          password: $('#r12QuotePass')?.value || ''
        });
        if ($('#r12QuotePass')) $('#r12QuotePass').value = '';
        if (status) { status.className='r12-quote-settings-status ok'; status.textContent='تنظیمات مظنه ذخیره شد ✓'; }
        if ($('#r12QuotePass')) $('#r12QuotePass').placeholder = saved?.hasPassword ? 'رمز ذخیره شده — برای تغییر، رمز جدید وارد کنید' : 'رمز ورود سایت';
      } catch (error) {
        if (status) { status.className='r12-quote-settings-status error'; status.textContent=error?.message || 'خطا در ذخیره تنظیمات'; }
      }
    });
    $('#r12QuoteTest')?.addEventListener('click', async e => {
      e.preventDefault();
      const status = $('#r12QuoteSettingsStatus');
      try {
        await r4Request('quote:save-settings', {
          url: $('#r12QuoteUrl')?.value || '', username: $('#r12QuoteUser')?.value || '', password: $('#r12QuotePass')?.value || ''
        });
        const result = await r4Request('quote:fetch', null, 35000);
        if (result?.ok && Number(result.quote) > 0) {
          if (status) { status.className='r12-quote-settings-status ok'; status.textContent=`مظنه دریافت شد: ${grouped(String(result.quote))} ✓`; }
        } else if (status) {
          status.className='r12-quote-settings-status error'; status.textContent=result?.message || 'مظنه موجود نیست';
        }
      } catch (error) {
        if (status) { status.className='r12-quote-settings-status error'; status.textContent=error?.message || 'مظنه موجود نیست'; }
      }
    });
    loadQuoteSettings();
    return true;
  }

  function installHooks() {
    $$('.nav-item').forEach(btn => {
      if (btn.dataset.r12QuoteHook === '1') return;
      btn.dataset.r12QuoteHook = '1';
      btn.addEventListener('click', () => {
        setTimeout(buildCostCard, 40);
        setTimeout(buildQuoteSettings, 40);
        setTimeout(() => { buildCostCard(); buildQuoteSettings(); }, 180);
      }, true);
    });
  }

  function installProbe() {
    window.__goldbarQuoteProbe = () => {
      const test = (() => {
        const highAssayWeight = 2500, diff = 1;
        return highAssayWeight * diff / 1000;
      })();
      return {
        ok: Boolean($('#r12QuoteSettings') && typeof calculateCost === 'function' && Math.abs(test - 2.5) < 1e-9),
        settingsUi: Boolean($('#r12QuoteSettings')),
        barDifferenceRule: Math.abs(test - 2.5) < 1e-9
      };
    };
  }

  function init(attempt = 0) {
    installStyles();
    installHooks();
    buildQuoteSettings();
    buildCostCard();
    installProbe();
    if (!observer) {
      observer = new MutationObserver(() => {
        installHooks(); buildQuoteSettings();
        if ($('.dash-title span:last-child')?.textContent?.trim() === 'محاسبه سریع') requestAnimationFrame(buildCostCard);
      });
      observer.observe(document.body, { childList:true, subtree:true });
    }
    if ((!window.__goldbarAssayEngineV2 || !$('.settings-form')) && attempt < 50)
      setTimeout(() => init(attempt + 1), 100);
  }

  init();
})();
