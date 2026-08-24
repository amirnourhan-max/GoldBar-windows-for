(() => {
  const common = 'viewBox="0 0 24 24" aria-hidden="true" focusable="false"';
  const stroke = body => `<svg ${common} fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  const fill = body => `<svg ${common} fill="currentColor">${body}</svg>`;
  const paths = {
    'table-cells-large': stroke('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'),
    'clipboard': stroke('<rect x="6" y="5" width="12" height="16" rx="2"/><path d="M9 5V3h6v2M9 9h6M9 13h6M9 17h4"/>'),
    'layer-group': stroke('<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>'),
    'calculator': stroke('<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M7 6h10v4H7zM8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>'),
    'stopwatch': stroke('<circle cx="12" cy="13" r="8"/><path d="M9 2h6M12 5V2M12 13l3-3"/>'),
    'file-lines': stroke('<path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 12h6M9 16h6"/>'),
    'gear': stroke('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9A1.7 1.7 0 0 0 21 10h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>'),
    'scale-balanced': stroke('<path d="M12 3v18M7 5h10M5 8l-3 6h6L5 8Zm14 0-3 6h6l-3-6Z"/><path d="M2 14c.6 2 5.4 2 6 0M16 14c.6 2 5.4 2 6 0M8 21h8"/>'),
    'cloud-arrow-up': stroke('<path d="M7 18H6a4 4 0 0 1-.6-8A6 6 0 0 1 17 8a4 4 0 1 1 1 10h-2"/><path d="m9 14 3-3 3 3M12 11v8"/>'),
    'bell': stroke('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>'),
    'user': stroke('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
    'award': stroke('<circle cx="12" cy="9" r="5"/><path d="m9 14-2 7 5-3 5 3-2-7M10 9l1.4 1.4L14 7.8"/>'),
    'camera-rotate': stroke('<rect x="4" y="7" width="16" height="12" rx="2"/><path d="m8 7 1.5-2h5L16 7M8 13a4 4 0 0 1 7-2M16 13a4 4 0 0 1-7 2M15 9v3h-3M9 17v-3h3"/>'),
    'weight-hanging': stroke('<path d="M8 8h8l3 13H5L8 8Z"/><path d="M9 8a3 3 0 0 1 6 0M10 13h4"/>'),
    'grip-vertical': fill('<circle cx="9" cy="5" r="1.2"/><circle cx="15" cy="5" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="19" r="1.2"/><circle cx="15" cy="19" r="1.2"/>'),
    'arrows-up-down-left-right': stroke('<path d="M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3"/>'),
    'up-right-and-down-left-from-center': stroke('<path d="M14 3h7v7M21 3l-8 8M10 21H3v-7M3 21l8-8"/>'),
    'weight-scale': stroke('<path d="M5 20h14l-1-12H6L5 20Z"/><path d="M9 8a3 3 0 0 1 6 0M12 11l2-2"/>'),
    'chevron-down': stroke('<path d="m6 9 6 6 6-6"/>'),
    'plus': stroke('<path d="M12 5v14M5 12h14"/>'),
    'crosshairs': stroke('<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'),
    'trash-can': stroke('<path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/>'),
    'sliders': stroke('<path d="M4 6h16M4 18h16M8 3v6M16 15v6"/>'),
    'xmark': stroke('<path d="m6 6 12 12M18 6 6 18"/>'),
    'angle-up': stroke('<path d="m7 14 5-5 5 5"/>'),
    'signal': fill('<path d="M4 17h3v3H4zm5-4h3v7H9zm5-4h3v11h-3zm5-5h3v16h-3z"/>'),
    'check': stroke('<path d="m5 12 4 4L19 6"/>')
  };
  const fallback = stroke('<circle cx="12" cy="12" r="8"/>');
  document.querySelectorAll('i[class*="fa-"]').forEach(el => {
    const cls = [...el.classList].find(c => c.startsWith('fa-') && c !== 'fa-solid' && c !== 'fa-regular');
    const key = cls ? cls.slice(3) : '';
    el.innerHTML = paths[key] || fallback;
    el.classList.add('svg-icon');
  });
})();
