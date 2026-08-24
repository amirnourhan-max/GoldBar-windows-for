(() => {
  'use strict';

  const ENTRY_KEY = 'goldbar.windows.entries.v2';
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const bridge = window.goldbar;
  if (!bridge) return;

  let calculationDelegationInstalled = false;
  let titlebarDragInstalled = false;
  let reportUiInstalled = false;
  let manualScaleCaptureInstalled = false;

  function normalizeDigits(value) {
    const fa = '۰۱۲۳۴۵۶۷۸۹';
    const ar = '٠١٢٣٤٥٦٧٨٩';
    return String(value ?? '')
      .replace(/[۰-۹]/g, d => String(fa.indexOf(d)))
      .replace(/[٠-٩]/g, d => String(ar.indexOf(d)))
      .replace(/,/g, '.');
  }

  function sanitizeDecimal(input) {
    let v = normalizeDigits(input.value).replace(/[^0-9.]/g, '');
    const dot = v.indexOf('.');
    if (dot >= 0) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '');
    input.value = v;
  }

  function sanitizeInteger(input, min = null, max = null) {
    let v = normalizeDigits(input.value).replace(/\D/g, '');
    if (v !== '') {
      let n = Number(v);
      if (Number.isFinite(min)) n = Math.max(min, n);
      if (Number.isFinite(max)) n = Math.min(max, n);
      v = String(n);
    }
    input.value = v;
  }

  function installStyles() {
    if ($('#goldbarR3Styles')) return;
    const style = document.createElement('style');
    style.id = 'goldbarR3Styles';
    style.textContent = `
      .r3-settings-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 20px;direction:rtl}
      .r3-field{min-width:0}.r3-field.full{grid-column:1/-1}.r3-field label{display:block;color:#b7bdc8;font-weight:800;margin:0 0 7px}
      .r3-input,.r3-select{box-sizing:border-box;width:100%;height:44px;border:1px solid rgba(255,255,255,.14);border-radius:11px;background:#0d1012;color:#f4f1e9;padding:0 12px;font:800 14px Tahoma,Arial,sans-serif;outline:none}
      .r3-input:focus,.r3-select:focus{border-color:rgba(242,196,91,.65);box-shadow:0 0 0 2px rgba(242,196,91,.08)}
      .r3-input[readonly]{color:#c8cdd6;background:#101317}
      .r3-folder-row{display:grid;grid-template-columns:1fr 170px;gap:10px;direction:ltr}.r3-folder-row input{direction:ltr;text-align:left}
      .r3-button{height:44px;border-radius:11px;border:1px solid rgba(242,196,91,.35);background:rgba(242,196,91,.08);color:#f2c45b;font-weight:900;cursor:pointer;padding:0 15px}
      .r3-button.primary{background:linear-gradient(180deg,#f7cf69,#d9a83b);color:#17130a;border-color:#e2b54c;min-width:170px}
      .r3-settings-actions{display:flex;gap:12px;margin-top:22px;justify-content:flex-start;direction:ltr}
      .r3-switch-row{display:flex;align-items:center;gap:10px;min-height:44px;direction:rtl}.r3-switch-row input{width:18px;height:18px;accent-color:#e5b94d}
      .r3-subtitle{color:#969eaa;font-weight:700;margin:-7px 0 18px;line-height:1.7}
      .r3-port-status{font-size:12px;color:#8f98a5;margin-top:6px;font-weight:700}
      .r3-report-panel{margin-top:16px;display:flex;align-items:center;justify-content:space-between;gap:14px;direction:rtl;background:rgba(242,196,91,.045);border:1px solid rgba(242,196,91,.16);border-radius:14px;padding:14px 16px}
      .r3-report-path{min-width:0;color:#aeb5c0;font-size:12px;font-weight:700;direction:ltr;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
      .r3-toast{position:fixed;z-index:999999;left:50%;bottom:28px;transform:translateX(-50%);background:#171a1f;border:1px solid rgba(242,196,91,.4);color:#f4f1e9;border-radius:12px;padding:11px 18px;font-weight:800;box-shadow:0 10px 35px rgba(0,0,0,.4);opacity:0;transition:opacity .18s}
      .r3-toast.show{opacity:1}
      .backup-btn.saved-report{border-color:rgba(89,200,126,.45)!important;color:#8fe0a9!important}
      @media(max-width:1100px){.r3-settings-grid{grid-template-columns:1fr}.r3-field.full{grid-column:auto}.r3-folder-row{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function toast(message) {
    let el = $('#r3Toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'r3Toast';
      el.className = 'r3-toast';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('show'), 1800);
  }

  function readEntries() {
    try {
      const parsed = JSON.parse(localStorage.getItem(ENTRY_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function formatReportDate(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value ?? '');
    try {
      return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
      }).format(d);
    } catch {
      return d.toLocaleString('fa-IR');
    }
  }

  function reportPayload() {
    return {
      entries: readEntries()
        .filter(e => Number(e.weight) > 0 && Number(e.assay) > 0)
        .map(e => ({
          id: String(e.id ?? ''),
          weight: Number(e.weight),
          assay: Number(e.assay),
          description: String(e.description ?? ''),
          createdAt: formatReportDate(e.createdAt)
        }))
    };
  }

  async function saveReport(button = null) {
    try {
      if (button) button.disabled = true;
      const result = await bridge.saveReport(reportPayload());
      if (!result?.ok) throw new Error('ذخیره گزارش انجام نشد.');
      if (button) {
        const old = button.innerHTML;
        button.classList.add('saved-report');
        button.textContent = 'ذخیره شد ✓';
        setTimeout(() => {
          button.innerHTML = old;
          button.classList.remove('saved-report');
        }, 1200);
      }
      const path = result.path || '';
      document.querySelectorAll('[data-report-path]').forEach(el => {
        el.textContent = path;
        el.title = path;
      });
      toast('گزارش Excel ذخیره شد');
      return result;
    } catch (error) {
      toast(error?.message || 'خطا در ذخیره گزارش');
      return { ok: false, error: error?.message || String(error) };
    } finally {
      if (button) button.disabled = false;
    }
  }

  function installReportButton() {
    const btn = $('.backup-btn');
    if (!btn) return;
    btn.id = 'saveReportBtn';
    btn.title = 'ذخیره گزارش آبشده‌ها در Excel';
    btn.innerHTML = '<i class="fa-regular fa-file-lines"></i><span>ذخیره گزارش</span>';
    btn.addEventListener('click', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      saveReport(btn);
    }, true);
    reportUiInstalled = true;
  }

  function installManualScaleCapture() {
    const readButton = $('#readScale');
    readButton?.addEventListener('click', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      bridge.captureScale().catch(error => toast(error?.message || 'خطای خواندن ترازو'));
    }, true);

    document.addEventListener('keydown', event => {
      if (event.key !== 'ArrowUp') return;
      const enabled = $('#keyboardReadToggle')?.classList.contains('on') ?? true;
      if (!enabled) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      bridge.captureScale().catch(error => toast(error?.message || 'خطای خواندن ترازو'));
    }, true);

    manualScaleCaptureInstalled = true;
  }

  function installWindowDrag() {
    const bar = $('.titlebar');
    if (!bar) return;
    bar.style.cursor = 'default';
    bar.addEventListener('mousedown', event => {
      if (event.button !== 0) return;
      if (event.target.closest?.('.window-controls,button,input,select,a')) return;
      event.preventDefault();
      bridge.dragWindow().catch(() => {});
    }, true);
    bar.addEventListener('dblclick', event => {
      if (event.target.closest?.('.window-controls,button,input,select,a')) return;
      event.preventDefault();
      bridge.maximizeToggle().catch(() => {});
    }, true);
    titlebarDragInstalled = true;
  }

  function installCalculationRefresh() {
    const refresh = event => {
      if (!event.target?.closest?.('.calc-card')) return;
      window.__goldbarRecalculate?.();
    };
    document.addEventListener('input', refresh, true);
    document.addEventListener('change', refresh, true);
    calculationDelegationInstalled = true;
  }

  function syncRightPanel(settings) {
    const setValue = (id, value) => { const el = $(id); if (el && value != null) el.value = String(value); };
    setValue('#portSelect', settings.port);
    setValue('#baudSelect', settings.baudRate);
    setValue('#dataBitsSelect', settings.dataBits);
    setValue('#paritySelect', settings.parity);
    setValue('#stopBitsSelect', settings.stopBits);
    setValue('#flowSelect', settings.flowControl);
    setValue('#readInterval', settings.readIntervalMs);
    setValue('#decimals', settings.decimals);
    setValue('#requestCommand', settings.requestCommand || 'P');
    $('#autoReadToggle')?.classList.toggle('on', Boolean(settings.autoRead));
    $('#keyboardReadToggle')?.classList.toggle('on', Boolean(settings.keyboardRead));
  }

  function scaleFieldSemantics() {
    const firstLabel = $('.settings-form .setting-row label');
    if (firstLabel) firstLabel.textContent = 'ترازو (COM)';
  }

  function option(value, current, label = null) {
    const selected = String(value) === String(current) ? ' selected' : '';
    const safe = String(label ?? value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    return `<option value="${String(value).replace(/"/g, '&quot;')}"${selected}>${safe}</option>`;
  }

  async function renderSettingsPage() {
    const host = $('#pageHost');
    const panel = $('.settings');
    const body = $('.workspace-body');
    if (!host) return;
    if (panel) panel.style.display = 'none';
    body?.classList.add('full-center');

    host.innerHTML = '<section class="page-panel"><h2>تنظیمات</h2><div class="page-muted">در حال خواندن تنظیمات ترازو...</div></section>';

    let settings;
    let portInfo = { ports: [] };
    try { settings = await bridge.getSettings(); }
    catch { settings = {}; }
    try { portInfo = await bridge.listScalePorts(); }
    catch { portInfo = { ports: [] }; }

    const ports = Array.from(new Set([...(portInfo?.ports || []), settings.port || 'COM4']));
    const detectedText = (portInfo?.ports || []).length
      ? `پورت‌های شناسایی‌شده: ${(portInfo.ports || []).join('، ')}`
      : 'در حال حاضر پورت COM فعالی توسط ویندوز شناسایی نشده است.';

    host.innerHTML = `
      <section class="page-panel">
        <h2>تنظیمات ترازو و گزارش</h2>
        <div class="r3-subtitle">تنظیمات اتصال ترازو مطابق ساختار برنامه قبلی، همراه با محل ذخیره گزارش‌ها.</div>
        <div class="r3-settings-grid">
          <div class="r3-field">
            <label>ترازو (پورت COM)</label>
            <select class="r3-select" id="r3Port">${ports.map(p => option(p, settings.port)).join('')}</select>
            <div class="r3-port-status">${detectedText}</div>
          </div>
          <div class="r3-field"><label>Baud Rate</label><select class="r3-select" id="r3Baud">${[300,600,1200,2400,4800,9600,19200,38400,57600,115200].map(v => option(v, settings.baudRate)).join('')}</select></div>
          <div class="r3-field"><label>Data Bits</label><select class="r3-select" id="r3DataBits">${[5,6,7,8].map(v => option(v, settings.dataBits)).join('')}</select></div>
          <div class="r3-field"><label>Parity</label><select class="r3-select" id="r3Parity">${['None','Even','Odd','Mark','Space'].map(v => option(v, settings.parity)).join('')}</select></div>
          <div class="r3-field"><label>Stop Bits</label><select class="r3-select" id="r3StopBits">${[1,1.5,2].map(v => option(v, settings.stopBits)).join('')}</select></div>
          <div class="r3-field"><label>Flow Control</label><select class="r3-select" id="r3Flow">${['None','XOnXOff','RTS/CTS'].map(v => option(v, settings.flowControl)).join('')}</select></div>
          <div class="r3-field"><label>فاصله خواندن (ms)</label><input class="r3-input" id="r3Interval" inputmode="numeric" value="${Number(settings.readIntervalMs ?? 800)}"></div>
          <div class="r3-field"><label>تعداد ارقام اعشار</label><input class="r3-input" id="r3Decimals" inputmode="numeric" value="${Number(settings.decimals ?? 3)}"></div>
          <div class="r3-field"><label>فرمان درخواست وزن</label><input class="r3-input" id="r3Command" value="${String(settings.requestCommand || 'P')}" readonly></div>
          <div class="r3-field"><label>خواندن وزن</label><div class="r3-switch-row"><input type="checkbox" id="r3Auto" ${settings.autoRead ? 'checked' : ''}><span>خواندن خودکار ترازو در پس‌زمینه</span></div></div>
          <div class="r3-field full"><div class="r3-switch-row"><input type="checkbox" id="r3Keyboard" ${settings.keyboardRead !== false ? 'checked' : ''}><span>خواندن وزن با کلید جهت بالا ↑</span></div></div>
          <div class="r3-field full">
            <label>محل ذخیره گزارش‌ها</label>
            <div class="r3-folder-row"><input class="r3-input" id="r3ReportDirectory" value="${String(settings.reportDirectory || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;')}" readonly><button class="r3-button" id="r3ChooseFolder">انتخاب محل ذخیره</button></div>
          </div>
        </div>
        <div class="r3-settings-actions"><button class="r3-button primary" id="r3SaveSettings">ذخیره تنظیمات</button><button class="r3-button" id="r3TestScale">تست اتصال ترازو</button></div>
      </section>`;

    const interval = $('#r3Interval');
    const decimals = $('#r3Decimals');
    interval?.addEventListener('input', () => sanitizeInteger(interval, 100, 10000));
    decimals?.addEventListener('input', () => sanitizeInteger(decimals, 0, 6));

    $('#r3ChooseFolder')?.addEventListener('click', async () => {
      const result = await bridge.chooseReportDirectory();
      if (result?.ok && $('#r3ReportDirectory')) {
        $('#r3ReportDirectory').value = result.path || '';
        toast('محل ذخیره گزارش تغییر کرد');
      }
    });

    $('#r3SaveSettings')?.addEventListener('click', async event => {
      const next = {
        port: $('#r3Port')?.value || 'COM4',
        baudRate: Number($('#r3Baud')?.value || 2400),
        dataBits: Number($('#r3DataBits')?.value || 7),
        parity: $('#r3Parity')?.value || 'Even',
        stopBits: Number($('#r3StopBits')?.value || 2),
        flowControl: $('#r3Flow')?.value || 'None',
        autoRead: Boolean($('#r3Auto')?.checked),
        readIntervalMs: Math.max(100, Number($('#r3Interval')?.value || 800)),
        decimals: Math.max(0, Math.min(6, Number($('#r3Decimals')?.value || 3))),
        requestCommand: 'P',
        keyboardRead: Boolean($('#r3Keyboard')?.checked),
        reportDirectory: $('#r3ReportDirectory')?.value || settings.reportDirectory || ''
      };
      try {
        const saved = await bridge.saveSettings(next);
        settings = saved;
        syncRightPanel(saved);
        event.currentTarget.textContent = 'ذخیره شد ✓';
        setTimeout(() => { event.currentTarget.textContent = 'ذخیره تنظیمات'; }, 1000);
        toast('تنظیمات ذخیره شد');
      } catch (error) {
        toast(error?.message || 'خطا در ذخیره تنظیمات');
      }
    });

    $('#r3TestScale')?.addEventListener('click', async event => {
      try {
        const next = {
          port: $('#r3Port')?.value || 'COM4', baudRate: Number($('#r3Baud')?.value || 2400),
          dataBits: Number($('#r3DataBits')?.value || 7), parity: $('#r3Parity')?.value || 'Even',
          stopBits: Number($('#r3StopBits')?.value || 2), flowControl: $('#r3Flow')?.value || 'None',
          autoRead: Boolean($('#r3Auto')?.checked), readIntervalMs: Number($('#r3Interval')?.value || 800),
          decimals: Number($('#r3Decimals')?.value || 3), requestCommand: 'P', keyboardRead: Boolean($('#r3Keyboard')?.checked),
          reportDirectory: $('#r3ReportDirectory')?.value || settings.reportDirectory || ''
        };
        settings = await bridge.saveSettings(next);
        const result = await bridge.connectScale();
        event.currentTarget.textContent = result?.ok ? 'اتصال برقرار شد ✓' : 'اتصال ناموفق';
        toast(result?.ok ? 'ترازو متصل شد' : 'اتصال ترازو برقرار نشد');
        setTimeout(() => { event.currentTarget.textContent = 'تست اتصال ترازو'; }, 1300);
      } catch (error) {
        toast(error?.message || 'خطای اتصال ترازو');
      }
    });
  }

  async function augmentReportsPage() {
    const host = $('#pageHost');
    if (!host?.classList.contains('active')) return;
    if ($('#r3ReportPanel')) return;
    let settings = {};
    try { settings = await bridge.getSettings(); } catch {}
    const section = host.querySelector('.page-panel');
    if (!section) return;
    const panel = document.createElement('div');
    panel.id = 'r3ReportPanel';
    panel.className = 'r3-report-panel';
    panel.innerHTML = `<button class="r3-button primary" id="r3SaveReportPage">ذخیره گزارش Excel</button><div class="r3-report-path" data-report-path title="${String(settings.reportDirectory || '').replace(/"/g,'&quot;')}">${String(settings.reportDirectory || '')}</div>`;
    section.appendChild(panel);
    $('#r3SaveReportPage')?.addEventListener('click', event => saveReport(event.currentTarget));
  }

  function installPageAugmentation() {
    const settingsNav = $$('.nav-item').find(btn => (btn.textContent || '').includes('تنظیمات'));
    settingsNav?.addEventListener('click', () => setTimeout(renderSettingsPage, 0));

    const reportsNav = $$('.nav-item').find(btn => (btn.textContent || '').includes('گزارش‌ها'));
    reportsNav?.addEventListener('click', () => setTimeout(augmentReportsPage, 0));
  }

  function updateVersion() {
    const version = $('.version');
    if (version) version.textContent = 'GOLD BAR v2.0.0-r3';
  }

  installStyles();
  installReportButton();
  installManualScaleCapture();
  installWindowDrag();
  installCalculationRefresh();
  installPageAugmentation();
  scaleFieldSemantics();
  updateVersion();

  window.__goldbarR3Probe = () => {
    const topReportLabel = $('#saveReportBtn')?.textContent?.includes('ذخیره گزارش') ?? false;
    const bridgeOk = ['captureScale','dragWindow','saveReport','chooseReportDirectory','listScalePorts']
      .every(name => typeof bridge[name] === 'function');
    const scaleLabelOk = $('.settings-form .setting-row label')?.textContent?.includes('ترازو') ?? false;
    const ok = topReportLabel && bridgeOk && scaleLabelOk && calculationDelegationInstalled
      && titlebarDragInstalled && reportUiInstalled && manualScaleCaptureInstalled;
    return { ok, topReportLabel, bridgeOk, scaleLabelOk, calculationDelegationInstalled,
      titlebarDragInstalled, reportUiInstalled, manualScaleCaptureInstalled };
  };
})();
