using System.IO;
using System.Text.Json;
using System.Windows;
using GoldBar.Windows.Models;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

namespace GoldBar.Windows.Services;

/// <summary>
/// Fetches the live per-gram silver quote from the configured source page
/// (default: https://nogreh.com/price-list/) using a hidden WebView2 instance.
/// The price list is public, so no login is required.
/// </summary>
public sealed class SilverQuoteService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<SilverQuoteResult> FetchAsync(SilverQuoteSettings input)
    {
        var settings = input.Normalize();
        Window? host = null;
        decimal? lastPrice = null;
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
                if (price is > 0) return Success(price);
                lastPrice = price ?? lastPrice;
                await Task.Delay(450);
            }

            return new SilverQuoteResult(false, null, "قیمت نقره در صفحه پیدا نشد.") { UpdatedAt = null };
        }
        catch (TimeoutException)
        {
            return new(false, null, "سایت مظنه نقره در زمان مقرر پاسخ نداد.");
        }
        catch (Exception ex)
        {
            return new(false, null, "خطا در دریافت مظنه نقره: " + ex.Message);
        }
        finally
        {
            try { host?.Close(); } catch { }
        }
    }

    private static SilverQuoteResult Success(decimal price) =>
        new(true, price, "مظنه نقره دریافت شد.", DateTimeOffset.Now);

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
    //  1. Look for well-known labels («گرم نقره», «نقره گرمی», ...) and take the first plausible number near them.
    //  2. Fallback: the smallest visible block whose text mentions «نقره» and contains a number in the
    //     per-gram silver range — kilo-bar listings (hundreds of millions) are excluded by the range filter.
    private static async Task<decimal?> TryExtractPriceAsync(WebView2 web)
    {
        if (web.CoreWebView2 is null) return null;
        const string script = """
(() => {
  const fa='۰۱۲۳۴۵۶۷۸۹',ar='٠١٢٣٤٥٦٧٨٩';
  const norm=s=>String(s||'').replace(/[۰-۹]/g,d=>String(fa.indexOf(d))).replace(/[٠-٩]/g,d=>String(ar.indexOf(d)));
  const visible=el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0};
  const compact=t=>String(t||'').replace(/\s+/g,' ').trim();
  const inGramRange=v=>v>=50000&&v<=5000000;
  const nums=text=>(norm(text).match(/\d[\d,٬،.\s]{3,}\d/g)||[]).map(v=>Number(v.replace(/[^0-9]/g,''))).filter(v=>Number.isFinite(v)&&inGramRange(v));
  const all=[...document.querySelectorAll('body *')].filter(visible);

  const labels=['گرم نقره','نقره گرمی','هر گرم نقره','قیمت نقره','نقره ۹۲۵','نقره'];
  for(const labelText of labels){
    const label=all.find(el=>{const t=compact(norm(el.innerText||el.textContent||''));return t===labelText||(t.startsWith(labelText)&&t.length<=labelText.length+24)});
    if(!label)continue;
    let node=label.parentElement;
    for(let depth=0;depth<6&&node;depth++,node=node.parentElement){
      const found=nums(node.innerText||node.textContent||'');
      if(found.length)return Math.max(...found);
    }
  }

  let best=null;
  for(const el of all){
    const text=norm(el.innerText||el.textContent||'');
    if(!text.includes('نقره'))continue;
    if(/کیلو|kg|1000\s*گرم|۱۰۰۰\s*گرم/.test(text))continue;
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
