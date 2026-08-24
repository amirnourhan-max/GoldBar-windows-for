(() => {
  'use strict';

  let weightCaptureRequested = false;

  function finalizeNumericSettingsInputs() {
    for (const id of ['readInterval', 'decimals']) {
      const input = document.getElementById(id);
      if (!input) continue;
      input.type = 'text';
      input.inputMode = 'numeric';
      input.autocomplete = 'off';
    }
  }

  function loadQuoteV2() {
    if (document.querySelector('script[data-goldbar-r12-quote-v2]')) return;
    const script = document.createElement('script');
    script.src = 'r12-quote-v2.js';
    script.dataset.goldbarR12QuoteV2 = '1';
    document.body.appendChild(script);
  }

  function loadR12() {
    if (document.querySelector('script[data-goldbar-r12]')) {
      setTimeout(loadQuoteV2, 0);
      return;
    }
    const script = document.createElement('script');
    script.src = 'r12.js';
    script.dataset.goldbarR12 = '1';
    script.onload = () => setTimeout(loadQuoteV2, 0);
    document.body.appendChild(script);
  }

  function loadR3() {
    if (document.querySelector('script[data-goldbar-r3]')) {
      setTimeout(loadR12, 0);
      return;
    }
    const script = document.createElement('script');
    script.src = 'r3.js';
    script.dataset.goldbarR3 = '1';
    script.onload = () => setTimeout(loadR12, 0);
    document.body.appendChild(script);
  }

  function loadEnhancements() {
    if (document.querySelector('script[data-goldbar-enhancements]')) {
      setTimeout(loadR3, 0);
      return;
    }
    const script = document.createElement('script');
    script.src = 'enhancements.js';
    script.dataset.goldbarEnhancements = '1';
    script.onload = () => {
      finalizeNumericSettingsInputs();
      loadR3();
    };
    document.body.appendChild(script);
  }

  function afterDomReady() {
    loadEnhancements();
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', afterDomReady, { once: true });
  } else {
    setTimeout(afterDomReady, 0);
  }

  if (!window.chrome?.webview) return;

  let seq = 0;
  const pending = new Map();
  const listeners = new Map();

  function request(action, payload = null) {
    const id = `r${++seq}`;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      window.chrome.webview.postMessage({ kind: 'request', id, action, payload });
      setTimeout(() => {
        const p = pending.get(id);
        if (!p) return;
        pending.delete(id);
        reject(new Error(`Timeout: ${action}`));
      }, 10000);
    });
  }

  function on(event, callback) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(callback);
  }

  function dispatchHostEvent(name, data) {
    const quickWeight = document.querySelector('#weightInput');
    const previousQuickWeight = quickWeight?.value ?? '';
    const capture = name === 'scale:weight' && weightCaptureRequested;

    listeners.get(name)?.forEach(cb => {
      try { cb(data); } catch (e) { console.error(e); }
    });

    if (name === 'scale:weight') {
      if (!capture && quickWeight) quickWeight.value = previousQuickWeight;
      weightCaptureRequested = false;
      if (capture) {
        quickWeight?.focus();
        quickWeight?.select?.();
      }
    }
  }

  window.chrome.webview.addEventListener('message', event => {
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.kind === 'response') {
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      msg.ok === false ? p.reject(new Error(msg.error || 'Host error')) : p.resolve(msg.data);
      return;
    }
    if (msg.kind === 'event') dispatchHostEvent(msg.event, msg.data);
  });

  async function captureScale() {
    weightCaptureRequested = true;
    try {
      const result = await request('scale:read');
      if (result?.ok === false) weightCaptureRequested = false;
      return result;
    } catch (error) {
      weightCaptureRequested = false;
      throw error;
    }
  }

  window.goldbar = {
    minimize: () => request('window:minimize'),
    maximizeToggle: () => request('window:maximizeToggle'),
    dragWindow: () => request('window:drag'),
    close: () => request('window:close'),
    getSettings: () => request('settings:get'),
    saveSettings: settings => request('settings:save', settings),
    resetSettings: () => request('settings:reset'),
    listScalePorts: () => request('scale:listPorts'),
    connectScale: () => request('scale:connect'),
    disconnectScale: () => request('scale:disconnect'),
    readScale: () => request('scale:read'),
    captureScale,
    chooseReportDirectory: () => request('report:chooseDirectory'),
    saveReport: report => request('report:save', report),
    onWeight: cb => on('scale:weight', cb),
    onScaleStatus: cb => on('scale:status', cb),
    onScaleError: cb => on('scale:error', cb)
  };

  window.__goldbarBridgeArmCapture = () => { weightCaptureRequested = true; };
  window.__goldbarBridgeTestWeight = value => dispatchHostEvent('scale:weight', {
    value: Number(value), raw: 'SELF-TEST', decimals: 3
  });
})();