using System.IO;
using System.IO.Ports;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows;
using System.Windows.Interop;
using GoldBar.Windows.Models;
using GoldBar.Windows.Services;
using Microsoft.Win32;
using Microsoft.Web.WebView2.Core;

namespace GoldBar.Windows;

public partial class MainWindow : Window
{
    private const uint WmNcLButtonDown = 0x00A1;
    private const int HtCaption = 2;

    private readonly SettingsStore _settingsStore = new();
    private readonly ScaleService _scale = new();
    private readonly ReportService _reportService = new();
    private readonly JsonSerializerOptions _json = new(JsonSerializerDefaults.Web);
    private readonly bool _runUiSelfTest;
    private bool _uiSelfTestStarted;
    private ScaleSettings _settings = ScaleSettings.Defaults();

    [DllImport("user32.dll")]
    private static extern bool ReleaseCapture();

    [DllImport("user32.dll")]
    private static extern nint SendMessage(nint hWnd, uint msg, nint wParam, nint lParam);

    public MainWindow(bool runUiSelfTest = false)
    {
        _runUiSelfTest = runUiSelfTest;
        InitializeComponent();
        Loaded += OnLoaded;
        Closed += (_, _) => _scale.Dispose();
        _scale.WeightReceived += (value, raw) => PostEvent("scale:weight", new { value, raw, decimals = _settings.Decimals });
        _scale.StatusChanged += (connected, message) => PostEvent("scale:status", new { connected, message });
        _scale.Error += message => PostEvent("scale:error", new { message });
    }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        _settings = await _settingsStore.LoadAsync();
        try
        {
            var userData = _runUiSelfTest
                ? Path.Combine(Path.GetTempPath(), $"GoldBar-WebView2-Test-{Environment.ProcessId}")
                : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "GoldBar", "WebView2");
            Directory.CreateDirectory(userData);
            var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: userData);
            await Web.EnsureCoreWebView2Async(environment);
        }
        catch (Exception ex)
        {
            if (_runUiSelfTest)
            {
                WriteUiTestResult(JsonSerializer.Serialize(new { ok = false, phase = "webview-init", error = ex.Message }));
                Application.Current.Shutdown(1);
                return;
            }
            MessageBox.Show(
                "Microsoft Edge WebView2 Runtime is required to run Gold Bar.\n\n" + ex.Message,
                "Gold Bar", MessageBoxButton.OK, MessageBoxImage.Error);
            Close();
            return;
        }

        Web.CoreWebView2.Settings.AreDevToolsEnabled = false;
        Web.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
        Web.CoreWebView2.Settings.IsStatusBarEnabled = false;
        Web.CoreWebView2.WebMessageReceived += OnWebMessageReceived;
        Web.NavigationCompleted += OnNavigationCompleted;

        var renderer = Path.Combine(AppContext.BaseDirectory, "Renderer");
        Web.CoreWebView2.SetVirtualHostNameToFolderMapping(
            "app.goldbar", renderer, CoreWebView2HostResourceAccessKind.DenyCors);
        Web.Source = new Uri("https://app.goldbar/index.html");

        if (_settings.AutoRead && !_runUiSelfTest)
            await _scale.ConnectAsync(_settings);
    }

    private async void OnNavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
    {
        if (!_runUiSelfTest || _uiSelfTestStarted) return;
        _uiSelfTestStarted = true;

        try
        {
            await Task.Delay(900);

            const string script = """
(() => {
  const base = window.__goldbarSelfTest ? window.__goldbarSelfTest() : { ok: false, reason: 'base-test-missing' };
  const calcProbe = window.__goldbarCalculationProbe ? window.__goldbarCalculationProbe() : { ok: false, reason: 'calc-probe-missing' };
  const actualLayout = window.__goldbarLayoutProbe ? window.__goldbarLayoutProbe() : { ok: false, reason: 'layout-probe-missing' };
  const r3 = window.__goldbarR3Probe ? window.__goldbarR3Probe() : { ok: false, reason: 'r3-probe-missing' };

  const resolutionCases = [
    [960, 640], [1280, 720], [1366, 768], [1536, 864], [1600, 900], [1920, 1080], [2560, 1440]
  ].map(([w, h]) => {
    const scale = Math.max(0.35, Math.min(w / 1536, h / 1024));
    const rootW = 1536 * scale;
    const rootH = 1024 * scale;
    return { w, h, scale, rootW, rootH, ok: rootW <= w + 0.01 && rootH <= h + 0.01 };
  });
  const resolutionFormulaOk = resolutionCases.every(x => x.ok);

  const title = () => document.querySelector('.dash-title span:last-child')?.textContent?.trim() || '';
  const nav = [...document.querySelectorAll('.nav-item')];
  const clickNav = label => {
    const btn = nav.find(b => (b.textContent || '').includes(label));
    if (!btn) return false;
    btn.click();
    return btn.classList.contains('active');
  };
  const num = value => Number(String(value ?? '').replace(/,/g, ''));
  const summaryValues = () => [...document.querySelectorAll('.summary-card .metric-value')].map(el => num(el.textContent));

  const weight = document.querySelector('#weightInput');
  const assay = document.querySelector('#purityInput');
  const description = document.querySelector('#descriptionInput');

  weight.value = '321.123';
  window.__goldbarBridgeTestWeight?.(222.222);
  const autoWeightDoesNotOverwrite = weight.value === '321.123';
  window.__goldbarBridgeArmCapture?.();
  window.__goldbarBridgeTestWeight?.(333.333);
  const manualWeightCaptureWorks = Math.abs(num(weight.value) - 333.333) < 0.0001;

  const before = summaryValues();
  const beforeWeight = Number.isFinite(before[0]) ? before[0] : 0;
  const beforeAverage = Number.isFinite(before[1]) ? before[1] : 0;
  const beforeCount = Number.isFinite(before[2]) ? before[2] : 0;
  const beforeWeighted = beforeWeight * beforeAverage;

  const registerClicked = clickNav('ثبت آبشده');
  weight.value = '۱۲a۳.۴b';
  weight.dispatchEvent(new Event('input', { bubbles: true }));
  const numericPersianOk = weight.value === '123.4';
  description.value = 'توضیحات تست 123';
  description.dispatchEvent(new Event('input', { bubbles: true }));
  const descriptionTextOk = description.value === 'توضیحات تست 123';

  weight.value = '100';
  weight.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  const enterMovesToAssay = document.activeElement === assay;
  assay.value = '740';
  assay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

  weight.value = '50';
  weight.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assay.value = '760';
  assay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

  window.__goldbarRecalculate?.();

  const after = summaryValues();
  const expectedWeight = beforeWeight + 150;
  const expectedWeighted = beforeWeighted + (100 * 740) + (50 * 760);
  const expectedAverage = expectedWeight > 0 ? expectedWeighted / expectedWeight : 0;
  const expectedCount = beforeCount + 2;
  const summaryMathOk = Math.abs(after[0] - expectedWeight) < 0.002
    && Math.abs(after[1] - expectedAverage) < 0.002
    && after[2] === expectedCount;

  document.querySelector('#quickClearAll')?.click();
  const clearFieldsOnly = weight.value === '' && assay.value === '' && description.value === '';

  const meltsClicked = clickNav('آبشده‌ها');
  const meltsText = document.querySelector('#pageHost')?.textContent || '';
  const meltsNav = meltsClicked && title() === 'آبشده‌ها' && document.querySelector('#pageHost')?.classList.contains('active');
  const quickSaved = meltsText.includes('100') && meltsText.includes('740') && meltsText.includes('50') && meltsText.includes('760');
  const clearPreservedEntries = quickSaved;

  clickNav('داشبورد');
  document.querySelector('.view-all')?.click();
  const viewAllWorks = title() === 'آبشده‌ها' && document.querySelector('#pageHost')?.classList.contains('active');

  const assayNav = clickNav('محاسبات عیار');
  const calcCards = [...document.querySelectorAll('.calc-card')];
  const calcInputs0 = calcCards[0] ? [...calcCards[0].querySelectorAll('input')] : [];
  const calcInputs1 = calcCards[1] ? [...calcCards[1].querySelectorAll('input')] : [];
  if (calcInputs0[0]) calcInputs0[0].value = '747';
  if (calcInputs0[1]) calcInputs0[1].value = '995';
  if (calcInputs1[0]) calcInputs1[0].value = '747';
  if (calcInputs1[1]) calcInputs1[1].value = '45';
  window.__goldbarRecalculate?.();
  const silverBefore = Number(calcCards[1]?.dataset.silverRequired || NaN);
  if (calcInputs1[1]) {
    calcInputs1[1].value = '30';
    calcInputs1[1].dispatchEvent(new Event('input', { bubbles: true }));
  }
  const silverAfter = Number(calcCards[1]?.dataset.silverRequired || NaN);
  const silverRefreshWorks = Number.isFinite(silverBefore) && Number.isFinite(silverAfter) && Math.abs(silverAfter - silverBefore) > 0.000001;
  if (calcInputs1[1]) {
    calcInputs1[1].value = '45';
    calcInputs1[1].dispatchEvent(new Event('input', { bubbles: true }));
  }
  const calcWeightShown = num(calcCards[1]?.querySelectorAll('.mini-stats b')[1]?.textContent);
  const calcRequiredShown = num(calcCards[1]?.querySelector('.wide-stat b')?.textContent);
  const topRequiredShown = num(document.querySelectorAll('.summary-card .metric-value')[3]?.textContent);
  const calculationUiWired = assayNav
    && Math.abs(calcWeightShown - expectedWeight) < 0.002
    && Number.isFinite(calcRequiredShown)
    && Math.abs(Math.max(0, calcRequiredShown) - topRequiredShown) < 0.002;

  const interval = document.querySelector('#readInterval');
  const decimals = document.querySelector('#decimals');
  interval.value = '8e0x0';
  interval.dispatchEvent(new Event('input', { bubbles: true }));
  decimals.value = '9x';
  decimals.dispatchEvent(new Event('input', { bubbles: true }));
  const settingsNumericOk = interval.value === '800' && decimals.value === '6';

  const reportsClicked = clickNav('گزارش‌ها');
  const reportText = document.querySelector('#pageHost')?.textContent || '';
  const reportsWork = reportsClicked && title() === 'گزارش‌ها' && reportText.includes('تعداد آبشده‌ها') && reportText.includes(String(expectedCount));

  const settingsClicked = clickNav('تنظیمات');
  const settingsWork = settingsClicked && title() === 'تنظیمات';
  const quickCalcClicked = clickNav('محاسبه سریع');
  const quickCalcWork = quickCalcClicked && title() === 'محاسبه سریع';
  const dashboardClicked = clickNav('داشبورد');
  const dashboardWork = dashboardClicked && title() === 'داشبورد';

  const labelsOk = document.querySelector('.recent-card h3')?.textContent.trim() === 'آبشده‌های ثبت شده'
    && document.querySelectorAll('.calc-card h3')[0]?.textContent.trim() === 'افزایش عیار'
    && document.querySelectorAll('.calc-card h3')[1]?.textContent.trim() === 'عیار';

  return {
    ok: Boolean(base.ok && calcProbe.ok && actualLayout.ok && r3.ok && resolutionFormulaOk
      && autoWeightDoesNotOverwrite && manualWeightCaptureWorks && silverRefreshWorks
      && registerClicked && numericPersianOk && descriptionTextOk && enterMovesToAssay
      && summaryMathOk && clearFieldsOnly && clearPreservedEntries && meltsNav && viewAllWorks
      && calculationUiWired && settingsNumericOk && reportsWork && settingsWork
      && quickCalcWork && dashboardWork && labelsOk),
    base, calcProbe, actualLayout, r3, resolutionCases, resolutionFormulaOk,
    autoWeightDoesNotOverwrite, manualWeightCaptureWorks, silverRefreshWorks,
    registerClicked, numericPersianOk, descriptionTextOk, enterMovesToAssay,
    summaryMathOk, expectedWeight, expectedAverage, expectedCount, after,
    clearFieldsOnly, clearPreservedEntries, meltsNav, viewAllWorks, calculationUiWired,
    calcWeightShown, calcRequiredShown, topRequiredShown, settingsNumericOk,
    reportsWork, settingsWork, quickCalcWork, dashboardWork, labelsOk
  };
})()
""";

            var json = await Web.ExecuteScriptAsync(script);
            WriteUiTestResult(json);
            using var doc = JsonDocument.Parse(json);
            var ok = doc.RootElement.TryGetProperty("ok", out var okElement) && okElement.GetBoolean();
            Application.Current.Shutdown(ok ? 0 : 1);
        }
        catch (Exception ex)
        {
            WriteUiTestResult(JsonSerializer.Serialize(new { ok = false, phase = "exception", error = ex.ToString() }));
            Application.Current.Shutdown(1);
        }
    }

    private static void WriteUiTestResult(string json)
    {
        try
        {
            File.WriteAllText(Path.Combine(Path.GetTempPath(), "goldbar-ui-self-test.json"), json);
        }
        catch { }
    }

    private async void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        string? id = null;
        try
        {
            using var doc = JsonDocument.Parse(e.WebMessageAsJson);
            var root = doc.RootElement;
            if (root.GetProperty("kind").GetString() != "request") return;
            id = root.GetProperty("id").GetString();
            var action = root.GetProperty("action").GetString() ?? string.Empty;
            var payload = root.TryGetProperty("payload", out var p) ? p : default;
            object? result = action switch
            {
                "window:minimize" => Do(() => WindowState = System.Windows.WindowState.Minimized),
                "window:maximizeToggle" => Do(() => WindowState = WindowState == System.Windows.WindowState.Maximized ? System.Windows.WindowState.Normal : System.Windows.WindowState.Maximized),
                "window:drag" => BeginWindowDrag(),
                "window:close" => Do(Close),
                "settings:get" => _settings,
                "settings:save" => await SaveSettingsAsync(payload),
                "settings:reset" => await ResetSettingsAsync(),
                "scale:listPorts" => new { ports = SerialPort.GetPortNames().OrderBy(x => x, StringComparer.OrdinalIgnoreCase).ToArray(), selected = _settings.Port },
                "scale:connect" => new { ok = await _scale.ConnectAsync(_settings) },
                "scale:disconnect" => Do(() => _scale.Disconnect()),
                "scale:read" => new { ok = await EnsureAndReadScaleAsync() },
                "report:chooseDirectory" => await ChooseReportDirectoryAsync(),
                "report:save" => SaveReport(payload),
                _ => throw new InvalidOperationException($"Unknown action: {action}")
            };
            Reply(id, true, result, null);
        }
        catch (Exception ex)
        {
            Reply(id, false, null, ex.Message);
        }
    }

    private object BeginWindowDrag()
    {
        try
        {
            if (WindowState == System.Windows.WindowState.Maximized)
                WindowState = System.Windows.WindowState.Normal;
            var handle = new WindowInteropHelper(this).Handle;
            ReleaseCapture();
            SendMessage(handle, WmNcLButtonDown, (nint)HtCaption, 0);
            return new { ok = true };
        }
        catch (Exception ex)
        {
            return new { ok = false, error = ex.Message };
        }
    }

    private async Task<ScaleSettings> SaveSettingsAsync(JsonElement payload)
    {
        var next = payload.Deserialize<ScaleSettings>(_json) ?? ScaleSettings.Defaults();
        // The renderer settings forms do not send these two fields; keep the stored
        // values instead of silently resetting them to defaults.
        if (!payload.TryGetProperty("scaleName", out var scaleName) ||
            scaleName.ValueKind == JsonValueKind.Null || string.IsNullOrWhiteSpace(scaleName.GetString()))
            next.ScaleName = _settings.ScaleName;
        if (!payload.TryGetProperty("reportDirectory", out var reportDir) ||
            reportDir.ValueKind == JsonValueKind.Null || string.IsNullOrWhiteSpace(reportDir.GetString()))
            next.ReportDirectory = _settings.ReportDirectory;

        _settings = await _settingsStore.SaveAsync(next);
        if (_scale.IsConnected) await _scale.ConnectAsync(_settings);
        else _scale.ApplySettings(_settings);
        return _settings;
    }

    private async Task<ScaleSettings> ResetSettingsAsync()
    {
        _settings = await _settingsStore.ResetAsync();
        if (_scale.IsConnected) await _scale.ConnectAsync(_settings);
        return _settings;
    }

    private async Task<object> ChooseReportDirectoryAsync()
    {
        var dialog = new OpenFolderDialog
        {
            Title = "انتخاب محل ذخیره گزارش‌های Gold Bar",
            Multiselect = false,
            InitialDirectory = Directory.Exists(_settings.ReportDirectory)
                ? _settings.ReportDirectory
                : ScaleSettings.GetDefaultReportDirectory()
        };

        if (dialog.ShowDialog(this) != true)
            return new { ok = false, path = _settings.ReportDirectory };

        _settings.ReportDirectory = dialog.FolderName;
        _settings = await _settingsStore.SaveAsync(_settings);
        return new { ok = true, path = _settings.ReportDirectory };
    }

    private object SaveReport(JsonElement payload)
    {
        var request = payload.Deserialize<ReportRequest>(_json) ?? new ReportRequest();
        var path = _reportService.SaveXlsx(_settings.ReportDirectory, request);
        return new { ok = true, path, directory = _settings.ReportDirectory, count = request.Entries.Count };
    }

    private async Task<bool> EnsureAndReadScaleAsync()
    {
        if (!_scale.IsConnected && !await _scale.ConnectAsync(_settings)) return false;
        return await _scale.RequestWeightAsync();
    }

    private object Do(Action action) { action(); return new { ok = true }; }

    private void Reply(string? id, bool ok, object? data, string? error)
    {
        if (string.IsNullOrWhiteSpace(id) || Web.CoreWebView2 is null) return;
        var json = JsonSerializer.Serialize(new { kind = "response", id, ok, data, error }, _json);
        Web.CoreWebView2.PostWebMessageAsJson(json);
    }

    private void PostEvent(string name, object data)
    {
        _ = Dispatcher.InvokeAsync(() =>
        {
            if (Web.CoreWebView2 is null) return;
            var json = JsonSerializer.Serialize(new { kind = "event", @event = name, data }, _json);
            Web.CoreWebView2.PostWebMessageAsJson(json);
        });
    }
}
