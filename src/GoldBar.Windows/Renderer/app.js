(() => {
  'use strict';

  const DEFAULTS = {
    port: 'COM4', baudRate: 2400, dataBits: 7, parity: 'Even', stopBits: 2,
    flowControl: 'None', autoRead: true, readIntervalMs: 800, decimals: 3,
    requestCommand: 'P', keyboardRead: true
  };
  const ENTRY_KEY = 'goldbar.windows.entries.v2';

  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const byText = (selector, text) => $$(selector).find(el => (el.textContent || '').trim() === text);

  let mockStore = { ...DEFAULTS };
  const bridge = window.goldbar || {
    async getSettings() { return { ...mockStore }; },
    async saveSettings(v) { mockStore = { ...DEFAULTS, ...v }; return { ...mockStore }; },
    async resetSettings() { mockStore = { ...DEFAULTS }; return { ...mockStore }; },
    async readScale() { setWeight(214.373); return { ok: true, mock: true }; },
    async connectScale() { setScaleStatus(true, 'متصل'); return { ok: true, mock: true }; },
    async disconnectScale() { setScaleStatus(false, 'قطع'); return { ok: true, mock: true }; },
    minimize() {}, maximizeToggle() {}, close() {},
    onWeight() {}, onScaleStatus() {}, onScaleError() {}
  };

  let settings = { ...DEFAULTS };
  let connected = true;
  let entries = loadEntries();
  let currentPage = 'dashboard';

  function fitToViewport() {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const scale = Math.min(w / 1536, h / 1024);
    document.documentElement.style.setProperty('--ui-scale', String(Math.max(0.35, scale)));
  }

  function normalizeDigits(value) {
    const fa = '۰۱۲۳۴۵۶۷۸۹';
    const ar = '٠١٢٣٤٥٦٧٨٩';
    return String(value ?? '')
      .replace(/[۰-۹]/g, d => String(fa.indexOf(d)))
      .replace(/[٠-٩]/g, d => String(ar.indexOf(d)))
      .replace(/,/g, '.');
  }

  function sanitizeNumeric(el) {
    const isInteger = el.classList.contains('integer-input');
    let value = normalizeDigits(el.value);
    value = isInteger ? value.replace(/\D/g, '') : value.replace(/[^0-9.]/g, '');
    if (!isInteger) {
      const dot = value.indexOf('.');
      if (dot >= 0) value = value.slice(0, dot + 1) + value.slice(dot + 1).replace(/\./g, '');
    }
    if (el.id === 'purityInput') {
      const n = Number(value);
      if (Number.isFinite(n) && n > 1000) value = '1000';
    }
    el.value = value;
  }

  function bindNumericOnly() {
    $$('.numeric-input').forEach(el => {
      el.addEventListener('input', () => sanitizeNumeric(el));
      el.addEventListener('paste', () => setTimeout(() => sanitizeNumeric(el), 0));
      el.addEventListener('drop', e => e.preventDefault());
    });
    const requestCommand = $('#requestCommand');
    if (requestCommand) requestCommand.readOnly = true;
  }

  function parseNumber(value) {
    const n = Number(normalizeDigits(value));
    return Number.isFinite(n) ? n : NaN;
  }

  function setWeight(value) {
    if (!Number.isFinite(Number(value))) return;
    const fixed = Number(value).toFixed(Number(settings.decimals ?? 3));
    $$('[data-weight-value]').forEach(el => { if ('value' in el) el.value = fixed; else el.textContent = fixed; });
    const weightInput = $('#weightInput');
    if (weightInput) weightInput.value = fixed;
    const result = $('#testResult b');
    if (result) result.textContent = `${fixed} g`;
  }

  function setScaleStatus(isConnected, message = '') {
    connected = Boolean(isConnected);
    const box = $('#scaleStatus');
    if (!box) return;
    box.classList.toggle('offline', !connected);
    const text = box.querySelector('span:last-child');
    if (text) text.textContent = connected ? 'متصل' : (message || 'قطع');
    const btn = $('#scaleDisconnect');
    if (btn) btn.textContent = connected ? 'قطع اتصال' : 'اتصال';
  }

  function setToggle(el, on) {
    if (!el) return;
    el.classList.toggle('on', Boolean(on));
    el.setAttribute('aria-pressed', String(Boolean(on)));
  }

  function populate(s) {
    settings = { ...DEFAULTS, ...s };
    if ($('#portSelect')) $('#portSelect').value = settings.port;
    if ($('#baudSelect')) $('#baudSelect').value = String(settings.baudRate);
    if ($('#dataBitsSelect')) $('#dataBitsSelect').value = String(settings.dataBits);
    if ($('#paritySelect')) $('#paritySelect').value = settings.parity;
    if ($('#stopBitsSelect')) $('#stopBitsSelect').value = String(settings.stopBits);
    if ($('#flowSelect')) $('#flowSelect').value = settings.flowControl;
    if ($('#readInterval')) $('#readInterval').value = String(settings.readIntervalMs);
    if ($('#decimals')) $('#decimals').value = String(settings.decimals);
    if ($('#requestCommand')) $('#requestCommand').value = settings.requestCommand ?? 'P';
    setToggle($('#autoReadToggle'), settings.autoRead);
    setToggle($('#keyboardReadToggle'), settings.keyboardRead);
  }

  function collect() {
    return {
      port: $('#portSelect')?.value || DEFAULTS.port,
      baudRate: Number($('#baudSelect')?.value || DEFAULTS.baudRate),
      dataBits: Number($('#dataBitsSelect')?.value || DEFAULTS.dataBits),
      parity: $('#paritySelect')?.value || DEFAULTS.parity,
      stopBits: Number($('#stopBitsSelect')?.value || DEFAULTS.stopBits),
      flowControl: $('#flowSelect')?.value || DEFAULTS.flowControl,
      autoRead: $('#autoReadToggle')?.classList.contains('on') ?? DEFAULTS.autoRead,
      readIntervalMs: Math.max(100, Number($('#readInterval')?.value) || 800),
      decimals: Math.max(0, Math.min(6, Number($('#decimals')?.value) || 0)),
      requestCommand: 'P',
      keyboardRead: $('#keyboardReadToggle')?.classList.contains('on') ?? DEFAULTS.keyboardRead
    };
  }

  function flashButton(btn, text) {
    if (!btn) return;
    const old = btn.innerHTML;
    btn.textContent = text;
    btn.classList.add('saved');
    setTimeout(() => { btn.innerHTML = old; btn.classList.remove('saved'); }, 900);
  }

  async function readScale() {
    const result = $('#testResult');
    if (result) result.classList.add('waiting');
    try { await bridge.readScale(); }
    catch (e) { setScaleStatus(false, e?.message || 'خطای ترازو'); }
    finally { setTimeout(() => result?.classList.remove('waiting'), 400); }
  }

  function loadEntries() {
    try {
      const raw = localStorage.getItem(ENTRY_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(x => Number.isFinite(Number(x.weight)) && Number.isFinite(Number(x.assay)));
    } catch { return []; }
  }

  function saveEntries() {
    localStorage.setItem(ENTRY_KEY, JSON.stringify(entries));
  }

  function makeId() {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function formatNumber(value, digits = 3) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0';
    return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: digits });
  }

  function formatDate(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    try {
      return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
      }).format(d);
    } catch {
      return d.toLocaleString('fa-IR');
    }
  }

  function totals() {
    const totalWeight = entries.reduce((s, e) => s + Number(e.weight || 0), 0);
    const pure = entries.reduce((s, e) => s + Number(e.weight || 0) * Number(e.assay || 0), 0);
    return {
      totalWeight,
      average: totalWeight > 0 ? pure / totalWeight : 0,
      count: entries.length
    };
  }

  function updateSummary() {
    const cards = $$('.summary-card .metric-value');
    const t = totals();
    if (cards[0]) cards[0].textContent = formatNumber(t.totalWeight, 3);
    if (cards[1]) cards[1].textContent = formatNumber(t.average, 3);
    if (cards[2]) cards[2].textContent = String(t.count);
  }

  function renderRecent() {
    const card = $('.recent-card');
    if (!card) return;
    card.querySelectorAll('.recent-row,.recent-empty').forEach(el => el.remove());
    const view = card.querySelector('.view-all');
    const recent = entries.slice(0, 4);
    if (recent.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'recent-empty';
      empty.textContent = 'هنوز آبشده‌ای ثبت نشده است.';
      card.insertBefore(empty, view);
      return;
    }
    recent.forEach(entry => {
      const row = document.createElement('div');
      row.className = 'recent-row';
      row.dir = 'ltr';
      row.innerHTML = `<span>${formatNumber(entry.weight, 3)} g</span><span>${formatNumber(entry.assay, 3)} ‰</span><span>${formatDate(entry.createdAt)}</span>`;
      card.insertBefore(row, view);
    });
  }

  function renderAllDataViews() {
    updateSummary();
    renderRecent();
    if (currentPage === 'melts') renderMeltsPage();
    if (currentPage === 'reports') renderReportsPage();
  }

  function clearQuickFields() {
    const weight = $('#weightInput');
    const purity = $('#purityInput');
    const desc = $('#descriptionInput');
    if (weight) weight.value = '';
    if (purity) purity.value = '';
    if (desc) desc.value = '';
  }

  function registerQuick() {
    const weightEl = $('#weightInput');
    const assayEl = $('#purityInput');
    if (!weightEl || !assayEl) return false;
    sanitizeNumeric(weightEl);
    sanitizeNumeric(assayEl);
    const weight = parseNumber(weightEl.value);
    const assay = parseNumber(assayEl.value);

    if (!(weight > 0)) {
      weightEl.focus();
      weightEl.classList.add('input-error');
      setTimeout(() => weightEl.classList.remove('input-error'), 900);
      return false;
    }
    if (!(assay > 0 && assay <= 1000)) {
      assayEl.focus();
      assayEl.classList.add('input-error');
      setTimeout(() => assayEl.classList.remove('input-error'), 900);
      return false;
    }

    entries.unshift({
      id: makeId(),
      weight,
      assay,
      description: ($('#descriptionInput')?.value || '').trim(),
      createdAt: new Date().toISOString()
    });
    saveEntries();
    renderAllDataViews();
    clearQuickFields();
    $('#weightInput')?.focus();
    flashButton($('#quickSave'), 'ثبت شد ✓');
    return true;
  }

  function clearAllEntries() {
    if (entries.length === 0) {
      clearQuickFields();
      $('#weightInput')?.focus();
      return;
    }
    if (!window.confirm('همه آبشده‌های ثبت شده پاک شوند؟')) return;
    entries = [];
    saveEntries();
    clearQuickFields();
    renderAllDataViews();
    $('#weightInput')?.focus();
  }

  function deleteEntry(id) {
    entries = entries.filter(e => e.id !== id);
    saveEntries();
    renderAllDataViews();
  }

  function installDynamicStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .workspace-body.full-center{grid-template-columns:1fr!important}
      .page-host{display:none;min-height:100%;padding:2px 0 28px}
      .page-host.active{display:block}
      .page-panel{background:var(--panel,#15171c);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:22px;margin-bottom:18px}
      .page-panel h2,.page-panel h3{margin:0 0 16px;color:#f4f1e9;font-weight:800}
      .page-muted{color:#9ca3af;font-weight:700}
      .melts-table{width:100%;border-collapse:separate;border-spacing:0 8px;direction:rtl}
      .melts-table th{color:#aeb4c0;font-size:13px;padding:8px;text-align:center}
      .melts-table td{background:rgba(255,255,255,.035);padding:13px 10px;text-align:center;font-weight:700}
      .melts-table tr td:first-child{border-radius:0 12px 12px 0}.melts-table tr td:last-child{border-radius:12px 0 0 12px}
      .danger-mini{border:1px solid rgba(255,90,90,.35);background:rgba(255,90,90,.08);color:#ff8d8d;border-radius:10px;padding:7px 12px;cursor:pointer;font-weight:800}
      .report-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
      .report-box{background:rgba(255,255,255,.035);border-radius:14px;padding:16px;text-align:center}
      .report-box span{display:block;color:#9ca3af;margin-bottom:8px}.report-box b{font-size:22px;color:#f2c45b}
      .recent-empty{padding:24px 8px;text-align:center;color:#8f96a3;font-weight:700}
      .input-error{outline:2px solid #ff6565!important;box-shadow:0 0 0 3px rgba(255,101,101,.12)!important}
      .quick-card .action-row{justify-content:flex-start!important}
      .quick-card .action-row>button{min-width:150px}
      @media(max-width:900px){.report-grid{grid-template-columns:1fr}.melts-table{font-size:12px}}
    `;
    document.head.appendChild(style);
  }

  function initRequestedLabelsAndButtons() {
    const calcTitles = $$('.calc-card h3');
    if (calcTitles[0]) calcTitles[0].textContent = 'افزایش عیار';
    if (calcTitles[1]) calcTitles[1].textContent = 'عیار';
    const recentTitle = $('.recent-card h3');
    if (recentTitle) recentTitle.textContent = 'آبشده‌های ثبت شده';

    const actionRow = $('.quick-card .action-row');
    if (actionRow) {
      const buttons = [...actionRow.querySelectorAll('button')];
      if (buttons[0]) {
        buttons[0].id = 'quickSave';
        buttons[0].className = 'primary-btn';
        buttons[0].innerHTML = '<span>ثبت سریع</span><i class="fa-solid fa-plus"></i>';
      }
      if (buttons[1]) buttons[1].remove();
      if (buttons[2]) {
        buttons[2].id = 'quickClearAll';
        buttons[2].className = 'secondary-btn';
        buttons[2].innerHTML = '<span>پاک کردن همه</span><i class="fa-regular fa-trash-can"></i>';
      }
    }

    clearQuickFields();
  }

  function ensurePageHost() {
    let host = $('#pageHost');
    if (host) return host;
    host = document.createElement('section');
    host.id = 'pageHost';
    host.className = 'page-host';
    $('.center')?.appendChild(host);
    return host;
  }

  function setHeader(title, subtitle) {
    const titleEl = $('.dash-title span:last-child');
    const subEl = $('.workspace-header .subtitle');
    if (titleEl) titleEl.textContent = title;
    if (subEl) subEl.textContent = subtitle;
  }

  function setNavActive(page) {
    const map = {
      dashboard: 'داشبورد', register: 'ثبت آبشده', melts: 'آبشده‌ها', assay: 'محاسبات عیار',
      quickcalc: 'محاسبه سریع', reports: 'گزارش‌ها', settings: 'تنظیمات'
    };
    $$('.nav-item').forEach(btn => btn.classList.toggle('active', (btn.textContent || '').includes(map[page] || '')));
  }

  function renderMeltsPage() {
    const host = ensurePageHost();
    if (entries.length === 0) {
      host.innerHTML = '<section class="page-panel"><h2>آبشده‌های ثبت شده</h2><div class="recent-empty">هنوز آبشده‌ای ثبت نشده است.</div></section>';
      return;
    }
    const rows = entries.map((e, i) => `<tr>
      <td>${i + 1}</td>
      <td dir="ltr">${formatNumber(e.weight, 3)} g</td>
      <td dir="ltr">${formatNumber(e.assay, 3)} ‰</td>
      <td>${e.description ? escapeHtml(e.description) : '—'}</td>
      <td>${formatDate(e.createdAt)}</td>
      <td><button class="danger-mini" data-delete-entry="${escapeAttr(e.id)}">حذف</button></td>
    </tr>`).join('');
    host.innerHTML = `<section class="page-panel">
      <h2>آبشده‌های ثبت شده</h2>
      <table class="melts-table"><thead><tr><th>#</th><th>وزن</th><th>عیار</th><th>توضیحات</th><th>تاریخ ثبت</th><th>عملیات</th></tr></thead><tbody>${rows}</tbody></table>
    </section>`;
    host.querySelectorAll('[data-delete-entry]').forEach(btn => btn.addEventListener('click', () => deleteEntry(btn.dataset.deleteEntry)));
  }

  function renderReportsPage() {
    const host = ensurePageHost();
    const t = totals();
    host.innerHTML = `<section class="page-panel"><h2>گزارش‌ها</h2>
      <div class="report-grid">
        <div class="report-box"><span>تعداد آبشده‌ها</span><b>${t.count}</b></div>
        <div class="report-box"><span>وزن کل (g)</span><b dir="ltr">${formatNumber(t.totalWeight, 3)}</b></div>
        <div class="report-box"><span>عیار میانگین (‰)</span><b dir="ltr">${formatNumber(t.average, 3)}</b></div>
      </div></section>`;
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function escapeAttr(s) { return escapeHtml(s); }

  function showPage(page) {
    currentPage = page;
    const summary = $('.summary-grid');
    const quick = $('.quick-card');
    const bottom = $('.bottom-grid');
    const recent = $('.recent-card');
    const settingsPanel = $('.settings');
    const body = $('.workspace-body');
    const host = ensurePageHost();

    [summary, quick, bottom].forEach(el => { if (el) el.style.display = 'none'; });
    if (recent) recent.style.display = '';
    host.classList.remove('active');
    if (settingsPanel) settingsPanel.style.display = '';
    body?.classList.remove('full-center');

    switch (page) {
      case 'register':
        if (quick) quick.style.display = '';
        setHeader('ثبت آبشده', 'ثبت سریع وزن و عیار آبشده');
        setTimeout(() => $('#weightInput')?.focus(), 0);
        break;
      case 'melts':
        renderMeltsPage();
        host.classList.add('active');
        if (settingsPanel) settingsPanel.style.display = 'none';
        body?.classList.add('full-center');
        setHeader('آبشده‌ها', 'مشاهده و مدیریت آبشده‌های ثبت شده');
        break;
      case 'assay':
        if (bottom) bottom.style.display = '';
        if (recent) recent.style.display = 'none';
        setHeader('محاسبات عیار', 'محاسبات افزایش عیار و عیار');
        break;
      case 'quickcalc':
        if (quick) quick.style.display = '';
        setHeader('محاسبه سریع', 'ورود سریع وزن و عیار با کیبورد یا ترازو');
        setTimeout(() => $('#weightInput')?.focus(), 0);
        break;
      case 'reports':
        renderReportsPage();
        host.classList.add('active');
        if (settingsPanel) settingsPanel.style.display = 'none';
        body?.classList.add('full-center');
        setHeader('گزارش‌ها', 'خلاصه اطلاعات آبشده‌های ثبت شده');
        break;
      case 'settings':
        host.innerHTML = '<section class="page-panel"><h2>تنظیمات</h2><div class="page-muted">تنظیمات ترازو از پنل سمت راست قابل تغییر است.</div></section>';
        host.classList.add('active');
        setHeader('تنظیمات', 'تنظیم اتصال و نحوه خواندن ترازو');
        break;
      default:
        if (summary) summary.style.display = '';
        if (quick) quick.style.display = '';
        if (bottom) bottom.style.display = '';
        setHeader('داشبورد', 'نمای کلی، وزن، عیار و عملیات');
        currentPage = 'dashboard';
        break;
    }
    setNavActive(currentPage);
  }

  function bindNavigation() {
    const pageByLabel = {
      'داشبورد': 'dashboard', 'ثبت آبشده': 'register', 'آبشده‌ها': 'melts',
      'محاسبات عیار': 'assay', 'محاسبه سریع': 'quickcalc', 'گزارش‌ها': 'reports', 'تنظیمات': 'settings'
    };
    $$('.nav-item').forEach(btn => {
      const label = btn.querySelector('span')?.textContent?.trim();
      const page = pageByLabel[label];
      if (page) btn.addEventListener('click', () => showPage(page));
    });
    $('.view-all')?.addEventListener('click', () => showPage('melts'));
  }

  function bindQuickRegistration() {
    $('#quickSave')?.addEventListener('click', registerQuick);
    $('#quickClearAll')?.addEventListener('click', clearAllEntries);
    $('#weightInput')?.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      sanitizeNumeric(e.currentTarget);
      const assay = $('#purityInput');
      assay?.focus();
      assay?.select();
    });
    $('#purityInput')?.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      registerQuick();
    });
    $('#descriptionInput')?.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      registerQuick();
    });
  }

  fitToViewport();
  window.addEventListener('resize', fitToViewport, { passive: true });
  installDynamicStyles();
  initRequestedLabelsAndButtons();
  bindNumericOnly();
  bindNavigation();
  bindQuickRegistration();
  renderAllDataViews();

  $('#winMin')?.addEventListener('click', () => bridge.minimize());
  $('#winMax')?.addEventListener('click', () => bridge.maximizeToggle());
  $('#winClose')?.addEventListener('click', () => bridge.close());

  $('#readScale')?.addEventListener('click', readScale);
  $('#testScale')?.addEventListener('click', readScale);
  $('#autoReadToggle')?.addEventListener('click', e => setToggle(e.currentTarget, !e.currentTarget.classList.contains('on')));
  $('#keyboardReadToggle')?.addEventListener('click', e => setToggle(e.currentTarget, !e.currentTarget.classList.contains('on')));

  $('#scaleDisconnect')?.addEventListener('click', async () => {
    if (connected) {
      await bridge.disconnectScale();
      setScaleStatus(false, 'قطع');
    } else {
      const r = await bridge.connectScale();
      setScaleStatus(Boolean(r?.ok), r?.reason || 'خطا');
    }
  });

  $('#saveSettings')?.addEventListener('click', async e => {
    settings = await bridge.saveSettings(collect());
    populate(settings);
    flashButton(e.currentTarget, 'ذخیره شد ✓');
  });

  $('#resetSettings')?.addEventListener('click', async () => {
    settings = await bridge.resetSettings();
    populate(settings);
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'ArrowUp' && $('#keyboardReadToggle')?.classList.contains('on')) {
      const tag = document.activeElement?.tagName;
      if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') {
        e.preventDefault();
        readScale();
      }
    }
  });

  bridge.onWeight?.(payload => {
    if (payload && Number.isFinite(Number(payload.value))) setWeight(Number(payload.value));
  });
  bridge.onScaleStatus?.(payload => setScaleStatus(Boolean(payload?.connected), payload?.message || ''));
  bridge.onScaleError?.(payload => setScaleStatus(false, payload?.message || 'خطای ترازو'));

  bridge.getSettings().then(populate).catch(() => populate(DEFAULTS));

  window.__goldbarSelfTest = () => {
    const labelsOk = $('.recent-card h3')?.textContent.trim() === 'آبشده‌های ثبت شده'
      && $$('.calc-card h3')[0]?.textContent.trim() === 'افزایش عیار'
      && $$('.calc-card h3')[1]?.textContent.trim() === 'عیار';
    const buttonsOk = Boolean($('#quickSave') && $('#quickClearAll') && $('.quick-card .action-row')?.querySelectorAll('button').length === 2);
    const navOk = $$('.nav-item').length === 7;
    const numericOk = $$('.numeric-input').every(el => el.id === 'descriptionInput' || el.classList.contains('numeric-input'));
    return { ok: labelsOk && buttonsOk && navOk && numericOk, labelsOk, buttonsOk, navOk, numericOk };
  };
})();
