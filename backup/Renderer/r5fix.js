(() => {
  'use strict';
  const ENTRY_KEY = 'goldbar.windows.entries.v2';
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  let wrapped = false;

  function install(attempt = 0) {
    if (wrapped) return;
    if (typeof window.__goldbarR3Probe !== 'function' || !$('#r5SilverBreakdown')) {
      if (attempt < 50) setTimeout(() => install(attempt + 1), 100);
      return;
    }

    const previous = window.__goldbarR3Probe;
    window.__goldbarR3Probe = () => {
      const result = previous();
      const card = $$('.calc-card')[1];
      const silverInput = card?.querySelectorAll('input')?.[1];
      let silverVisibleRefresh = false;

      if (silverInput) {
        const oldEntries = localStorage.getItem(ENTRY_KEY);
        const oldValue = silverInput.value;
        try {
          localStorage.setItem(ENTRY_KEY, JSON.stringify([
            { id: 'r5-probe', weight: 100, assay: 750, description: '', createdAt: new Date().toISOString() }
          ]));
          silverInput.value = '45';
          silverInput.dispatchEvent(new Event('input', { bubbles: true }));
          const first = $('#r5SilverRequired')?.textContent || '';
          silverInput.value = '30';
          silverInput.dispatchEvent(new Event('input', { bubbles: true }));
          const second = $('#r5SilverRequired')?.textContent || '';
          silverVisibleRefresh = first !== second && first !== '0' && second !== '0';
        } finally {
          if (oldEntries == null) localStorage.removeItem(ENTRY_KEY);
          else localStorage.setItem(ENTRY_KEY, oldEntries);
          silverInput.value = oldValue;
          silverInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }

      const r5 = { ...(result.r5 || {}), silverVisibleRefresh };
      r5.ok = Boolean(r5.scaleNameField && r5.sidebarScaleTest && r5.rightScaleTestHook &&
        r5.silverBreakdown && r5.silverVisibleRefresh && r5.topAssayLabel);
      const upstreamOk = Boolean(result.bridgeOk && result.calculationDelegationInstalled &&
        result.manualScaleCaptureInstalled && result.reportUiInstalled && result.scaleLabelOk &&
        result.titlebarDragInstalled && result.topReportLabel && result.r4?.ok);
      return { ...result, r5, ok: upstreamOk && r5.ok };
    };
    wrapped = true;
  }

  install();

  if (!document.querySelector('script[data-goldbar-r5final]')) {
    const finalScript = document.createElement('script');
    finalScript.src = 'r5final.js';
    finalScript.dataset.goldbarR5final = '1';
    document.body.appendChild(finalScript);
  }
})();
