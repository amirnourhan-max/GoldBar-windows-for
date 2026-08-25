using System.IO;
using System.Text.Json;
using System.Windows;
using GoldBar.Windows.Models;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

namespace GoldBar.Windows.Services;

/// <summary>
/// Fetches the live per-gram silver shot quote («ساچمه ۹۹۹.۹ خارجی») from the configured
/// source page (default: https://nogreh.com/price-list/) using a hidden WebView2 instance.
/// The price list is public, so no login is required.
/// </summary>
public sealed class SilverQuoteService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<SilverQuoteResult> FetchAsync(SilverQuoteSettings input)
    {
        var settings = input.Normalize();
        Window? host = null;
        try
        {
            var web = new WebView2();
            host = new Window
            {
                Width = 16, Height = 16, Left = -10000, Top = -10000, Opacity = 0.01,
                ShowInTaskbar = false, ShowActivated = false,
                WindowStyle = WindowStyle.None, ResizeMode = ResizeMode.NoResize, Content = web
            };
            host.Show();

            var userData = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "GoldBar", "SilverQuoteWebView2");
            Directory.CreateDirectory(userData);
            var env = await CoreWebView2Environment.CreateAsync(userDataFolder: userData);
            await web.EnsureCoreWebView2Async(env);
            web.CoreWebView2.Settings.AreDevToolsEnabled = false;
            web.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            web.CoreWebView2.Settings.IsStatusBarEnabled = false;

            await NavigateAsync(web, settings.Url, TimeSpan.FromSeconds(12));
            await Task.Delay(450);

            // The price list may render progressively; poll a few times before giving up.
            for (var attempt = 0; attempt < 8; attempt++)
            {
                var price = await TryExtractPriceAsync(web);
                if (price is { } foundPrice && foundPrice > 0) return Success(foundPrice);
                await Task.Delay(450);
            }

            return new SilverQuoteResult(false, null, "ردیف «ساچمه ۹۹۹.۹ خارجی» در صفحه پیدا نشد.") { UpdatedAt = null };
        }
        catch (TimeoutException)
        {
            return new(false, null, "سایت مظنه نقره در زمان مقرر پاسخ نداد.");
        }
        catch (Exception ex)
        {
            return new(false, null, "خطا در دریافت مظنه ساچمه نقره: " + ex.Message);
        }
        finally
        {
            try { host?.Close(); } catch { }
        }
    }

    private static SilverQuoteResult Success(decimal price) =>
        new(true, price, "مظنه ساچمه ۹۹۹.۹ خارجی دریافت شد.", DateTimeOffset.Now);

    private static async Task NavigateAsync(WebView2 web, string url, TimeSpan timeout)
    {
        var tcs = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        void Done(object? _, CoreWebView2NavigationCompletedEventArgs e) => tcs.TrySetResult(e.IsSuccess);
        web.NavigationCompleted += Done;
        try
        {
            web.Source = new Uri(url);
            if (await Task.WhenAny(tcs.Task, Task.Delay(timeout)) != tcs.Task) throw new TimeoutException();
            if (!await tcs.Task.ConfigureAwait(true))
                throw new InvalidOperationException($"دسترسی به سایت مظنه نقره ({url}) ممکن نشد. اتصال اینترنت را بررسی کنید.");
        }
        finally { web.NavigationCompleted -= Done; }
    }

    // Layered extractor:
    //  1. Primary: the table row labeled «ساچمه 999.9 خارجی» → its .nogreh-price-main value
    //     (exactly how nogreh.com renders the per-gram silver shot price).
    //  2. Fallback A: any element whose compact text carries the same label, climbing ancestors.
    //  3. Fallback B: the smallest visible block mentioning silver with a plausible per-gram number;
    //     kilo-bar listings and other rows are excluded by range/keyword filters.
    private static async Task<decimal?> TryExtractPriceAsync(WebView2 web)
    {
        if (web.CoreWebView2 is null) return null;
        const string script = """
(() => {
  const fa='۰۱۲۳۴۵۶۷۸۹',ar='٠١٢٣٤٥٦٧٨٩';
  const strip=s=>String(s||'').replace(/[\u202A-\u202E\u2066-\u2069]/g,'');
  const norm=s=>strip(String(s||'')).replace(/[۰-۹]/g,d=>String(fa.indexOf(d))).replace(/[٠-٩]/g,d=>String(ar.indexOf(d)));
  const visible=el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0};
  const compact=t=>String(t||'').replace(/\s+/g,' ').trim();
  const inGramRange=v=>v>=50000&&v<=5000000;
  const nums=text=>(norm(text).match(/\d[\d,٬،.\s]{2,}\d/g)||[]).map(v=>Number(v.replace(/[^0-9]/g,''))).filter(v=>Number.isFinite(v)&&inGramRange(v));
  const isShot=t=>t.includes('ساچمه')&&/999\s*[.,٫]?\s*9/.test(t)&&t.includes('خارجی');
  const all=[...document.querySelectorAll('body *')].filter(visible);

  // 1) Exact table row on nogreh.com: <tr>…<th>ساچمه 999.9 خارجی</th><td><div class="nogreh-price-main">449,000…
  for(const tr of document.querySelectorAll('tr')){
    if(!visible(tr))continue;
    if(!isShot(compact(norm(tr.innerText||tr.textContent||''))))continue;
    const cell=tr.querySelector('.nogreh-price-main')||tr;
    const found=nums(cell.innerText||cell.textContent||'');
    if(found.length)return Math.max(...found);
  }

  // 2) Label element anywhere on the page, then climb ancestors until a number appears.
  let node=all.find(el=>isShot(compact(norm(el.innerText||el.textContent||''))));
  for(let depth=0;depth<8&&node;depth++,node=node.parentElement){
    const found=nums(node.innerText||node.textContent||'');
    if(found.length)return Math.max(...found);
  }

  // 3) Generic silver fallback (smallest matching block, Iranian/other-shot rows excluded).
  let best=null;
  for(const el of all){
    const text=norm(el.innerText||el.textContent||'');
    if(!text.includes('نقره'))continue;
    if(/کیلو|kg|1000\s*گرم|۱۰۰۰\s*گرم/.test(text))continue;
    if(text.includes('ایرانی')&&!text.includes('خارجی'))continue;
    const found=nums(text);
    if(!found.length)continue;
    const r=el.getBoundingClientRect(),area=Math.max(1,r.width*r.height);
    if(!best||area<best.area)best={value:Math.max(...found),area};
  }
  return best?.value??null;
})()
""";
        try
        {
            var raw = await web.ExecuteScriptAsync(script);
            using var doc = JsonDocument.Parse(raw);
            if (doc.RootElement.ValueKind == JsonValueKind.Number && doc.RootElement.TryGetDecimal(out var value) && value > 0)
                return value;
            return null;
        }
        catch { return null; }
    }
}
