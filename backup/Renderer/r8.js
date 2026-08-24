(() => {
  'use strict';

  const ENTRY_KEY = 'goldbar.windows.entries.v2';
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  let observer = null;
  let updating = false;
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

  function readEntries() {
    try {
      const list = JSON.parse(localStorage.getItem(ENTRY_KEY) || '[]');
      return Array.isArray(list)
        ? list.filter(x => Number(x?.weight) > 0 && Number(x?.assay) > 0 && Number(x?.assay) <= 1000)
        : [];
    } catch { return []; }
  }

  function dashboardAlloy() {
    const engine = window.__goldbarAssayEngineV2;
    const card = $$('.calc-card')[1];
    if (!engine || !card) return null;
    const inputs = [...card.querySelectorAll('input')];
    const target = numberValue(inputs[0]?.value);
    const silverPercent = numberValue(inputs[1]?.value);
    const summary = engine.summarize(readEntries());
    const alloy = engine.alloyForTarget(summary, target, silverPercent, summary.weight);
    return { summary, alloy, card };
  }

  function updateDashboard() {
    if (updating) return;
    const data = dashboardAlloy();
    if (!data) return;
    updating = true;
    try {
      const { summary, alloy, card } = data;
      const mini = [...card.querySelectorAll('.mini-stats > div')];
      if (mini[0]) {
        const label = mini[0].querySelector('span');
        const value = mini[0].querySelector('b');
        if (label) label.textContent = 'نقره مورد نیاز (g)';
        if (value) {
          const shownSilver = Number.isFinite(alloy.silverRequired) && alloy.totalAlloyRequired > 0
            ? alloy.silverRequired
            : 0;
          value.textContent = formatNumber(shownSilver, 3);
        }
      }

      const topCards = $$('.summary-card');
      const top = topCards[3];
      if (top) {
        const label = top.querySelector('.metric-label');
        const value = top.querySelector('.metric-value');
        if (label) label.textContent = 'کل وزن عیارشده (g)';
        if (value) {
          const adjustedWeight = Number.isFinite(alloy.totalAfterAlloy) && alloy.totalAlloyRequired > 0
            ? alloy.totalAfterAlloy
            : (summary.weight > 0 ? summary.weight : 0);
          value.textContent = formatNumber(adjustedWeight, 3);
        }
      }
    } finally {
      updating = false;
    }
  }

  function bindInputs() {
    const card = $$('.calc-card')[1];
    if (!card || card.dataset.r8Bound === '1') return;
    card.dataset.r8Bound = '1';
    card.querySelectorAll('input').forEach(input => {
      input.addEventListener('input', () => setTimeout(updateDashboard, 0));
      input.addEventListener('change', () => setTimeout(updateDashboard, 0));
    });
    $('#quickSave')?.addEventListener('click', () => setTimeout(updateDashboard, 0));
    $('#quickClearAll')?.addEventListener('click', () => setTimeout(updateDashboard, 0));
    $('#purityInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') setTimeout(updateDashboard, 0); });
  }

  function observeSummary() {
    if (observer) return;
    const values = $$('.summary-card .metric-value').slice(0, 3);
    if (!values.length) return;
    observer = new MutationObserver(() => setTimeout(updateDashboard, 0));
    values.forEach(el => observer.observe(el, { childList: true, characterData: true, subtree: true }));
  }

  function updateVersion() {
    const version = $('.version');
    if (version) version.textContent = 'GOLD BAR v2.0.0-r10';
  }

  function installProbe(attempt = 0) {
    if (probeWrapped) return;
    const previous = window.__goldbarR3Probe;
    if (typeof previous !== 'function') {
      if (attempt < 40) setTimeout(() => installProbe(attempt + 1), 100);
      return;
    }
    const wrapper = () => {
      const base = previous();
      const card = $$('.calc-card')[1];
      const top = $$('.summary-card')[3];
      const silverLabel = card?.querySelector('.mini-stats > div:first-child span')?.textContent?.trim();
      const topLabel = top?.querySelector('.metric-label')?.textContent?.trim();
      const r8 = {
        silverResultLabel: silverLabel === 'نقره مورد نیاز (g)',
        adjustedWeightLabel: topLabel === 'کل وزن عیارشده (g)',
        bound: card?.dataset.r8Bound === '1'
      };
      r8.ok = Object.values(r8).every(Boolean);
      return { ...base, r8, ok: Boolean(base?.ok && r8.ok) };
    };
    wrapper.__r8Wrapped = true;
    window.__goldbarR3Probe = wrapper;
    probeWrapped = true;
  }

  function init(attempt = 0) {
    const ready = Boolean(window.__goldbarAssayEngineV2 && $$('.calc-card')[1] && $$('.summary-card')[3]);
    if (!ready) {
      if (attempt < 60) setTimeout(() => init(attempt + 1), 100);
      return;
    }
    bindInputs();
    observeSummary();
    updateDashboard();
    updateVersion();
    setTimeout(() => installProbe(), 1400);
  }

  init();
})();
