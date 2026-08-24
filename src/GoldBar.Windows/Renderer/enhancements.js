(() => {
  'use strict';

  const ENTRY_KEY = 'goldbar.windows.entries.v2';
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  let recalculating = false;

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

  function formatNumber(value, digits = 3) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0';
    return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: digits });
  }

  function readEntries() {
    try {
      const parsed = JSON.parse(localStorage.getItem(ENTRY_KEY) || '[]');
      return Array.isArray(parsed)
        ? parsed.filter(e => Number(e.weight) > 0 && Number(e.assay) > 0)
        : [];
    } catch {
      return [];
    }
  }

  // Canonical workbook formula: weighted average = SUM(weight*assay) / SUM(weight).
  function summarize(list = readEntries()) {
    let weight = 0;
    let weightedSum = 0;
    let count = 0;
    for (const e of list) {
      const w = Number(e.weight);
      const a = Number(e.assay);
      if (!(w > 0) || !(a > 0)) continue;
      count++;
      weight += w;
      weightedSum += w * a;
    }
    return { count, weight, weightedSum, averageAssay: weight > 0 ? weightedSum / weight : NaN };
  }

  // Excel ROUNDDOWN(number,digits): truncate toward zero, including negatives.
  function roundDownTowardZero(value, digits) {
    if (!Number.isFinite(value)) return NaN;
    const factor = 10 ** digits;
    const scaled = value * factor;
    const truncated = scaled >= 0 ? Math.floor(scaled) : Math.ceil(scaled);
    return truncated / factor;
  }

  // Workbook Table1:
  // difference = castingAssay - averageAssay
  // denominator = barAssay - castingAssay
  // requiredBar = ROUNDDOWN(weight*difference/denominator,1)
  function requiredHighAssayBar(summary, castingAssay, barAssay) {
    if (!(summary.weight > 0) || !Number.isFinite(summary.averageAssay)) {
      return { assayDifference: NaN, denominator: NaN, requiredBar: NaN };
    }
    const assayDifference = castingAssay - summary.averageAssay;
    const denominator = barAssay - castingAssay;
    const requiredBar = denominator === 0
      ? NaN
      : roundDownTowardZero(summary.weight * assayDifference / denominator, 1);
    return { assayDifference, denominator, requiredBar };
  }

  // Workbook Table14:
  // total alloy = weight*averageAssay/castingAssay - weight
  // silver = silverPercent/100 * total alloy
  // non-silver = total alloy - silver
  // 0.4% item = GLOBAL total weight * 0.004
  // final other = total alloy - silver - 0.4% item
  // total after alloy = weight + total alloy
  function requiredAlloy(summary, castingAssay, silverPercent, globalWeight = summary.weight) {
    if (!(summary.weight > 0) || !Number.isFinite(summary.averageAssay) || castingAssay === 0) {
      return {
        totalAlloyRequired: NaN, silverRequired: NaN, nonSilverRequired: NaN,
        fourPerThousand: NaN, finalOtherAlloy: NaN, totalAfterAlloy: NaN
      };
    }
    const totalAlloyRequired = summary.weight * summary.averageAssay / castingAssay - summary.weight;
    const silverRequired = (silverPercent / 100) * totalAlloyRequired;
    const nonSilverRequired = totalAlloyRequired - silverRequired;
    const fourPerThousand = globalWeight * 0.004;
    const finalOtherAlloy = totalAlloyRequired - silverRequired - fourPerThousand;
    const totalAfterAlloy = summary.weight + totalAlloyRequired;
    return { totalAlloyRequired, silverRequired, nonSilverRequired, fourPerThousand, finalOtherAlloy, totalAfterAlloy };
  }

  // Workbook quick tool: 36.79% / 63.21% split.
  function split3679(base) {
    return Number.isFinite(base) ? base * 0.3679 : NaN;
  }

  // Workbook W10 correction tool:
  // addition = baseWeight*targetAssay/(targetAssay-assayDrop) - baseWeight
  function correctionAddition(baseWeight, targetAssay, assayDrop) {
    const denominator = targetAssay - assayDrop;
    if (!Number.isFinite(baseWeight) || !Number.isFinite(targetAssay) || !Number.isFinite(assayDrop) || denominator === 0) return NaN;
    return baseWeight * targetAssay / denominator - baseWeight;
  }

  function setText(el, value) {
    if (el && el.textContent !== value) el.textContent = value;
  }

  function fixCalculationSemantics() {
    const cards = $$('.calc-card');
    if (cards[0]) {
      const labels = cards[0].querySelectorAll('.two-col label');
      if (labels[0]) labels[0].textContent = 'عیار هدف';
      if (labels[1]) labels[1].textContent = 'عیار شمش';
      const p = cards[0].querySelector('p');
      if (p) p.textContent = 'محاسبه شمش عیار بالا برای رساندن آبشده‌ها به عیار هدف';
    }
    if (cards[1]) {
      const labels = cards[1].querySelectorAll('.two-col label');
      if (labels[0]) labels[0].textContent = 'عیار هدف';
      if (labels[1]) labels[1].textContent = 'درصد نقره';
      const inputs = cards[1].querySelectorAll('input');
      if (inputs[0] && inputs[0].value === '746') inputs[0].value = '747';
      if (inputs[1] && inputs[1].value === '10') inputs[1].value = '45';
      const p = cards[1].querySelector('p');
      if (p) p.textContent = 'محاسبه بار لازم برای رسیدن آبشده‌ها به عیار هدف';
      const firstMiniLabel = cards[1].querySelector('.mini-stats > div:first-child span');
      if (firstMiniLabel) firstMiniLabel.textContent = 'نقره مورد نیاز (g)';
      const wideLabel = cards[1].querySelector('.wide-stat span');
      if (wideLabel) wideLabel.textContent = 'کل بار مورد نیاز (g)';
    }
  }

  function recalculateCards() {
    if (recalculating) return;
    recalculating = true;
    try {
      const summary = summarize();
      const cards = $$('.calc-card');

      if (cards[0]) {
        const inputs = [...cards[0].querySelectorAll('input')];
        const stats = [...cards[0].querySelectorAll('.mini-stats b')];
        const target = parseNumber(inputs[0]?.value);
        const barAssay = parseNumber(inputs[1]?.value);
        const result = requiredHighAssayBar(summary, target, barAssay);
        setText(stats[0], Number.isFinite(result.assayDifference) ? formatNumber(result.assayDifference, 3) : '0');
        setText(stats[1], Number.isFinite(result.requiredBar) ? formatNumber(result.requiredBar, 1) : '0');
        const footer = cards[0].querySelector('.calc-footer');
        if (footer) {
          const message = !Number.isFinite(result.requiredBar) || result.requiredBar <= 0
            ? 'افزایش عیار لازم نیست'
            : `شمش مورد نیاز: ${formatNumber(result.requiredBar, 1)} g`;
          setText(footer, message);
        }
      }

      let totalAlloy = NaN;
      if (cards[1]) {
        const inputs = [...cards[1].querySelectorAll('input')];
        const stats = [...cards[1].querySelectorAll('.mini-stats b')];
        const required = cards[1].querySelector('.wide-stat b');
        const castingAssay = parseNumber(inputs[0]?.value);
        const silverPercent = parseNumber(inputs[1]?.value);
        const result = requiredAlloy(summary, castingAssay, silverPercent, summary.weight);

        // IMPORTANT: this first dashboard value is the workbook AB6 result, not
        // contained/pure gold. Previous builds accidentally wrote pure gold here after
        // the label had already been changed to «نقره مورد نیاز».
        const shownSilver = Number.isFinite(result.silverRequired) && result.totalAlloyRequired > 0
          ? result.silverRequired
          : 0;
        setText(stats[0], formatNumber(shownSilver, 3));
        setText(stats[1], formatNumber(summary.weight || 0, 3));
        totalAlloy = result.totalAlloyRequired;
        setText(required, Number.isFinite(totalAlloy) ? formatNumber(totalAlloy, 3) : '0');
        cards[1].dataset.silverRequired = Number.isFinite(result.silverRequired) ? String(result.silverRequired) : '';
        cards[1].dataset.nonSilverRequired = Number.isFinite(result.nonSilverRequired) ? String(result.nonSilverRequired) : '';
        cards[1].dataset.fourPerThousand = Number.isFinite(result.fourPerThousand) ? String(result.fourPerThousand) : '';
        cards[1].dataset.finalOtherAlloy = Number.isFinite(result.finalOtherAlloy) ? String(result.finalOtherAlloy) : '';
      }

      const summaryCards = $$('.summary-card .metric-value');
      if (summaryCards[3]) {
        // A negative result means no alloy addition is required; the dashboard requirement is therefore zero.
        const shown = Number.isFinite(totalAlloy) ? Math.max(0, totalAlloy) : 0;
        setText(summaryCards[3], formatNumber(shown, 3));
      }
    } finally {
      recalculating = false;
    }
  }

  function sanitizeInteger(el, min, max) {
    let value = normalizeDigits(el.value).replace(/\D/g, '');
    if (value !== '') {
      let n = Number(value);
      if (Number.isFinite(min)) n = Math.max(min, n);
      if (Number.isFinite(max)) n = Math.min(max, n);
      value = String(n);
    }
    el.value = value;
  }

  function bindStrictSettingsNumbers() {
    const interval = $('#readInterval');
    const decimals = $('#decimals');
    if (interval) {
      interval.classList.add('numeric-input', 'integer-input');
      interval.addEventListener('input', () => sanitizeInteger(interval, 100, 10000));
      interval.addEventListener('paste', () => setTimeout(() => sanitizeInteger(interval, 100, 10000), 0));
      interval.addEventListener('drop', e => e.preventDefault());
    }
    if (decimals) {
      decimals.classList.add('numeric-input', 'integer-input');
      decimals.addEventListener('input', () => sanitizeInteger(decimals, 0, 6));
      decimals.addEventListener('paste', () => setTimeout(() => sanitizeInteger(decimals, 0, 6), 0));
      decimals.addEventListener('drop', e => e.preventDefault());
    }
  }

  function bindCalculationInputs() {
    $$('.calc-card input').forEach(input => {
      input.addEventListener('input', () => setTimeout(recalculateCards, 0));
      input.addEventListener('change', recalculateCards);
    });
    $('#quickSave')?.addEventListener('click', () => setTimeout(recalculateCards, 0));
    $('#quickClearAll')?.addEventListener('click', () => setTimeout(recalculateCards, 0));
    $('#purityInput')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') setTimeout(recalculateCards, 0);
    });
    $('#descriptionInput')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') setTimeout(recalculateCards, 0);
    });

    const summary = $('.summary-grid');
    if (summary) {
      const observer = new MutationObserver(() => setTimeout(recalculateCards, 0));
      observer.observe(summary, { subtree: true, childList: true, characterData: true });
    }
  }

  function installQuickTools() {
    const style = document.createElement('style');
    style.textContent = `
      .canonical-tools{display:grid;grid-template-columns:1fr 1fr;gap:18px;direction:rtl}
      .canonical-tool{background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:18px}
      .canonical-tool h3{margin:0 0 14px;color:#f4f1e9;font-weight:800}
      .canonical-tool label{display:block;color:#aeb4c0;font-weight:700;margin:10px 0 6px}
      .canonical-tool input{width:100%;box-sizing:border-box;border:1px solid #3a3e40;background:#0d1012;color:#f4f1e9;border-radius:10px;padding:10px 12px;font:700 15px Tahoma,Arial,sans-serif;direction:ltr}
      .canonical-results{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}
      .canonical-result{background:rgba(255,255,255,.035);border-radius:12px;padding:12px;text-align:center}
      .canonical-result span{display:block;color:#9ca3af;font-size:12px;margin-bottom:5px}.canonical-result b{color:#f2c45b;font-size:18px}
    `;
    document.head.appendChild(style);

    const nav = $$('.nav-item').find(btn => (btn.textContent || '').includes('محاسبه سریع'));
    if (!nav) return;
    nav.addEventListener('click', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const summaryGrid = $('.summary-grid');
      const quick = $('.quick-card');
      const bottom = $('.bottom-grid');
      const recent = $('.recent-card');
      const settingsPanel = $('.settings');
      const body = $('.workspace-body');
      let host = $('#pageHost');
      if (!host) {
        host = document.createElement('section');
        host.id = 'pageHost';
        host.className = 'page-host';
        $('.center')?.appendChild(host);
      }
      [summaryGrid, quick, bottom].forEach(el => { if (el) el.style.display = 'none'; });
      if (recent) recent.style.display = '';
      if (settingsPanel) settingsPanel.style.display = 'none';
      body?.classList.add('full-center');
      host.classList.add('active');
      $$('.nav-item').forEach(btn => btn.classList.toggle('active', btn === nav));
      const titleEl = $('.dash-title span:last-child');
      const subEl = $('.workspace-header .subtitle');
      if (titleEl) titleEl.textContent = 'محاسبه سریع';
      if (subEl) subEl.textContent = 'ابزارهای محاسباتی مرجع اکسل';
      host.innerHTML = `
        <section class="page-panel"><h2>محاسبه سریع</h2>
          <div class="canonical-tools">
            <div class="canonical-tool">
              <h3>تقسیم ۳۶.۷۹٪ / ۶۳.۲۱٪</h3>
              <label>عدد پایه</label><input id="splitBaseWin" inputmode="decimal" value="800">
              <div class="canonical-results"><div class="canonical-result"><span>۳۶.۷۹٪</span><b id="split3679Win">0</b></div><div class="canonical-result"><span>۶۳.۲۱٪</span><b id="split6321Win">0</b></div></div>
            </div>
            <div class="canonical-tool">
              <h3>اصلاح وزن برای افت عیار</h3>
              <label>وزن پایه</label><input id="corrWeightWin" inputmode="decimal" value="250">
              <label>عیار هدف</label><input id="corrTargetWin" inputmode="numeric" value="750">
              <label>افت عیار</label><input id="corrDropWin" inputmode="decimal" value="1">
              <div class="canonical-results"><div class="canonical-result"><span>بار افزوده (g)</span><b id="corrAddWin">0</b></div><div class="canonical-result"><span>جمع وزن (g)</span><b id="corrTotalWin">0</b></div></div>
            </div>
          </div>
        </section>`;
      const inputs = [...host.querySelectorAll('input')];
      const clean = input => {
        let v = normalizeDigits(input.value).replace(/[^0-9.]/g, '');
        const dot = v.indexOf('.');
        if (dot >= 0) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '');
        input.value = v;
      };
      const recalcTools = () => {
        inputs.forEach(clean);
        const base = parseNumber($('#splitBaseWin')?.value);
        const part = split3679(base);
        setText($('#split3679Win'), Number.isFinite(part) ? formatNumber(part, 3) : '0');
        setText($('#split6321Win'), Number.isFinite(part) && Number.isFinite(base) ? formatNumber(base - part, 3) : '0');
        const w = parseNumber($('#corrWeightWin')?.value);
        const target = parseNumber($('#corrTargetWin')?.value);
        const drop = parseNumber($('#corrDropWin')?.value);
        const add = correctionAddition(w, target, drop);
        setText($('#corrAddWin'), Number.isFinite(add) ? formatNumber(add, 3) : '0');
        setText($('#corrTotalWin'), Number.isFinite(add) && Number.isFinite(w) ? formatNumber(w + add, 3) : '0');
      };
      inputs.forEach(input => input.addEventListener('input', recalcTools));
      recalcTools();
    }, true);
  }

  function updateReleaseLabel() {
    const version = $('.version');
    if (version) version.textContent = 'GOLD BAR v2.0.0-r2';
  }

  function layoutProbe() {
    const cssScale = Number(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale'));
    const expectedScale = Math.max(0.35, Math.min(window.innerWidth / 1536, window.innerHeight / 1024));
    const root = document.querySelector('.design-root');
    const rect = root?.getBoundingClientRect();
    const epsilon = 3;
    const fits = Boolean(rect && rect.width <= window.innerWidth + epsilon && rect.height <= window.innerHeight + epsilon);
    return {
      ok: Number.isFinite(cssScale) && Math.abs(cssScale - expectedScale) < 0.002 && fits,
      width: window.innerWidth,
      height: window.innerHeight,
      cssScale,
      expectedScale,
      rootWidth: rect?.width ?? 0,
      rootHeight: rect?.height ?? 0,
      fits
    };
  }

  // Exact regression sample from the workbook port + boundary cases.
  function calculationProbe() {
    const sample = [
      { weight: 84.38, assay: 749 }, { weight: 86.69, assay: 750 },
      { weight: 14, assay: 749 }, { weight: 23.48, assay: 778 },
      { weight: 36.26, assay: 977 }, { weight: 66.07, assay: 749 },
      { weight: 42.23, assay: 757 }
    ];
    const s = summarize(sample);
    const a = requiredHighAssayBar(s, 747, 995);
    const x = requiredAlloy(s, 747, 45, s.weight);
    const split = split3679(800);
    const correction = correctionAddition(250, 750, 1);
    const near = (v, e, eps = 1e-8) => Number.isFinite(v) && Math.abs(v - e) <= eps;
    const checks = {
      totalWeight: near(s.weight, 353.11),
      weightedAverage: near(s.averageAssay, 775.5433717538444),
      required995Bar: near(a.requiredBar, -40.6),
      totalAlloy: near(x.totalAlloyRequired, 13.492570281124529),
      silver: near(x.silverRequired, 6.071656626506038),
      nonSilver: near(x.nonSilverRequired, 7.420913654618491),
      fourPerThousand: near(x.fourPerThousand, 1.41244),
      finalOther: near(x.finalOtherAlloy, 6.0084736546184905),
      totalAfterAlloy: near(x.totalAfterAlloy, 366.6025702811245),
      split3679: near(split, 294.32),
      split6321: near(800 - split, 505.68),
      correctionAdd: near(correction, 0.33377837116154296),
      correctionTotal: near(250 + correction, 250.33377837116154),
      zeroDenominatorBar: Number.isNaN(requiredHighAssayBar(s, 747, 747).requiredBar),
      zeroDenominatorCorrection: Number.isNaN(correctionAddition(250, 750, 750))
    };
    return { ok: Object.values(checks).every(Boolean), checks, summary: s, adjustment: a, alloy: x, split, correction };
  }

  fixCalculationSemantics();
  bindStrictSettingsNumbers();
  bindCalculationInputs();
  installQuickTools();
  updateReleaseLabel();
  recalculateCards();

  window.__goldbarLayoutProbe = layoutProbe;
  window.__goldbarCalculationProbe = calculationProbe;
  window.__goldbarRecalculate = recalculateCards;
  window.__goldbarFormulaEngine = {
    summarize, roundDownTowardZero, requiredHighAssayBar, requiredAlloy, split3679, correctionAddition
  };
})();
