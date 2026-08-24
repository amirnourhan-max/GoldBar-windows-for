(() => {
  'use strict';

  const ENTRY_KEY = 'goldbar.windows.entries.v2';
  const SESSION_KEY = 'goldbar.windows.r4.session';
  const POST_CLEAR_KEY = 'goldbar.windows.r7.postclear';
  const selfTest = Boolean(window.__goldbarR4SelfTest);
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  let requestSeq = 0;
  const pending = new Map();
  let dashboardBusy = false;
  let observer = null;
  let assayState = { increaseTarget: '747', barAssay: '995', alloyTarget: '747', silverPercent: '45' };

  function normalizeDigits(value) {
    const fa = '۰۱۲۳۴۵۶۷۸۹';
    const ar = '٠١٢٣٤٥٦٨٩';
    return String(value ?? '')
      .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
      .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
      .replace(/,/g, '.');
  }

  function numberValue(value) {
    const n = Number(normalizeDigits(value));
    return Number.isFinite(n) ? n : NaN;
  }

  function sanitizeDecimal(input, min = null, max = null) {
    let value = normalizeDigits(input.value).replace(/[^0-9.]/g, '');
    const dot = value.indexOf('.');
    if (dot >= 0) value = value.slice(0, dot + 1) + value.slice(dot + 1).replace(/\./g, '');
    if (value !== '' && value !== '.' && !value.endsWith('.')) {
      let n = Number(value);
      if (Number.isFinite(min)) n = Math.max(min, n);
      if (Number.isFinite(max)) n = Math.min(max, n);
      if (Number.isFinite(n)) value = String(n);
    }
    input.value = value;
  }

  function formatNumber(value, digits = 3) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: digits });
  }

  function formatDate(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value ?? '—');
    try {
      return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
      }).format(d);
    } catch { return d.toLocaleString('fa-IR'); }
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }

  function readEntries() {
    try {
      const parsed = JSON.parse(localStorage.getItem(ENTRY_KEY) || '[]');
      return Array.isArray(parsed)
        ? parsed.filter(x => Number(x?.weight) > 0 && Number(x?.assay) > 0 && Number(x?.assay) <= 1000)
        : [];
    } catch { return []; }
  }

  function r4Request(action, payload = null) {
    if (!window.chrome?.webview) return Promise.reject(new Error('ارتباط با برنامه ویندوز در دسترس نیست.'));
    const id = `r7-${++requestSeq}`;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      window.chrome.webview.postMessage({ kind: 'r4request', id, action, payload });
      setTimeout(() => {
        const item = pending.get(id);
        if (!item) return;
        pending.delete(id);
        reject(new Error(`Timeout: ${action}`));
      }, 6000);
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

  function installStyles() {
    if ($('#goldbarR7Styles')) return;
    const style = document.createElement('style');
    style.id = 'goldbarR7Styles';
    style.textContent = `
      .r7-user-chip{display:flex;align-items:center;gap:8px;height:38px;padding:0 9px 0 3px;border-radius:19px;color:#e9edf4;font-size:12px;font-weight:900;direction:rtl;white-space:nowrap;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.06)}
      .r7-user-chip .circle-btn{margin:0!important;flex:0 0 auto}
      .r7-dashboard-scroll{max-height:184px;overflow-y:auto;overflow-x:hidden;padding-inline-end:4px;margin-top:6px;scrollbar-gutter:stable}
      .r7-dashboard-scroll::-webkit-scrollbar{width:8px}.r7-dashboard-scroll::-webkit-scrollbar-track{background:rgba(255,255,255,.025);border-radius:8px}.r7-dashboard-scroll::-webkit-scrollbar-thumb{background:rgba(242,196,91,.36);border-radius:8px}
      .r7-assay-page{display:grid;grid-template-columns:1fr 1fr;gap:18px;direction:rtl}
      .r7-assay-card{background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.085);border-radius:17px;padding:20px;min-width:0}
      .r7-assay-card h2{margin:0 0 5px;color:#f4f1e9;font-size:18px;font-weight:900}.r7-assay-sub{color:#929aa7;font-size:11px;font-weight:800;line-height:1.7;margin-bottom:16px}
      .r7-summary-strip{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:16px}.r7-summary-box{background:rgba(255,255,255,.035);border-radius:11px;padding:10px;text-align:center}.r7-summary-box span{display:block;color:#99a1ad;font-size:10px;font-weight:800;margin-bottom:4px}.r7-summary-box b{display:block;color:#f2c45b;font-size:17px;font-weight:900;direction:ltr}
      .r7-fields{display:grid;grid-template-columns:1fr 1fr;gap:11px}.r7-field label{display:block;color:#b1b8c3;font-size:11px;font-weight:900;margin:0 0 6px}.r7-field input{box-sizing:border-box;width:100%;height:42px;border:1px solid #3a3e40;background:#0d1012;color:#f4f1e9;border-radius:10px;padding:0 11px;font:900 14px Tahoma,Arial,sans-serif;direction:ltr;text-align:center;outline:none}.r7-field input:focus{border-color:rgba(242,196,91,.65);box-shadow:0 0 0 2px rgba(242,196,91,.08)}
      .r7-results{display:grid;grid-template-columns:repeat(2,1fr);gap:9px;margin-top:14px}.r7-result{background:rgba(255,255,255,.035);border-radius:11px;padding:10px;text-align:center}.r7-result.wide{grid-column:1/-1}.r7-result span{display:block;color:#99a1ad;font-size:10px;font-weight:800;margin-bottom:4px}.r7-result b{display:block;color:#f2c45b;font-size:16px;font-weight:900;direction:ltr}.r7-result b.white{color:#f4f1e9}
      .r7-status{margin-top:12px;border-radius:10px;padding:9px 11px;text-align:center;font-size:11px;font-weight:900;color:#aeb6c2;background:rgba(255,255,255,.025)}.r7-status.good{color:#70d99a;background:rgba(70,190,115,.07)}.r7-status.warn{color:#f4c866;background:rgba(242,196,91,.07)}
      .r7-formula-note{margin-top:13px;padding-top:10px;border-top:1px solid rgba(255,255,255,.06);color:#7f8794;font-size:9px;font-weight:700;direction:ltr;text-align:left;line-height:1.5}
      .r7-split-panel{margin-top:13px;padding-top:12px;border-top:1px solid rgba(255,255,255,.07)}.r7-split-panel-title{color:#aeb5c0;font-size:11px;font-weight:900;margin-bottom:8px;text-align:right}.r7-split-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;direction:rtl}.r7-split-grid label{display:block;color:#9ca3af;font-size:10px;font-weight:800;margin-bottom:5px}.r7-split-grid input{width:100%;box-sizing:border-box;border:1px solid #3a3e40;background:#0d1012;color:#f4f1e9;border-radius:9px;padding:9px 10px;font:900 13px Tahoma,Arial,sans-serif;text-align:center;direction:ltr}.r7-split-total{text-align:center;color:#8d95a2;font-size:10px;font-weight:800;margin-top:6px}.r7-split-total.warn{color:#ff9b78}
      @media(max-width:1050px){.r7-assay-page{grid-template-columns:1fr}.r7-dashboard-scroll{max-height:160px}}
    `;
    document.head.appendChild(style);
  }

  function clearStorageOnly() {
    localStorage.removeItem(ENTRY_KEY);
  }

  function installClearAll() {
    const button = $('#quickClearAll');
    if (!button || button.dataset.r7Clear === '1') return false;
    button.dataset.r7Clear = '1';
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopImmediatePropagation();

      if (selfTest) {
        ['weightInput','purityInput','descriptionInput'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        return;
      }

      const ok = window.confirm('تمام آبشده‌های ثبت‌شده، وزن، عیار، توضیحات و ورودی‌های محاسبات پاک شوند؟\n\nاین عمل قابل بازگشت نیست. تنظیمات ترازو، مسیر گزارش و اطلاعات ورود حذف نمی‌شوند.');
      if (!ok) return;
      clearStorageOnly();
      sessionStorage.setItem(SESSION_KEY, '1');
      sessionStorage.setItem(POST_CLEAR_KEY, '1');
      location.reload();
    }, true);
    return true;
  }

  function applyPostClear() {
    if (sessionStorage.getItem(POST_CLEAR_KEY) !== '1') return;
    sessionStorage.removeItem(POST_CLEAR_KEY);
    ['weightInput','purityInput','descriptionInput'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    $$('.calc-card input').forEach(el => { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); });
  }

  function renderDashboardRecent() {
    const card = $('.recent-card');
    if (!card || dashboardBusy) return;
    const title = $('.dash-title span:last-child')?.textContent?.trim();
    if (title !== 'داشبورد') return;
    dashboardBusy = true;
    try {
      card.querySelectorAll(':scope > .recent-row,:scope > .recent-empty,:scope > .r7-dashboard-scroll').forEach(el => el.remove());
      const viewAll = card.querySelector('.view-all');
      const list = document.createElement('div');
      list.className = 'r7-dashboard-scroll';
      const entries = readEntries();
      if (entries.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'recent-empty';
        empty.textContent = 'هنوز آبشده‌ای ثبت نشده است.';
        list.appendChild(empty);
      } else {
        for (const entry of entries) {
          const row = document.createElement('div');
          row.className = 'recent-row';
          row.dir = 'ltr';
          row.innerHTML = `<span>${formatNumber(entry.weight, 3)} g</span><span>${formatNumber(entry.assay, 3)} ‰</span><span>${escapeHtml(formatDate(entry.createdAt))}</span>`;
          list.appendChild(row);
        }
      }
      card.insertBefore(list, viewAll || null);
    } finally {
      dashboardBusy = false;
    }
  }

  function setHeader(title, subtitle) {
    const t = $('.dash-title span:last-child');
    const s = $('.workspace-header .subtitle');
    if (t) t.textContent = title;
    if (s) s.textContent = subtitle;
  }

  function setNavActive(target) {
    $$('.nav-item').forEach(btn => btn.classList.toggle('active', btn === target));
  }

  function ensurePageHost() {
    let host = $('#pageHost');
    if (!host) {
      host = document.createElement('section');
      host.id = 'pageHost';
      host.className = 'page-host';
      $('.center')?.appendChild(host);
    }
    return host;
  }

  function assayHtml(summary) {
    return `<section class="page-panel"><div class="r7-assay-page">
      <article class="r7-assay-card" id="r7IncreaseCard">
        <h2>افزایش عیار</h2>
        <div class="r7-assay-sub">محاسبه مقدار شمش عیار بالا بر اساس وزن کل و عیار میانگین وزنی آبشده‌های ثبت‌شده.</div>
        <div class="r7-summary-strip">
          <div class="r7-summary-box"><span>وزن آبشده‌ها (g)</span><b id="r7IncWeight">${formatNumber(summary.weight,3)}</b></div>
          <div class="r7-summary-box"><span>عیار آبشده‌ها (‰)</span><b id="r7IncCurrent">${formatNumber(summary.averageAssay,3)}</b></div>
        </div>
        <div class="r7-fields">
          <div class="r7-field"><label>عیار هدف</label><input id="r7IncreaseTarget" inputmode="decimal" value="${assayState.increaseTarget}"></div>
          <div class="r7-field"><label>عیار شمش</label><input id="r7BarAssay" inputmode="decimal" value="${assayState.barAssay}"></div>
        </div>
        <div class="r7-results">
          <div class="r7-result"><span>اختلاف عیار طلا</span><b id="r7AssayDiff">—</b></div>
          <div class="r7-result"><span>فاصله عیار شمش تا هدف</span><b id="r7Denominator">—</b></div>
          <div class="r7-result wide"><span>شمش مورد نیاز (g)</span><b id="r7RequiredBar">—</b></div>
        </div>
        <div class="r7-status" id="r7IncreaseStatus">—</div>
        <div class="r7-formula-note">Excel: ROUNDDOWN(weight × (target − currentAssay) ÷ (barAssay − target), 1)</div>
      </article>

      <article class="r7-assay-card" id="r7AlloyCard">
        <h2>عیار</h2>
        <div class="r7-assay-sub">محاسبه کل بار لازم برای کاهش عیار و تفکیک دقیق نقره و سایر بارها طبق فایل اکسل مرجع.</div>
        <div class="r7-summary-strip">
          <div class="r7-summary-box"><span>وزن آبشده‌ها (g)</span><b id="r7AlloyWeight">${formatNumber(summary.weight,3)}</b></div>
          <div class="r7-summary-box"><span>عیار آبشده‌ها (‰)</span><b id="r7AlloyCurrent">${formatNumber(summary.averageAssay,3)}</b></div>
        </div>
        <div class="r7-fields">
          <div class="r7-field"><label>عیار هدف</label><input id="r7AlloyTarget" inputmode="decimal" value="${assayState.alloyTarget}"></div>
          <div class="r7-field"><label>درصد نقره</label><input id="r7SilverPercent" inputmode="decimal" value="${assayState.silverPercent}"></div>
        </div>
        <div class="r7-results">
          <div class="r7-result wide"><span>کل بار مورد نیاز (g)</span><b id="r7TotalAlloy">—</b></div>
          <div class="r7-result"><span>نقره مورد نیاز (g)</span><b id="r7Silver">—</b></div>
          <div class="r7-result"><span>بار بدون نقره (g)</span><b id="r7NonSilver">—</b></div>
          <div class="r7-result"><span>۰.۴٪ وزن آبشده‌ها (g)</span><b id="r7FourPerThousand">—</b></div>
          <div class="r7-result"><span>بار نهایی دیگر (g)</span><b id="r7FinalOther">—</b></div>
          <div class="r7-result wide"><span>وزن نهایی آبشده + بار (g)</span><b class="white" id="r7TotalAfter">—</b></div>
        </div>
        <div class="r7-status" id="r7AlloyStatus">—</div>
        <div class="r7-formula-note">Excel: totalAlloy = weight × currentAssay ÷ target − weight</div>
      </article>
    </div></section>`;
  }

  function recalcAssay() {
    const engine = window.__goldbarAssayEngineV2;
    if (!engine) return;
    const summary = engine.summarize(readEntries());
    const incTarget = numberValue($('#r7IncreaseTarget')?.value);
    const barAssay = numberValue($('#r7BarAssay')?.value);
    const alloyTarget = numberValue($('#r7AlloyTarget')?.value);
    const silverPct = numberValue($('#r7SilverPercent')?.value);

    assayState = {
      increaseTarget: $('#r7IncreaseTarget')?.value ?? assayState.increaseTarget,
      barAssay: $('#r7BarAssay')?.value ?? assayState.barAssay,
      alloyTarget: $('#r7AlloyTarget')?.value ?? assayState.alloyTarget,
      silverPercent: $('#r7SilverPercent')?.value ?? assayState.silverPercent
    };

    const inc = engine.increaseAssay(summary, incTarget, barAssay);
    const alloy = engine.alloyForTarget(summary, alloyTarget, silverPct, summary.weight);
    const set = (id, value, digits=3) => { const el = document.getElementById(id); if (el) el.textContent = Number.isFinite(value) ? formatNumber(value,digits) : '—'; };
    set('r7IncWeight', summary.weight, 3); set('r7IncCurrent', summary.averageAssay, 3);
    set('r7AlloyWeight', summary.weight, 3); set('r7AlloyCurrent', summary.averageAssay, 3);
    set('r7AssayDiff', inc.assayDifference, 3); set('r7Denominator', inc.denominator, 3); set('r7RequiredBar', inc.requiredBar, 1);
    set('r7TotalAlloy', alloy.totalAlloyRequired, 3); set('r7Silver', alloy.silverRequired, 3); set('r7NonSilver', alloy.nonSilverRequired, 3);
    set('r7FourPerThousand', alloy.fourPerThousand, 3); set('r7FinalOther', alloy.finalOtherAlloy, 3); set('r7TotalAfter', alloy.totalAfterAlloy, 3);

    const incStatus = $('#r7IncreaseStatus');
    if (incStatus) {
      incStatus.className = 'r7-status';
      if (!(summary.weight > 0)) incStatus.textContent = 'ابتدا حداقل یک آبشده ثبت یا گزارش را وارد کن.';
      else if (!Number.isFinite(inc.requiredBar)) incStatus.textContent = 'ورودی‌های عیار را بررسی کن.';
      else if (inc.requiredBar <= 0) { incStatus.textContent = 'افزایش عیار لازم نیست.'; incStatus.classList.add('good'); }
      else { incStatus.textContent = `شمش مورد نیاز: ${formatNumber(inc.requiredBar,1)} g`; incStatus.classList.add('warn'); }
    }

    const alloyStatus = $('#r7AlloyStatus');
    if (alloyStatus) {
      alloyStatus.className = 'r7-status';
      if (!(summary.weight > 0)) alloyStatus.textContent = 'ابتدا حداقل یک آبشده ثبت یا گزارش را وارد کن.';
      else if (!Number.isFinite(alloy.totalAlloyRequired)) alloyStatus.textContent = 'عیار هدف و درصد نقره را بررسی کن.';
      else if (alloy.totalAlloyRequired <= 0) { alloyStatus.textContent = 'برای این عیار هدف، افزودن بار کاهش عیار لازم نیست.'; alloyStatus.classList.add('good'); }
      else { alloyStatus.textContent = `کل بار مورد نیاز: ${formatNumber(alloy.totalAlloyRequired,3)} g`; alloyStatus.classList.add('warn'); }
    }
  }

  function bindAssayInputs() {
    ['r7IncreaseTarget','r7BarAssay','r7AlloyTarget','r7SilverPercent'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        sanitizeDecimal(el, 0, id === 'r7SilverPercent' ? 100 : 1000);
        recalcAssay();
      });
      el.addEventListener('paste', () => setTimeout(() => { sanitizeDecimal(el, 0, id === 'r7SilverPercent' ? 100 : 1000); recalcAssay(); }, 0));
      el.addEventListener('drop', e => e.preventDefault());
    });
  }

  function showAssayPage(nav) {
    const engine = window.__goldbarAssayEngineV2;
    if (!engine) return;
    const host = ensurePageHost();
    const summary = engine.summarize(readEntries());
    ['.summary-grid','.quick-card','.bottom-grid','.recent-card'].forEach(sel => { const el = $(sel); if (el) el.style.display = 'none'; });
    const settings = $('.settings');
    if (settings) settings.style.display = 'none';
    $('.workspace-body')?.classList.add('full-center');
    host.innerHTML = assayHtml(summary);
    host.classList.add('active');
    setNavActive(nav);
    setHeader('محاسبات عیار', 'محاسبات بازنویسی‌شده و تطبیق‌شده با فایل اکسل مرجع');
    bindAssayInputs();
    recalcAssay();
  }

  function installAssayNavigation() {
    const nav = $$('.nav-item').find(btn => btn.querySelector('span')?.textContent?.trim() === 'محاسبات عیار');
    if (!nav || nav.dataset.r7Assay === '1') return false;
    nav.dataset.r7Assay = '1';
    nav.addEventListener('click', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      showAssayPage(nav);
    }, true);
    return true;
  }

  function patchQuickCalc() {
    const splitBase = $('#splitBaseWin');
    const correction = $('#corrWeightWin');
    if (!splitBase || !correction) return false;
    const tools = $$('.canonical-tool');
    const splitTool = tools.find(x => x.querySelector('#splitBaseWin'));
    const correctionTool = tools.find(x => x.querySelector('#corrWeightWin'));
    if (!splitTool || !correctionTool) return false;

    splitTool.querySelector('h3') && (splitTool.querySelector('h3').textContent = 'طلای 995 / طلای 750');
    const resultLabels = splitTool.querySelectorAll('.canonical-result span');
    if (resultLabels[0]) resultLabels[0].textContent = 'طلای 995';
    if (resultLabels[1]) resultLabels[1].textContent = 'طلای 750';
    const corrLabels = correctionTool.querySelectorAll('label');
    if (corrLabels[1]) corrLabels[1].textContent = 'عیار پایه';

    let panel = $('#r7SplitPanel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'r7SplitPanel';
      panel.className = 'r7-split-panel';
      panel.innerHTML = `<div class="r7-split-panel-title">درصد تقسیم — قابل تغییر</div>
        <div class="r7-split-grid">
          <div><label>درصد طلای 995</label><input id="r7Pct995" inputmode="decimal" value="36.79"></div>
          <div><label>درصد طلای 750</label><input id="r7Pct750" inputmode="decimal" value="63.21"></div>
        </div><div class="r7-split-total" id="r7PctTotal">جمع درصدها: 100%</div>`;
      splitTool.appendChild(panel);
    }

    const recalc = () => {
      const engine = window.__goldbarAssayEngineV2;
      const result = engine?.splitByPercent(numberValue(splitBase.value), numberValue($('#r7Pct995')?.value), numberValue($('#r7Pct750')?.value));
      const a = $('#split3679Win'); const b = $('#split6321Win');
      if (a) a.textContent = Number.isFinite(result?.gold995) ? formatNumber(result.gold995,3) : '0';
      if (b) b.textContent = Number.isFinite(result?.gold750) ? formatNumber(result.gold750,3) : '0';
      const total = $('#r7PctTotal');
      if (total) {
        const sum = result?.totalPercent;
        total.textContent = `جمع درصدها: ${Number.isFinite(sum) ? formatNumber(sum,2) : '0'}%`;
        total.classList.toggle('warn', !Number.isFinite(sum) || Math.abs(sum - 100) > 0.001);
      }
    };

    if (splitTool.dataset.r7Bound !== '1') {
      splitTool.dataset.r7Bound = '1';
      [splitBase,$('#r7Pct995'),$('#r7Pct750')].filter(Boolean).forEach(input => {
        input.addEventListener('input', () => { sanitizeDecimal(input,0,input === splitBase ? null : 100); setTimeout(recalc,0); });
        input.addEventListener('paste', () => setTimeout(() => { sanitizeDecimal(input,0,input === splitBase ? null : 100); recalc(); },0));
        input.addEventListener('drop', e => e.preventDefault());
      });
    }
    recalc();
    return true;
  }

  function installQuickCalcPatch() {
    const nav = $$('.nav-item').find(btn => btn.querySelector('span')?.textContent?.trim() === 'محاسبه سریع');
    if (!nav || nav.dataset.r7Quick === '1') return false;
    nav.dataset.r7Quick = '1';
    nav.addEventListener('click', () => {
      setTimeout(patchQuickCalc, 20);
      setTimeout(patchQuickCalc, 100);
    }, true);
    return true;
  }

  async function installUsername() {
    if ($('#r7UserChip')) return true;
    const userButton = $('.top-actions .circle-btn.gold');
    if (!userButton) return false;
    let username = '';
    try { username = String((await r4Request('user:get'))?.username || '').trim(); } catch { }
    if (!username) username = selfTest ? 'self-test' : 'کاربر';
    const chip = document.createElement('div');
    chip.id = 'r7UserChip';
    chip.className = 'r7-user-chip';
    const label = document.createElement('span');
    label.textContent = username;
    const parent = userButton.parentElement;
    parent?.insertBefore(chip, userButton);
    chip.appendChild(userButton);
    chip.appendChild(label);
    return true;
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(() => {
      requestAnimationFrame(() => {
        installClearAll();
        if ($('.dash-title span:last-child')?.textContent?.trim() === 'داشبورد') renderDashboardRecent();
        if ($('.dash-title span:last-child')?.textContent?.trim() === 'محاسبه سریع') patchQuickCalc();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function installProbe(attempt = 0) {
    const previous = window.__goldbarR3Probe;
    if (typeof previous !== 'function') {
      if (attempt < 30) setTimeout(() => installProbe(attempt + 1), 100);
      return;
    }
    if (previous.__r7Wrapped) return;
    const wrapper = () => {
      const base = previous();
      const engineProbe = window.__goldbarAssayEngineV2?.probeWorkbookReference?.() || { ok:false };
      const old = localStorage.getItem(ENTRY_KEY);
      localStorage.setItem(ENTRY_KEY, '[{"weight":100,"assay":750}]');
      clearStorageOnly();
      const clearStorageWorks = localStorage.getItem(ENTRY_KEY) === null;
      if (old === null) localStorage.removeItem(ENTRY_KEY); else localStorage.setItem(ENTRY_KEY, old);
      const r7 = {
        clearHandler: $('#quickClearAll')?.dataset.r7Clear === '1',
        assayNavigation: $$('.nav-item').some(x => x.dataset.r7Assay === '1'),
        dashboardScrollSupport: Boolean($('#goldbarR7Styles')),
        usernameChip: Boolean($('#r7UserChip')),
        quickCalcPatch: $$('.nav-item').some(x => x.dataset.r7Quick === '1'),
        engineWorkbookReference: Boolean(engineProbe.ok),
        clearStorageWorks
      };
      r7.ok = Object.values(r7).every(Boolean);
      return { ...base, r7, ok: Boolean(base?.ok && r7.ok) };
    };
    wrapper.__r7Wrapped = true;
    window.__goldbarR3Probe = wrapper;
  }

  function updateVersion() {
    const version = $('.version');
    if (version) version.textContent = 'GOLD BAR v2.0.0-r7';
  }

  async function init(attempt = 0) {
    installStyles();
    const ready = Boolean(window.__goldbarAssayEngineV2 && $('#quickClearAll') && $('.nav-item'));
    if (!ready) {
      if (attempt < 50) setTimeout(() => init(attempt + 1), 100);
      return;
    }
    installClearAll();
    installAssayNavigation();
    installQuickCalcPatch();
    applyPostClear();
    renderDashboardRecent();
    await installUsername();
    startObserver();
    updateVersion();
    setTimeout(() => installProbe(), 1000);
  }

  init();
})();
