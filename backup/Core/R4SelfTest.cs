using System.IO;
using System.Windows;
using GoldBar.Windows.Models;
using GoldBar.Windows.Services;

namespace GoldBar.Windows.Core;

public static class R4SelfTest
{
    public static int Run(TextWriter output)
    {
        var failures = new List<string>();
        void Check(bool condition, string name)
        {
            if (condition) output.WriteLine($"PASS: {name}");
            else { output.WriteLine($"FAIL: {name}"); failures.Add(name); }
        }

        Check(R4WindowPolicy.StartupState(false) == WindowState.Normal, "Normal startup is windowed, not minimized or maximized");
        Check(R4WindowPolicy.StartupState(true) == WindowState.Maximized, "UI self-test startup remains visible");
        Check(new ScaleSettings { ScaleName = "  ترازو کارگاه  " }.Normalize().ScaleName == "ترازو کارگاه", "Scale name is persisted and normalized");

        var temp = Path.Combine(Path.GetTempPath(), "GoldBar-R4-SelfTest-" + Guid.NewGuid().ToString("N"));
        try
        {
            var request = new ReportRequest
            {
                Entries =
                [
                    new ReportEntry { Id = "1", Weight = 100.125, Assay = 750, Description = "نمونه اول", CreatedAt = DateTime.Now.AddMinutes(-1).ToString("O") },
                    new ReportEntry { Id = "2", Weight = 50.5, Assay = 740, Description = "نمونه دوم", CreatedAt = DateTime.Now.ToString("O") }
                ]
            };
            var saved = new ReportService().SaveXlsx(temp, request);
            var imported = new ReportImportService().LoadXlsx(saved);
            Check(File.Exists(saved) && string.Equals(Path.GetExtension(saved), ".xlsx", StringComparison.OrdinalIgnoreCase), "Excel XLSX report is created");
            Check(imported.Entries.Count == 2, "Excel report imports all melts");
            Check(Math.Abs(imported.Entries[0].Weight - 100.125) < 0.000001 && imported.Entries[0].Assay == 750,
                "Imported melt values match saved report");
            Check(imported.Entries[1].Description == "نمونه دوم", "Imported description matches saved report");
        }
        catch (Exception ex)
        {
            output.WriteLine("FAIL: Report roundtrip exception: " + ex);
            failures.Add("Report roundtrip exception");
        }
        finally
        {
            try { if (Directory.Exists(temp)) Directory.Delete(temp, true); } catch { }
        }

        output.WriteLine(failures.Count == 0 ? "R4-SELF-TEST: PASS" : $"R4-SELF-TEST: FAIL ({failures.Count})");
        return failures.Count == 0 ? 0 : 1;
    }
}
