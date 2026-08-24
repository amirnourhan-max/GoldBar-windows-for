(() => {
  'use strict';
  function install(attempt = 0) {
    if (typeof window.__goldbarR3Probe !== 'function') {
      if (attempt < 30) setTimeout(() => install(attempt + 1), 100);
      return;
    }
    const previous = window.__goldbarR3Probe;
    if (previous.__r5Final) return;
    const finalProbe = () => {
      const r = previous();
      const componentsOk = Boolean(
        r.bridgeOk && r.calculationDelegationInstalled && r.manualScaleCaptureInstalled &&
        r.reportUiInstalled && r.scaleLabelOk && r.titlebarDragInstalled && r.topReportLabel &&
        r.r4?.ok && r.r5?.ok
      );
      return { ...r, ok: componentsOk };
    };
    finalProbe.__r5Final = true;
    window.__goldbarR3Probe = finalProbe;
  }
  // Allow r3/r4/r5 wrappers to finish first, then become the outermost probe.
  setTimeout(() => install(), 500);
})();
