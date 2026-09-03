(() => {
  'use strict';

  const ENTRY_KEY = 'goldbar.windows.entries.v2';
  const COST_KEY = 'goldbar.windows.r12.costQuote';
  const SNAPSHOT_KEY = 'goldbar.windows.final.reportSnapshot';
  const MESGHAL_GRAMS = 4.3318;
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const trackedIds = new Set([
    'r7IncreaseTarget','r7BarAssay','r7AlloyTarget','r7SilverPercent',
    'splitBaseWin','r7Pct995','r7Pct750','corrWeightWin','corrTargetWin','corrDropWin'
  ]);

  let seq = 0;
  const pending = new Map();
  let settingsHookInstalled = false;
  let reportWrapperInstalled = false;

  function r4Request(action, payload = null, timeout = 35000) {
    if (!window.chrome?.webview) return Promise.reject(new Error('ارتباط با برنامه ویندوز در دسترس نیست.'));
    const id = `final-${++seq}`;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      window.chrome.webview.postMessage({ kind: 'r4request', id, action, payload });
      setTimeout(() => {
        const p = pending.get(id);
        if (!p) return;
        pending.delete(id);
        reject(new Error(`Timeout: ${action}`));
      }, timeout);
    });
  }

  window.chrome?.webview?.addEventListener('message', event => {
    const msg = event.data;
    if (!msg || msg.kind !== 'r4response') return;
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    msg.ok === false ? p.reject(new Error(msg.error || 'Host error')) : p.resolve(msg.data);
  });

  function installStyles() {
    if ($('#goldbarFinalSettingsStyles')) return;
    const style = document.createElement('style');
    style.id = 'goldbarFinalSettingsStyles';
    style.textContent = `
      .final-settings-shell{display:grid;grid-template-columns:205px minmax(0,1fr);gap:16px;direction:ltr;min-height:520px}
      .final-settings-nav{direction:rtl;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07);border-radius:16px;padding:10px;align-self:start;position:sticky;top:0}
      .final-settings-nav h3{margin:5px 7px 11px;color:#f2c45b;font-size:14px;font-weight:900}
      .final-settings-nav button{width:100%;min-height:43px;margin:3px 0;border:1px solid transparent;border-radius:10px;background:transparent;color:#aab1bc;text-align:right;padding:0 11px;font:900 11px Tahoma,"Segoe UI",Arial,sans-serif;cursor:pointer}
      .final-settings-nav button:hover{background:rgba(255,255,255,.04);color:#e9edf3}.final-settings-nav button.active{color:#f2c45b;background:rgba(242,196,91,.08);border-color:rgba(242,196,91,.24)}
      .final-settings-content{direction:rtl;min-width:0}.final-settings-panel{display:none!important}.final-settings-panel.active{display:block!important}
      .final-quote-card,.final-about-card{background:var(--panel,#15171c);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:22px;margin-bottom:18px}
      .final-quote-card h2,.final-about-card h2{margin:0 0 6px;color:#f2c45b;font-size:18px;font-weight:900}.final-sub{color:#8f97a4;font-size:11px;font-weight:800;margin-bottom:18px;line-height:1.8}
      .final-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.final-fields.one{grid-template-columns:1fr}
      .final-field label{display:block;margin-bottom:6px;color:#b9c0ca;font-size:11px;font-weight:900}.final-field input{width:100%;height:42px;box-sizing:border-box;border:1px solid #363b3e;background:#0b0e10;color:#f4f1e9;border-radius:10px;padding:0 11px;font:900 12px Tahoma,"Segoe UI",Arial,sans-serif;direction:ltr;text-align:left;outline:none}
      .final-actions{display:flex;gap:9px;margin-top:15px}.final-actions button{min-width:165px;height:40px;border-radius:10px;font:900 11px Tahoma,"Segoe UI",Arial,sans-serif;cursor:pointer}.final-primary{border:0;background:#f2b91c;color:#171717}.final-secondary{border:1px solid rgba(242,196,91,.35);background:rgba(242,196,91,.07);color:#f2c45b}
      .final-status{min-height:18px;margin-top:10px;color:#858d99;font-size:10px;font-weight:800}.final-status.ok{color:#45d47a}.final-status.error{color:#ff7777}
      .final-about-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.final-about-row{border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.025);border-radius:11px;padding:12px}.final-about-row span{display:block;color:#929aa7;font-size:10px;font-weight:800;margin-bottom:5px}.final-about-row b{display:block;color:#edf0f4;font-size:13px;font-weight:900;direction:ltr}
      .settings #r12QuoteSettings,.settings #r12SilverQuoteSettings,.settings #aboutTabBtn,.settings #aboutPanel{display:none!important}
      .r7-dashboard-scroll{height:190px!important;max-height:190px!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain;scrollbar-gutter:stable;pointer-events:auto!important}
      @media(max-width:1050px){.final-settings-shell{grid-template-columns:1fr}.final-settings-nav{position:static;display:grid;grid-template-columns:1fr 1fr;gap:4px}.final-settings-nav h3{grid-column:1/-1}.final-fields{grid-template-columns:1fr}.final-about-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function readJson(key, fallback = {}) {
    try { return { ...fallback, ...JSON.parse(sessionStorage.getItem(key) || '{}') }; }
    catch { return { ...fallback }; }
  }

  function saveSnapshot(id, value) {
    const state = readJson(SNAPSHOT_KEY);
    state[id] = String(value ?? '');
    sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(state));
  }

  function snapshotValue(id, fallback = '') {
    const el = document.getElementById(id);
    if (el && 'value' in el && String(el.value) !== '') return String(el.value);
    const state = readJson(SNAPSHOT_KEY);
    return state[id] != null && state[id] !== '' ? String(state[id]) : String(fallback);
  }

  function cleanNumber(value) {
    const fa='۰۱۲۳۴۵۶۷۸۹', ar='٠١٢٣٤٥٦٧٨٩';
    const raw=String(value ?? '').replace(/[۰-۹]/g,d=>String(fa.indexOf(d))).replace(/[٠-٩]/g,d=>String(ar.indexOf(d))).replace(/[,٬،\s]/g,'').replace(/[^0-9.\-]/g,'');
    const n=Number(raw); return Number.isFinite(n) ? n : NaN;
  }

  function fmt(value, digits = 3) {
    const n=Number(value); return Number.isFinite(n) ? n.toLocaleString('en-US',{maximumFractionDigits:digits}) : '';
  }

  function field(label, value, unit = '') { return { label, value: String(value ?? ''), unit }; }

  function readEntries() {
    try {
      const list=JSON.parse(localStorage.getItem(ENTRY_KEY) || '[]');
      return Array.isArray(list) ? list.filter(x=>Number(x?.weight)>0 && Number(x?.assay)>0) : [];
    } catch { return []; }
  }

  function buildReportSections(baseReport = {}) {
    const entries = Array.isArray(baseReport.entries) ? baseReport.entries : readEntries();
    const engine = window.__goldbarAssayEngineV2;
    const summary = engine?.summarize(entries) || { count:entries.length, weight:0, averageAssay:NaN };

    const increaseTarget=cleanNumber(snapshotValue('r7IncreaseTarget','747'));
    const barAssay=cleanNumber(snapshotValue('r7BarAssay','995'));
    const inc=engine?.increaseAssay(summary,increaseTarget,barAssay) || {};

    const alloyTarget=cleanNumber(snapshotValue('r7AlloyTarget','747'));
    const silverPct=cleanNumber(snapshotValue('r7SilverPercent','45'));
    const alloy=engine?.alloyForTarget(summary,alloyTarget,silverPct,summary.weight) || {};

    const splitBase=cleanNumber(snapshotValue('splitBaseWin','800'));
    const pct995=cleanNumber(snapshotValue('r7Pct995','36.79'));
    const pct750=cleanNumber(snapshotValue('r7Pct750','63.21'));
    const split=engine?.splitByPercent(splitBase,pct995,pct750) || {};
    const corrWeight=cleanNumber(snapshotValue('corrWeightWin','250'));
    const corrBase=cleanNumber(snapshotValue('corrTargetWin','750'));
    const corrDrop=cleanNumber(snapshotValue('corrDropWin','1'));
    const corrAdd=engine?.correctionForDrop(corrWeight,corrBase,corrDrop);

    const cost=readJson(COST_KEY,{goldQuote:'',silverQuote:'',barDifference:'',alloyPrice:'',cutchPrice:'',resinPrice:'',cutchWeight:'',resinWeight:''});
    const goldQuote=cleanNumber(cost.goldQuote), silverQuote=cleanNumber(cost.silverQuote), barDifference=cleanNumber(cost.barDifference), alloyPrice=cleanNumber(cost.alloyPrice), cutchPrice=cleanNumber(cost.cutchPrice), resinPrice=cleanNumber(cost.resinPrice);
    const goldPricePerGram=goldQuote>0 ? goldQuote/MESGHAL_GRAMS : NaN;
    const highAssayWeight=entries.reduce((s,e)=>s+(Number(e?.weight)>0 && Number(e?.assay)>900 ? Number(e.weight) : 0),0);
    const silverRequired=Math.max(0,Number(alloy.silverRequired)||0), nonSilverRequired=Math.max(0,Number(alloy.nonSilverRequired)||0);
    const explicitCutch=cleanNumber(cost.cutchWeight), explicitResin=cleanNumber(cost.resinWeight);
    const cutchWeight=explicitCutch>0 ? explicitCutch : Math.max(0,Number(alloy.fourPerThousand)||0);
    const resinWeight=explicitResin>0 ? explicitResin : Math.max(0,Number(alloy.finalOtherAlloy)||0);
    const silverGold=goldPricePerGram>0 && silverQuote>=0 ? silverRequired*silverQuote/goldPricePerGram : NaN;
    const barGold=highAssayWeight*(Number.isFinite(barDifference)?barDifference:0)/1000;
    const alloyGold=goldPricePerGram>0 && Number.isFinite(alloyPrice) ? nonSilverRequired*alloyPrice/goldPricePerGram : NaN;
    const cutchGold=goldPricePerGram>0 && cutchPrice>0 ? cutchWeight*cutchPrice/goldPricePerGram : 0;
    const resinGold=goldPricePerGram>0 && resinPrice>0 ? resinWeight*resinPrice/goldPricePerGram : 0;
    const costTotal=[silverGold,barGold,alloyGold,cutchGold,resinGold].every(Number.isFinite) ? silverGold+barGold+alloyGold+cutchGold+resinGold : NaN;

    return {
      increaseAssay:{fields:[
        field('وزن آبشده‌ها',fmt(summary.weight),'g'), field('عیار میانگین آبشده‌ها',fmt(summary.averageAssay),'‰'),
        field('عیار هدف',fmt(increaseTarget),'‰'), field('عیار شمش',fmt(barAssay),'‰'), field('اختلاف عیار',fmt(inc.assayDifference),'‰'),
        field('فاصله عیار شمش تا هدف',fmt(inc.denominator),'‰'), field('شمش مورد نیاز',fmt(inc.requiredBar,1),'g')
      ]},
      assay:{fields:[
        field('وزن آبشده‌ها',fmt(summary.weight),'g'), field('عیار میانگین آبشده‌ها',fmt(summary.averageAssay),'‰'),
        field('عیار هدف',fmt(alloyTarget),'‰'), field('درصد نقره',fmt(silverPct,2),'%'), field('کل بار مورد نیاز',fmt(alloy.totalAlloyRequired),'g'),
        field('نقره مورد نیاز',fmt(alloy.silverRequired),'g'), field('بار بدون نقره',fmt(alloy.nonSilverRequired),'g'), field('وزن نهایی آبشده + بار',fmt(alloy.totalAfterAlloy),'g')
      ]},
      quickCalculation:{fields:[
        field('عدد پایه تقسیم',fmt(splitBase),'g'), field('درصد طلای 995',fmt(pct995,2),'%'), field('طلای 995',fmt(split.gold995),'g'),
        field('درصد طلای 750',fmt(pct750,2),'%'), field('طلای 750',fmt(split.gold750),'g'), field('وزن پایه اصلاح افت عیار',fmt(corrWeight),'g'),
        field('عیار پایه',fmt(corrBase),'‰'), field('افت عیار',fmt(corrDrop),'‰'), field('بار افزوده',fmt(corrAdd),'g'), field('جمع وزن',fmt(Number.isFinite(corrAdd)?corrWeight+corrAdd:NaN),'g')
      ]},
      assayCost:{fields:[
        field('مظنه طلا - هر مثقال',fmt(goldQuote,0),'ریال'), field('مظنه نقره - هر گرم',fmt(silverQuote,0),'ریال'), field('قیمت هر گرم طلا',fmt(goldPricePerGram,0),'ریال'),
        field('فرق شمش',fmt(barDifference),'g/kg'), field('قیمت هر گرم بار',fmt(alloyPrice,0),'ریال'), field('قیمت هر گرم کچ',fmt(cutchPrice,0),'ریال'), field('قیمت هر گرم رزین',fmt(resinPrice,0),'ریال'),
        field('مقدار کچ',fmt(cutchWeight),'g'), field('مقدار رزین',fmt(resinWeight),'g'), field('هزینه نقره',fmt(silverGold),'g طلا'), field('فرق شمش',fmt(barGold),'g طلا'),
        field('هزینه بار',fmt(alloyGold),'g طلا'), field('هزینه کچ',fmt(cutchGold),'g طلا'), field('هزینه رزین',fmt(resinGold),'g طلا'), field('جمع هزینه عیار',fmt(costTotal),'g طلا')
      ]}
    };
  }

  function installReportWrapper() {
    const bridge=window.goldbar;
    if (!bridge || bridge.__finalReportWrapped || typeof bridge.saveReport!=='function') return false;
    const original=bridge.saveReport.bind(bridge);
    bridge.saveReport=report=>original({...(report||{}),...buildReportSections(report||{})});
    bridge.__finalReportWrapped=true;
    reportWrapperInstalled=true;
    return true;
  }

  function status(id,message,cls='') { const el=$(id); if(el){el.className=`final-status ${cls}`.trim();el.textContent=message;} }

  function makeGoldPanel() {
    const panel=document.createElement('section');
    panel.id='r12MainQuoteSettings'; panel.className='final-settings-panel final-quote-card'; panel.dataset.finalPanel='gold';
    panel.innerHTML=`<h2>تنظیمات مظنه طلا</h2><div class="final-sub">تنظیم منبع مظنه طلا، نام کاربری و رمز عبور و تست دریافت مظنه.</div><div class="final-fields"><div class="final-field"><label>لینک منبع مظنه</label><input id="finalGoldUrl" value="https://aminigold.com/"></div><div class="final-field"><label>نام کاربری</label><input id="finalGoldUser" autocomplete="off"></div><div class="final-field"><label>رمز عبور</label><input id="finalGoldPass" type="password" autocomplete="new-password"></div></div><div class="final-actions"><button class="final-primary" id="finalGoldSave">ذخیره تنظیمات مظنه</button><button class="final-secondary" id="finalGoldTest">تست دریافت مظنه</button></div><div id="finalGoldStatus" class="final-status">رمز عبور با حفاظت حساب ویندوز ذخیره می‌شود.</div>`;
    panel.querySelector('#finalGoldSave').addEventListener('click',async()=>{try{status('#finalGoldStatus','در حال ذخیره...');const r=await r4Request('quote:save-settings',{url:$('#finalGoldUrl').value,username:$('#finalGoldUser').value,password:$('#finalGoldPass').value},10000);$('#finalGoldPass').value='';$('#finalGoldPass').placeholder=r?.hasPassword?'رمز ذخیره شده - برای تغییر رمز جدید وارد کنید':'رمز ورود سایت';status('#finalGoldStatus','تنظیمات مظنه طلا ذخیره شد ✓','ok');}catch(e){status('#finalGoldStatus',e?.message||'خطا در ذخیره','error');}});
    panel.querySelector('#finalGoldTest').addEventListener('click',async()=>{try{panel.querySelector('#finalGoldSave').click();status('#finalGoldStatus','در حال دریافت مظنه...');const r=await r4Request('quote:fetch',null,35000);status('#finalGoldStatus',r?.ok&&Number(r?.quote)>0?`مظنه دریافت شد: ${fmt(r.quote,0)} ✓`:(r?.message||'مظنه موجود نیست'),r?.ok?'ok':'error');}catch(e){status('#finalGoldStatus',e?.message||'مظنه موجود نیست','error');}});
    r4Request('quote:get-settings',null,10000).then(s=>{if($('#finalGoldUrl'))$('#finalGoldUrl').value=s?.url||'https://aminigold.com/';if($('#finalGoldUser'))$('#finalGoldUser').value=s?.username||'';if($('#finalGoldPass'))$('#finalGoldPass').placeholder=s?.hasPassword?'رمز ذخیره شده - برای تغییر رمز جدید وارد کنید':'رمز ورود سایت';}).catch(()=>{});
    return panel;
  }

  function makeSilverPanel() {
    const panel=document.createElement('section'); panel.className='final-settings-panel final-quote-card'; panel.dataset.finalPanel='silver';
    panel.innerHTML=`<h2>تنظیمات مظنه نقره</h2><div class="final-sub">تنظیم منبع قیمت نقره و تست دریافت قیمت هر گرم نقره.</div><div class="final-fields one"><div class="final-field"><label>لینک منبع مظنه نقره</label><input id="finalSilverUrl" value="https://nogreh.com/price-list/"></div></div><div class="final-actions"><button class="final-primary" id="finalSilverSave">ذخیره تنظیمات مظنه نقره</button><button class="final-secondary" id="finalSilverTest">تست دریافت مظنه نقره</button></div><div id="finalSilverStatus" class="final-status">صفحه قیمت نقره عمومی است و نیازی به ورود ندارد.</div>`;
    panel.querySelector('#finalSilverSave').addEventListener('click',async()=>{try{await r4Request('silver-quote:save-settings',{url:$('#finalSilverUrl').value},10000);status('#finalSilverStatus','تنظیمات مظنه نقره ذخیره شد ✓','ok');}catch(e){status('#finalSilverStatus',e?.message||'خطا در ذخیره','error');}});
    panel.querySelector('#finalSilverTest').addEventListener('click',async()=>{try{await r4Request('silver-quote:save-settings',{url:$('#finalSilverUrl').value},10000);status('#finalSilverStatus','در حال دریافت مظنه نقره...');const r=await r4Request('silver-quote:fetch',null,35000);status('#finalSilverStatus',r?.ok&&Number(r?.quote)>0?`قیمت نقره دریافت شد: ${fmt(r.quote,0)} ✓`:(r?.message||'مظنه نقره موجود نیست'),r?.ok?'ok':'error');}catch(e){status('#finalSilverStatus',e?.message||'مظنه نقره موجود نیست','error');}});
    r4Request('silver-quote:get-settings',null,10000).then(s=>{if($('#finalSilverUrl'))$('#finalSilverUrl').value=s?.url||'https://nogreh.com/price-list/';}).catch(()=>{});
    return panel;
  }

  function makeAboutPanel() {
    const panel=document.createElement('section'); panel.className='final-settings-panel final-about-card'; panel.dataset.finalPanel='about';
    panel.innerHTML=`<h2>درباره نرم‌افزار</h2><div class="final-sub">GOLD BAR — نرم‌افزار مدیریت آبشده، محاسبات عیار، هزینه و گزارش کارگاه.</div><div class="final-about-grid"><div class="final-about-row"><span>طراح برنامه</span><b dir="rtl">امیررضا نورهان</b></div><div class="final-about-row"><span>نسخه</span><b>GOLD BAR v2.0.0 R12 Final</b></div><div class="final-about-row"><span>شماره تماس</span><b>09142201374</b></div><div class="final-about-row"><span>Instagram</span><b>@4mirnourhan</b></div></div>`;
    return panel;
  }

  function enhanceSettingsPage() {
    if ($('.dash-title span:last-child')?.textContent?.trim()!=='تنظیمات') return false;
    const host=$('#pageHost.active'); if(!host || $('#finalSettingsShell')) return false;
    const scale=host.querySelector(':scope > .page-panel'); if(!scale) return false;
    scale.classList.add('final-settings-panel','active'); scale.dataset.finalPanel='scale';
    const existingGold=host.querySelector('#r12MainQuoteSettings');
    const gold=existingGold||makeGoldPanel(); if(existingGold){gold.classList.add('final-settings-panel');gold.dataset.finalPanel='gold';}
    const silver=makeSilverPanel(), about=makeAboutPanel();
    const shell=document.createElement('div'); shell.id='finalSettingsShell'; shell.className='final-settings-shell';
    const nav=document.createElement('aside'); nav.className='final-settings-nav'; nav.innerHTML='<h3>تنظیمات</h3>';
    const content=document.createElement('div'); content.className='final-settings-content';
    const items=[['scale','تنظیمات ترازو'],['gold','تنظیمات مظنه طلا'],['silver','تنظیمات مظنه نقره'],['about','درباره نرم‌افزار']];
    const panels={scale,gold,silver,about};
    const show=key=>{Object.entries(panels).forEach(([k,p])=>p.classList.toggle('active',k===key));[...nav.querySelectorAll('button')].forEach(b=>b.classList.toggle('active',b.dataset.key===key));};
    for(const [key,label] of items){const b=document.createElement('button');b.dataset.key=key;b.textContent=label;b.addEventListener('click',()=>show(key));nav.appendChild(b);}
    host.textContent=''; content.append(scale,gold,silver,about); shell.append(nav,content); host.appendChild(shell); show('scale');
    return true;
  }

  function installSettingsHook() {
    const nav=$$('.nav-item').find(b=>b.querySelector('span')?.textContent?.trim()==='تنظیمات');
    if(!nav || nav.dataset.finalSettingsHook==='1') return false;
    nav.dataset.finalSettingsHook='1';
    nav.addEventListener('click',()=>{setTimeout(enhanceSettingsPage,260);setTimeout(enhanceSettingsPage,520);},true);
    settingsHookInstalled=true;
    return true;
  }

  function wrapProbe(attempt=0) {
    const previous=window.__goldbarR3Probe;
    if(typeof previous!=='function'){if(attempt<40)setTimeout(()=>wrapProbe(attempt+1),100);return;}
    if(previous.__finalWrapped)return;
    const wrapper=()=>{const base=previous();const final={reportWrapper:reportWrapperInstalled,settingsHook:settingsHookInstalled,importBridge:typeof window.goldbar?.importReport==='function'};final.ok=Object.values(final).every(Boolean);return {...base,final,ok:Boolean(base?.ok&&final.ok)};};
    wrapper.__finalWrapped=true; window.__goldbarR3Probe=wrapper;
  }

  document.addEventListener('input',e=>{const id=e.target?.id;if(id&&trackedIds.has(id))saveSnapshot(id,e.target.value);},true);

  function init(attempt=0) {
    installStyles();
    const reportOk=installReportWrapper();
    const settingsOk=installSettingsHook();
    if((!reportOk&&!reportWrapperInstalled)||(!settingsOk&&!settingsHookInstalled)){if(attempt<50)setTimeout(()=>init(attempt+1),100);return;}
    wrapProbe();
  }

  init();
})();
