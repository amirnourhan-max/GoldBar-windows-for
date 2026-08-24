(() => {
  'use strict';

  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  let seq = 0;
  const pending = new Map();
  let observer = null;
  let quoteFetchPromise = null;
  let lastFetchAt = 0;
  let lastQuoteResult = null;

  function normalizeDigits(value) {
    const fa = '۰۱۲۳۴۵۶۷۸۹', ar = '٠١٢٣٤٥٦٧٨٩';
    return String(value ?? '')
      .replace(/[۰-۹]/g, d => String(fa.indexOf(d)))
      .replace(/[٠-٩]/g, d => String(ar.indexOf(d)));
  }

  function grouped(value) {
    const raw = normalizeDigits(value).replace(/[^0-9]/g, '');
    if (!raw) return '—';
    return raw.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function request(action, payload = null, timeout = 35000) {
    if (!window.chrome?.webview) return Promise.reject(new Error('ارتباط با برنامه ویندوز در دسترس نیست.'));
    const id = `quotev2-${++seq}`;
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

  function installStyles() {
    if ($('#goldbarR12QuoteV2Styles')) return;
    const style = document.createElement('style');
    style.id = 'goldbarR12QuoteV2Styles';
    style.textContent = `
      .r12-live-quotes{display:flex;align-items:stretch;gap:6px;direction:rtl;min-width:0}
      .r12-live-quote{width:108px;height:47px;box-sizing:border-box;border-radius:11px;padding:6px 8px;display:flex;flex-direction:column;justify-content:center;align-items:center;background:#0c0f11;border:1px solid rgba(255,255,255,.08);cursor:pointer;user-select:none;transition:.15s}
      .r12-live-quote:hover{transform:translateY(-1px)}
      .r12-live-quote span{font-size:8px;font-weight:900;line-height:1.1;margin-bottom:4px;white-space:nowrap}
      .r12-live-quote b{font-size:12px;font-weight:900;line-height:1;direction:ltr;white-space:nowrap}
      .r12-live-quote small{display:none}
      .r12-live-quote.buy{border-color:rgba(45,200,110,.34);background:rgba(20,155,85,.07)}
      .r12-live-quote.buy span,.r12-live-quote.buy b{color:#45d47a}
      .r12-live-quote.sell{border-color:rgba(235,76,76,.32);background:rgba(210,50,50,.065)}
      .r12-live-quote.sell span,.r12-live-quote.sell b{color:#ff7777}
      .r12-live-quote.loading b{color:#8b929c!important;font-size:9px}
      .r12-live-refresh{width:31px;height:47px;border-radius:10px;border:1px solid rgba(242,196,91,.25);background:rgba(242,196,91,.055);color:#f2c45b;font:900 15px Tahoma,"Segoe UI",Arial,sans-serif;cursor:pointer}
      .r12-live-refresh.busy{opacity:.5;pointer-events:none}

      .r12-main-quote-settings{direction:rtl}
      .r12-main-quote-settings .r12-main-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:16px}
      .r12-main-quote-settings .r12-main-head h2{margin:0 0 5px!important;color:#f2c45b!important}
      .r12-main-quote-settings .r12-main-head p{margin:0;color:#8f97a4;font-size:11px;font-weight:800}
      .r12-main-quote-settings .r12-main-badge{border:1px solid rgba(242,196,91,.26);background:rgba(242,196,91,.06);color:#f2c45b;border-radius:16px;padding:7px 11px;font-size:9px;font-weight:900;white-space:nowrap}
      .r12-main-quote-grid{display:grid;grid-template-columns:1.35fr 1fr 1fr;gap:12px}
      .r12-main-quote-field label{display:block;margin-bottom:6px;color:#b9c0ca;font-size:11px;font-weight:900}
      .r12-main-quote-field input{width:100%;height:42px;box-sizing:border-box;border:1px solid #363b3e;background:#0b0e10;color:#f4f1e9;border-radius:10px;padding:0 11px;font:900 12px Tahoma,"Segoe UI",Arial,sans-serif;direction:ltr;text-align:left;outline:none}
      .r12-main-quote-field input:focus{border-color:rgba(242,196,91,.62);box-shadow:0 0 0 2px rgba(242,196,91,.06)}
      .r12-main-quote-actions{display:flex;gap:9px;margin-top:14px}
      .r12-main-quote-actions button{min-width:170px;height:40px;border-radius:10px;font:900 11px Tahoma,"Segoe UI",Arial,sans-serif;cursor:pointer}
      .r12-main-quote-save{border:0;background:#f2b91c;color:#171717}
      .r12-main-quote-test{border:1px solid rgba(242,196,91,.36);background:rgba(242,196,91,.07);color:#f2c45b}
      .r12-main-quote-status{margin-top:10px;min-height:18px;color:#7e8691;font-size:10px;font-weight:800}
      .r12-main-quote-status.ok{color:#45d47a}.r12-main-quote-status.error{color:#ff7777}
      .r12-main-quote-preview{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:13px}
      .r12-main-preview-box{border-radius:11px;padding:10px 12px;text-align:center;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.025)}
      .r12-main-preview-box span{display:block;font-size:9px;font-weight:900;margin-bottom:5px}.r12-main-preview-box b{display:block;font-size:16px;font-weight:900;direction:ltr}
      .r12-main-preview-box.buy{border-color:rgba(45,200,110,.28)}.r12-main-preview-box.buy span,.r12-main-preview-box.buy b{color:#45d47a}
      .r12-main-preview-box.sell{border-color:rgba(235,76,76,.28)}.r12-main-preview-box.sell span,.r12-main-preview-box.sell b{color:#ff7777}

      @media(max-width:1320px){.r12-live-quote{width:96px}.r12-live-quote b{font-size:11px}}
      @media(max-width:1120px){.r12-live-quotes{gap:4px}.r12-live-quote{width:84px;padding-inline:5px}.r12-live-quote span{font-size:7px}.r12-live-quote b{font-size:9.5px}.r12-live-refresh{width:27px}.r12-main-quote-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function currentPageTitle() {
    return $('.dash-title span:last-child')?.textContent?.trim() || '';
  }

  function buildDashboardQuotes() {
    const top = $('.top-actions');
    const backup = top?.querySelector('.backup-btn');
    if (!top || !backup) return false;
    let wrap = $('#r12DashboardQuotes');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'r12DashboardQuotes';
      wrap.className = 'r12-live-quotes';
      wrap.innerHTML = `
        <div class="r12-live-quote buy" id="r12DashBuyQuote" title="مظنه خرید از ما — ریال برای هر مثقال"><span>خرید از ما</span><b>—</b></div>
        <div class="r12-live-quote sell" id="r12DashSellQuote" title="مظنه فروش به ما — ریال برای هر مثقال"><span>فروش به ما</span><b>—</b></div>
        <button class="r12-live-refresh" id="r12DashQuoteRefresh" title="بروزرسانی مظنه">↻</button>`;
      backup.insertAdjacentElement('afterend', wrap);
      $('#r12DashQuoteRefresh')?.addEventListener('click', e => {
        e.preventDefault();
        fetchQuotes(true);
      });
      $('#r12DashBuyQuote')?.addEventListener('click', () => fetchQuotes(true));
      $('#r12DashSellQuote')?.addEventListener('click', () => fetchQuotes(true));
    }
    wrap.style.display = currentPageTitle() === 'داشبورد' ? 'flex' : 'none';
    return true;
  }

  function setDashboardLoading(on) {
    ['#r12DashBuyQuote','#r12DashSellQuote'].forEach(sel => {
      const el=$(sel); el?.classList.toggle('loading', on);
      if (on && el?.querySelector('b')) el.querySelector('b').textContent='در حال دریافت';
    });
    $('#r12DashQuoteRefresh')?.classList.toggle('busy', on);
  }

  function applyQuoteResult(result) {
    lastQuoteResult = result || null;
    const buy = Number(result?.buyQuote ?? result?.quote);
    const sell = Number(result?.sellQuote);
    const buyBox = $('#r12DashBuyQuote');
    const sellBox = $('#r12DashSellQuote');
    if (buyBox?.querySelector('b')) buyBox.querySelector('b').textContent = buy > 0 ? grouped(String(buy)) : 'موجود نیست';
    if (sellBox?.querySelector('b')) sellBox.querySelector('b').textContent = sell > 0 ? grouped(String(sell)) : 'موجود نیست';
    const time = result?.updatedAt ? new Date(result.updatedAt).toLocaleTimeString('fa-IR',{hour:'2-digit',minute:'2-digit'}) : '';
    const detail = result?.message || 'مظنه موجود نیست';
    if (buyBox) buyBox.title = `خرید از ما — ریال/مثقال${time ? ` — ${time}` : ''}\n${detail}`;
    if (sellBox) sellBox.title = `فروش به ما — ریال/مثقال${time ? ` — ${time}` : ''}\n${detail}`;
    updateMainPreview(result);
  }

  async function fetchQuotes(force = false) {
    const now = Date.now();
    if (!force && lastQuoteResult && now - lastFetchAt < 60000) {
      applyQuoteResult(lastQuoteResult);
      return lastQuoteResult;
    }
    if (quoteFetchPromise) return quoteFetchPromise;
    setDashboardLoading(true);
    quoteFetchPromise = (async () => {
      try {
        const result = await request('quote:fetch');
        lastFetchAt = Date.now();
        applyQuoteResult(result);
        return result;
      } catch (error) {
        const result = { ok:false, quote:null, buyQuote:null, sellQuote:null, message:error?.message || 'مظنه موجود نیست' };
        applyQuoteResult(result);
        return result;
      } finally {
        quoteFetchPromise = null;
        setDashboardLoading(false);
      }
    })();
    return quoteFetchPromise;
  }

  function updateMainPreview(result) {
    const buy = Number(result?.buyQuote ?? result?.quote);
    const sell = Number(result?.sellQuote);
    const b = $('#r12MainBuyPreview');
    const s = $('#r12MainSellPreview');
    if (b) b.textContent = buy > 0 ? grouped(String(buy)) : '—';
    if (s) s.textContent = sell > 0 ? grouped(String(sell)) : '—';
  }

  function syncExistingSideSettings(settings) {
    if ($('#r12QuoteUrl')) $('#r12QuoteUrl').value = settings?.url || 'https://aminigold.com/';
    if ($('#r12QuoteUser')) $('#r12QuoteUser').value = settings?.username || '';
    const pass = $('#r12QuotePass');
    if (pass) {
      pass.value = '';
      pass.placeholder = settings?.hasPassword ? 'رمز ذخیره شده — برای تغییر، رمز جدید وارد کنید' : 'رمز ورود سایت';
    }
  }

  function fillMainSettings(settings) {
    if ($('#r12MainQuoteUrl')) $('#r12MainQuoteUrl').value = settings?.url || 'https://aminigold.com/';
    if ($('#r12MainQuoteUser')) $('#r12MainQuoteUser').value = settings?.username || '';
    const pass = $('#r12MainQuotePass');
    if (pass) {
      pass.value = '';
      pass.placeholder = settings?.hasPassword ? 'رمز ذخیره شده — برای تغییر، رمز جدید وارد کنید' : 'رمز ورود سایت';
    }
    syncExistingSideSettings(settings);
  }

  async function loadSettingsIntoAll() {
    try {
      const s = await request('quote:get-settings', null, 10000);
      fillMainSettings(s);
      return s;
    } catch { return null; }
  }

  function setMainStatus(message, cls='') {
    const el=$('#r12MainQuoteStatus');
    if (!el) return;
    el.className=`r12-main-quote-status ${cls}`.trim();
    el.textContent=message;
  }

  async function saveMainSettings() {
    setMainStatus('در حال ذخیره...');
    try {
      const saved = await request('quote:save-settings', {
        url: $('#r12MainQuoteUrl')?.value || '',
        username: $('#r12MainQuoteUser')?.value || '',
        password: $('#r12MainQuotePass')?.value || ''
      }, 10000);
      fillMainSettings(saved);
      setMainStatus('تنظیمات مظنه ذخیره شد ✓','ok');
      return saved;
    } catch (error) {
      setMainStatus(error?.message || 'خطا در ذخیره تنظیمات','error');
      return null;
    }
  }

  async function testMainSettings() {
    const saved = await saveMainSettings();
    if (!saved) return;
    setMainStatus('در حال ورود به سایت و خواندن خرید/فروش...');
    const result = await fetchQuotes(true);
    const buy = Number(result?.buyQuote ?? result?.quote);
    const sell = Number(result?.sellQuote);
    if (buy > 0 || sell > 0) {
      const parts=[];
      if (buy > 0) parts.push(`خرید از ما: ${grouped(String(buy))}`);
      if (sell > 0) parts.push(`فروش به ما: ${grouped(String(sell))}`);
      setMainStatus(parts.join('  |  ') + ' ✓','ok');
    } else {
      setMainStatus(result?.message || 'مظنه موجود نیست','error');
    }
  }

  function buildMainQuoteSettings() {
    if (currentPageTitle() !== 'تنظیمات') return false;
    const host = $('#pageHost.active');
    if (!host) return false;
    if ($('#r12MainQuoteSettings')) return true;

    const card = document.createElement('section');
    card.id='r12MainQuoteSettings';
    card.className='page-panel r12-main-quote-settings';
    card.innerHTML=`
      <div class="r12-main-head">
        <div><h2>تنظیمات مظنه طلا</h2><p>اتصال امن به منبع مظنه و دریافت کادرهای «خرید از ما» و «فروش به ما»</p></div>
        <div class="r12-main-badge">AminiGold</div>
      </div>
      <div class="r12-main-quote-grid">
        <div class="r12-main-quote-field"><label>لینک منبع مظنه</label><input id="r12MainQuoteUrl" type="text" autocomplete="off" value="https://aminigold.com/"></div>
        <div class="r12-main-quote-field"><label>نام کاربری سایت</label><input id="r12MainQuoteUser" type="text" autocomplete="off" placeholder="نام کاربری"></div>
        <div class="r12-main-quote-field"><label>رمز عبور سایت</label><input id="r12MainQuotePass" type="password" autocomplete="new-password" placeholder="رمز ورود سایت"></div>
      </div>
      <div class="r12-main-quote-actions"><button id="r12MainQuoteSave" class="r12-main-quote-save">ذخیره تنظیمات مظنه</button><button id="r12MainQuoteTest" class="r12-main-quote-test">تست دریافت مظنه</button></div>
      <div class="r12-main-quote-preview"><div class="r12-main-preview-box buy"><span>خرید از ما — ریال/مثقال</span><b id="r12MainBuyPreview">—</b></div><div class="r12-main-preview-box sell"><span>فروش به ما — ریال/مثقال</span><b id="r12MainSellPreview">—</b></div></div>
      <div id="r12MainQuoteStatus" class="r12-main-quote-status">رمز عبور به‌صورت حفاظت‌شده در حساب ویندوز ذخیره می‌شود.</div>`;
    host.appendChild(card);
    $('#r12MainQuoteSave')?.addEventListener('click', e => { e.preventDefault(); saveMainSettings(); });
    $('#r12MainQuoteTest')?.addEventListener('click', e => { e.preventDefault(); testMainSettings(); });
    loadSettingsIntoAll();
    if (lastQuoteResult) updateMainPreview(lastQuoteResult);
    return true;
  }

  function refreshPageBindings() {
    buildDashboardQuotes();
    const dash = $('#r12DashboardQuotes');
    if (dash) dash.style.display = currentPageTitle()==='داشبورد' ? 'flex' : 'none';
    if (currentPageTitle()==='تنظیمات') buildMainQuoteSettings();
  }

  function installNavHooks() {
    $$('.nav-item').forEach(btn => {
      if (btn.dataset.r12QuoteV2Hook==='1') return;
      btn.dataset.r12QuoteV2Hook='1';
      btn.addEventListener('click', () => {
        setTimeout(refreshPageBindings, 40);
        setTimeout(refreshPageBindings, 180);
        const label=btn.querySelector('span')?.textContent?.trim();
        if (label==='داشبورد') setTimeout(() => fetchQuotes(false), 220);
      }, true);
    });
  }

  function installProbe() {
    window.__goldbarQuoteV2Probe = () => ({
      ok:Boolean($('#r12DashboardQuotes') && typeof fetchQuotes==='function'),
      dashboardQuotes:Boolean($('#r12DashboardQuotes')),
      hasBuy:Boolean($('#r12DashBuyQuote')),
      hasSell:Boolean($('#r12DashSellQuote')),
      mainSettings:Boolean($('#r12MainQuoteSettings'))
    });
  }

  function init(attempt=0) {
    installStyles();
    installNavHooks();
    refreshPageBindings();
    installProbe();
    if (!observer) {
      observer=new MutationObserver(() => {
        installNavHooks();
        refreshPageBindings();
      });
      observer.observe(document.body,{childList:true,subtree:true});
    }
    if ($('#r12DashboardQuotes') && currentPageTitle()==='داشبورد') setTimeout(() => fetchQuotes(false), 450);
    else if (attempt<50) setTimeout(() => init(attempt+1),100);
  }

  init();
})();
