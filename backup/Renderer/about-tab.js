(() => {
  'use strict';

  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  function installStyles() {
    if ($('#goldbarAboutStyles')) return;
    const style = document.createElement('style');
    style.id = 'goldbarAboutStyles';
    style.textContent = `
      .about-tab-btn{width:100%;height:44px;margin-top:12px;border:1px solid rgba(242,196,91,.25);border-radius:10px;background:rgba(242,196,91,.05);color:#f2c45b;font:800 12px Tahoma,"Segoe UI",Arial,sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:.15s}
      .about-tab-btn:hover{background:rgba(242,196,91,.1);border-color:rgba(242,196,91,.4)}
      .about-tab-btn i{font-size:14px}
      .about-panel{display:none;padding:18px 16px;direction:rtl}
      .about-panel.active{display:block}
      .about-panel h3{margin:0 0 14px;color:#f2c45b;font-size:16px;font-weight:900;text-align:center}
      .about-info{display:flex;flex-direction:column;gap:10px}
      .about-row{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid rgba(255,255,255,.06);border-radius:10px;background:rgba(255,255,255,.025)}
      .about-row i{font-size:16px;color:#f2c45b;width:20px;text-align:center}
      .about-row .about-label{color:#999faa;font-size:11px;font-weight:800;white-space:nowrap}
      .about-row .about-value{color:#e8e8e8;font-size:12px;font-weight:800;direction:ltr}
      .about-row .about-value.ltr-val{direction:ltr;text-align:left}
    `;
    document.head.appendChild(style);
  }

  function installAboutTab() {
    const settingsPanel = $('.settings');
    if (!settingsPanel || $('#aboutTabBtn')) return;

    // Add about button at the bottom of settings panel
    const btn = document.createElement('button');
    btn.id = 'aboutTabBtn';
    btn.className = 'about-tab-btn';
    btn.innerHTML = '<i class="fa-solid fa-circle-info"></i><span>درباره نرم‌افزار</span>';
    settingsPanel.appendChild(btn);

    // Create the about section inside settings-form or settings panel
    const aboutPanel = document.createElement('div');
    aboutPanel.id = 'aboutPanel';
    aboutPanel.className = 'about-panel';
    aboutPanel.innerHTML = `
      <h3>درباره نرم‌افزار</h3>
      <div class="about-info">
        <div class="about-row">
          <i class="fa-solid fa-user"></i>
          <span class="about-label">طراح برنامه</span>
          <span class="about-value">امیررضا نورهان</span>
        </div>
        <div class="about-row">
          <i class="fa-solid fa-phone"></i>
          <span class="about-label">شماره تماس</span>
          <span class="about-value ltr-val">09142201374</span>
        </div>
        <div class="about-row">
          <i class="fa-brands fa-instagram"></i>
          <span class="about-label">اینستاگرام</span>
          <span class="about-value ltr-val">@4mirnourhan</span>
        </div>
      </div>
    `;
    settingsPanel.appendChild(aboutPanel);

    // Toggle about panel on button click
    btn.addEventListener('click', () => {
      const panel = $('#aboutPanel');
      if (panel) {
        panel.classList.toggle('active');
        const icon = btn.querySelector('i');
        if (panel.classList.contains('active')) {
          icon.className = 'fa-solid fa-xmark';
          btn.querySelector('span').textContent = 'بستن';
        } else {
          icon.className = 'fa-solid fa-circle-info';
          btn.querySelector('span').textContent = 'درباره نرم‌افزار';
        }
      }
    });
  }

  function init(attempt = 0) {
    installStyles();
    const ready = Boolean($('.settings'));
    if (!ready) {
      if (attempt < 50) setTimeout(() => init(attempt + 1), 100);
      return;
    }
    installAboutTab();
  }

  init();
})();
