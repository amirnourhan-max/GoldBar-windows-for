using System.ComponentModel;
using System.IO;
using System.Text.Json;
using System.Windows;
using GoldBar.Windows.Core;
using GoldBar.Windows.Models;
using GoldBar.Windows.Services;
using Microsoft.Win32;
using Microsoft.Web.WebView2.Core;

namespace GoldBar.Windows;

public partial class MainWindow
{
    private readonly ReportImportService _r4ReportImportService = new();
    private readonly GoldQuoteSettingsStore _quoteStore = new();
    private readonly GoldQuoteService _quoteService = new();
    private bool _r4MessageHooked;
    private bool _r4CloseApproved;
    private bool _r4ClosingBusy;

    protected override void OnInitialized(EventArgs e)
    {
        base.OnInitialized(e);
        WindowState = R4WindowPolicy.StartupState(_runUiSelfTest);
        if (!_runUiSelfTest) R4ApplyInitialWindowBounds();
        Closing += R4OnClosing;
        Web.NavigationCompleted += R4OnNavigationCompleted;
    }

    private void R4ApplyInitialWindowBounds()
    {
        var work = SystemParameters.WorkArea;
        var targetWidth = Math.Min(1536d, work.Width * 0.88d);
        var targetHeight = Math.Min(1024d, work.Height * 0.88d);
        Width = Math.Max(MinWidth, Math.Min(targetWidth, Math.Max(MinWidth, work.Width - 24d)));
        Height = Math.Max(MinHeight, Math.Min(targetHeight, Math.Max(MinHeight, work.Height - 24d)));
        Left = work.Left + Math.Max(0d, (work.Width - Width) / 2d);
        Top = work.Top + Math.Max(0d, (work.Height - Height) / 2d);
    }

    private async void R4OnNavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
    {
        if (Web.CoreWebView2 is null) return;
        if (!_r4MessageHooked)
        {
            Web.CoreWebView2.WebMessageReceived += R4OnWebMessageReceived;
            _r4MessageHooked = true;
        }

        try
        {
            var selfTest = _runUiSelfTest ? "true" : "false";
            var script =
                "window.__goldbarR4SelfTest = " + selfTest + ";\n" +
                "if (!document.querySelector('script[data-goldbar-r4]')) {\n" +
                "  const s = document.createElement('script');\n" +
                "  s.src = 'r4.js';\n" +
                "  s.dataset.goldbarR4 = '1';\n" +
                "  document.body.appendChild(s);\n" +
                "}\n" +
                "if (!document.querySelector('script[data-goldbar-r5]')) {\n" +
                "  const s5 = document.createElement('script');\n" +
                "  s5.src = 'r5.js';\n" +
                "  s5.dataset.goldbarR5 = '1';\n" +
                "  document.body.appendChild(s5);\n" +
                "}\n" +
                "if (!document.querySelector('script[data-goldbar-r5fix]')) {\n" +
                "  const s5f = document.createElement('script');\n" +
                "  s5f.src = 'r5fix.js';\n" +
                "  s5f.dataset.goldbarR5fix = '1';\n" +
                "  document.body.appendChild(s5f);\n" +
                "}\n" +
                "if (!document.querySelector('script[data-goldbar-assay-v2]')) {\n" +
                "  const se = document.createElement('script');\n" +
                "  se.src = 'assay-engine-v2.js';\n" +
                "  se.dataset.goldbarAssayV2 = '1';\n" +
                "  document.body.appendChild(se);\n" +
                "}\n" +
                "if (!document.querySelector('script[data-goldbar-r7]')) {\n" +
                "  const s7 = document.createElement('script');\n" +
                "  s7.src = 'r7.js';\n" +
                "  s7.dataset.goldbarR7 = '1';\n" +
                "  document.body.appendChild(s7);\n" +
                "}\n" +
                "if (!document.querySelector('script[data-goldbar-r8]')) {\n" +
                "  const s8 = document.createElement('script');\n" +
                "  s8.src = 'r8.js';\n" +
                "  s8.dataset.goldbarR8 = '1';\n" +
                "  document.body.appendChild(s8);\n" +
                "}\n" +
                "if (!document.querySelector('script[data-goldbar-r11]')) {\n" +
                "  const s11 = document.createElement('script');\n" +
                "  s11.src = 'r11.js';\n" +
                "  s11.dataset.goldbarR11 = '1';\n" +
                "  document.body.appendChild(s11);\n" +
                "}\n" +
                "if (!document.querySelector('script[data-goldbar-r12-quote]')) {\n" +
                "  const sq = document.createElement('script');\n" +
                "  sq.src = 'r12-cost-quote.js';\n" +
                "  sq.dataset.goldbarR12Quote = '1';\n" +
                "  document.body.appendChild(sq);\n" +
                "}\n";
            await Web.ExecuteScriptAsync(script);
        }
        catch { }
    }

    private async void R4OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        string? id = null;
        try
        {
            using var doc = JsonDocument.Parse(e.WebMessageAsJson);
            var root = doc.RootElement;
            if (!root.TryGetProperty("kind", out var kind) || kind.GetString() != "r4request") return;
            id = root.TryGetProperty("id", out var idElement) ? idElement.GetString() : null;
            var action = root.TryGetProperty("action", out var actionElement) ? actionElement.GetString() : string.Empty;
            var payload = root.TryGetProperty("payload", out var p) ? p : default;
            object result = action switch
            {
                "report:import" => await R4ImportReportAsync(),
                "scale:test" => await R4TestScaleAsync(payload),
                "user:get" => new { username = CurrentUser.Username },
                "user:change-password" => R11ChangePassword(),
                "quote:get-settings" => await QuoteGetSettingsAsync(),
                "quote:save-settings" => await QuoteSaveSettingsAsync(payload),
                "quote:fetch" => await QuoteFetchAsync(),
                _ => throw new InvalidOperationException($"Unknown r4 action: {action}")
            };
            R4Reply(id, true, result, null);
        }
        catch (Exception ex)
        {
            R4Reply(id, false, null, ex.Message);
        }
    }

    private async Task<object> QuoteGetSettingsAsync()
    {
        var s = await _quoteStore.GetPublicAsync();
        return new { url = s.Url, username = s.Username, hasPassword = s.HasPassword };
    }

    private async Task<object> QuoteSaveSettingsAsync(JsonElement payload)
    {
        var current = await _quoteStore.LoadAsync();
        var url = payload.TryGetProperty("url", out var u) ? u.GetString() : current.Url;
        var username = payload.TryGetProperty("username", out var n) ? n.GetString() : current.Username;
        var password = payload.TryGetProperty("password", out var p) ? p.GetString() : null;
        var next = new GoldQuoteSettings
        {
            Url = string.IsNullOrWhiteSpace(url) ? current.Url : url!,
            Username = username ?? string.Empty,
            Password = string.IsNullOrEmpty(password) ? current.Password : password
        }.Normalize();
        await _quoteStore.SaveAsync(next);
        return new { url = next.Url, username = next.Username, hasPassword = !string.IsNullOrWhiteSpace(next.Password) };
    }

    private async Task<object> QuoteFetchAsync()
    {
        if (_runUiSelfTest)
            return new GoldQuoteResult(false, null, "مظنه موجود نیست");
        var settings = await _quoteStore.LoadAsync();
        return await _quoteService.FetchAsync(settings);
    }

    private object R11ChangePassword()
    {
        if (_runUiSelfTest) return new { ok = true, selfTest = true };
        var store = new CredentialStore();
        var dialog = new ChangePasswordDialog(store, CurrentUser.Username) { Owner = this };
        var changed = dialog.ShowDialog() == true;
        return new { ok = changed, cancelled = !changed };
    }

    private async Task<object> R4TestScaleAsync(JsonElement payload)
    {
        ScaleSettings candidate;
        try
        {
            candidate = payload.ValueKind == JsonValueKind.Object
                ? payload.Deserialize<ScaleSettings>(_json) ?? _settings
                : _settings;
        }
        catch
        {
            candidate = _settings;
        }
        return await _scale.TestAsync(candidate, 1400);
    }

    private Task<object> R4ImportReportAsync()
    {
        var dialog = new OpenFileDialog
        {
            Title = "وارد کردن گزارش Gold Bar",
            Filter = "Gold Bar Excel Report (*.xlsx)|*.xlsx|Excel Workbook (*.xlsx)|*.xlsx",
            Multiselect = false,
            CheckFileExists = true,
            InitialDirectory = Directory.Exists(_settings.ReportDirectory)
                ? _settings.ReportDirectory
                : ScaleSettings.GetDefaultReportDirectory()
        };

        if (dialog.ShowDialog(this) != true)
            return Task.FromResult<object>(new { ok = false, cancelled = true });

        var request = _r4ReportImportService.LoadXlsx(dialog.FileName);
        return Task.FromResult<object>(new
        {
            ok = true,
            path = dialog.FileName,
            count = request.Entries.Count,
            entries = request.Entries
        });
    }

    private async void R4OnClosing(object? sender, CancelEventArgs e)
    {
        if (_runUiSelfTest || _r4CloseApproved) return;
        e.Cancel = true;
        if (_r4ClosingBusy) return;
        _r4ClosingBusy = true;

        try
        {
            var choice = MessageBox.Show(
                this,
                "آیا می‌خواهید قبل از بستن نرم‌افزار گزارش آبشده‌های این جلسه ذخیره شود؟\n\nبله: ذخیره گزارش و خروج\nخیر: خروج بدون ذخیره\nانصراف: بازگشت به برنامه",
                "ذخیره گزارش آبشده‌ها",
                MessageBoxButton.YesNoCancel,
                MessageBoxImage.Question,
                MessageBoxResult.Yes);

            if (choice == MessageBoxResult.Cancel) return;

            if (choice == MessageBoxResult.Yes)
            {
                try
                {
                    var request = await R4ReadCurrentReportAsync();
                    _reportService.SaveXlsx(_settings.ReportDirectory, request);
                }
                catch (Exception ex)
                {
                    MessageBox.Show(this,
                        "ذخیره گزارش انجام نشد و برنامه بسته نشد.\n\n" + ex.Message,
                        "خطا در ذخیره گزارش",
                        MessageBoxButton.OK,
                        MessageBoxImage.Error);
                    return;
                }
            }

            try
            {
                if (Web.CoreWebView2 is not null)
                {
                    await Web.ExecuteScriptAsync(
                        "localStorage.removeItem('goldbar.windows.entries.v2');" +
                        "sessionStorage.removeItem('goldbar.windows.r11.businessReset');" +
                        "sessionStorage.removeItem('goldbar.windows.r11.assayPageReset');" +
                        "sessionStorage.removeItem('goldbar.windows.r11.quickPageReset');");
                }
            }
            catch { }

            _r4CloseApproved = true;
            Close();
        }
        finally
        {
            _r4ClosingBusy = false;
        }
    }

    private async Task<ReportRequest> R4ReadCurrentReportAsync()
    {
        if (Web.CoreWebView2 is null) return new ReportRequest();
        var encoded = await Web.ExecuteScriptAsync("localStorage.getItem('goldbar.windows.entries.v2') || '[]'");
        var raw = JsonSerializer.Deserialize<string>(encoded) ?? "[]";
        var entries = JsonSerializer.Deserialize<List<ReportEntry>>(raw, _json) ?? [];
        return new ReportRequest
        {
            Entries = entries
                .Where(x => double.IsFinite(x.Weight) && double.IsFinite(x.Assay) && x.Weight > 0 && x.Assay > 0 && x.Assay <= 1000)
                .ToList()
        };
    }

    private void R4Reply(string? id, bool ok, object? data, string? error)
    {
        if (string.IsNullOrWhiteSpace(id) || Web.CoreWebView2 is null) return;
        var json = JsonSerializer.Serialize(new { kind = "r4response", id, ok, data, error }, _json);
        Web.CoreWebView2.PostWebMessageAsJson(json);
    }
}
