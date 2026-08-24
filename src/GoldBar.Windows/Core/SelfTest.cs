using System.IO;
using System.IO.Compression;
using System.Text;
using GoldBar.Windows.Models;
using GoldBar.Windows.Services;

namespace GoldBar.Windows.Core;

public static class SelfTest
{
    public static int Run(TextWriter output)
    {
        var failures = new List<string>();
        void Check(bool condition, string name)
        {
            if (condition) output.WriteLine($"PASS: {name}");
            else { output.WriteLine($"FAIL: {name}"); failures.Add(name); }
        }

        var credentialPath = Path.Combine(Path.GetTempPath(), $"GoldBar-Credential-Test-{Guid.NewGuid():N}.json");
        try
        {
            var credentials = new CredentialStore(credentialPath);
            Check(!credentials.IsRegistered, "Fresh install has no registered user");
            credentials.Register("amir-test", "pass-1234");
            Check(credentials.IsRegistered && credentials.RegisteredUsername == "amir-test", "First-run registration persists username");
            Check(credentials.Verify("amir-test", "pass-1234"), "Registered credentials allow login");
            Check(!credentials.Verify("amir-test", "wrong"), "Wrong password is rejected");
            Check(!credentials.Verify("wrong-user", "pass-1234"), "Wrong username is rejected");
            var raw = File.ReadAllText(credentialPath);
            Check(!raw.Contains("pass-1234", StringComparison.Ordinal), "Password is never stored as plaintext");
        }
        catch (Exception ex)
        {
            output.WriteLine("FAIL: Credential store exception: " + ex);
            failures.Add("Credential store exception");
        }
        finally
        {
            try { if (File.Exists(credentialPath)) File.Delete(credentialPath); } catch { }
        }

        // Reference values taken from the original Golde Bar1-1.xlsx workbook.
        var workbookSummary = new AssaySummary(353.11, 273852.12, 775.5433717538443, 7);
        var increase = AssayFormulaReference.Increase(workbookSummary, 747, 995);
        var alloy = AssayFormulaReference.Alloy(workbookSummary, 747, 45, 353.11);
        var split = AssayFormulaReference.Split(800, 36.79, 63.21);
        var correction = AssayFormulaReference.CorrectionForDrop(250, 750, 1);
        Check(Math.Abs(increase.RequiredBar - (-40.6)) < 1e-9, "Workbook increase-assay formula matches -40.6 g");
        Check(Math.Abs(alloy.TotalAlloyRequired - 13.492570281124472) < 1e-9, "Workbook total-alloy formula matches reference");
        Check(Math.Abs(alloy.SilverRequired - 6.071656626506012) < 1e-9, "Workbook silver formula matches reference");
        Check(Math.Abs(alloy.NonSilverRequired - 7.4209136546184595) < 1e-9, "Workbook non-silver formula matches reference");
        Check(Math.Abs(alloy.FourPerThousand - 1.4124400000000001) < 1e-9, "Workbook 0.4-percent formula matches reference");
        Check(Math.Abs(alloy.FinalOtherAlloy - 6.008473654618459) < 1e-9, "Workbook final-other-alloy formula matches reference");
        Check(Math.Abs(split.Gold995 - 294.32) < 1e-9 && Math.Abs(split.Gold750 - 505.68) < 1e-9,
            "Workbook 36.79/63.21 split matches reference");
        Check(Math.Abs(correction - 0.33377837116154296) < 1e-9, "Workbook assay-drop correction matches reference");

        // Scale parser regression tests.
        Check(WeightParser.Parse("ST,+ 214.373 g", 3) == 214.373, "WeightParser parses standard scale payload");
        Check(WeightParser.Parse("ST,+    214.373 g", 3) == 214.373, "WeightParser accepts spaces after sign");
        Check(WeightParser.Parse("WT=102,500", 3) == 102.5, "WeightParser accepts comma decimal");
        Check(WeightParser.Parse("+000214.373", 3) == 214.373, "WeightParser accepts zero-padded weight");
        Check(WeightParser.Parse("garbage", 3) is null, "WeightParser rejects nonnumeric payload");

        var decoder = new ScaleFrameDecoder();
        var fragmented1 = decoder.Push(Encoding.ASCII.GetBytes("ST,+ 214."));
        var fragmented2 = decoder.Push(Encoding.ASCII.GetBytes("373 g\r\nWT=102,500\r\n"));
        Check(fragmented1.Count == 0 && fragmented2.Count == 2,
            "Scale frame decoder reconstructs fragmented and batched CR/LF packets");
        Check(WeightParser.Parse(fragmented2[0], 3) == 214.373 && WeightParser.Parse(fragmented2[1], 3) == 102.5,
            "Decoded scale frames preserve both weights in order");

        decoder.Reset();
        var stxEtx = decoder.Push([0x02, .. Encoding.ASCII.GetBytes("+12.345 g"), 0x03]);
        Check(stxEtx.Count == 1 && WeightParser.Parse(stxEtx[0], 3) == 12.345,
            "Scale frame decoder supports STX/ETX packets");

        decoder.Reset();
        decoder.Push(Encoding.ASCII.GetBytes("WT=88.125 g"));
        var idleFrame = decoder.FlushIdle();
        Check(idleFrame is not null && WeightParser.Parse(idleFrame, 3) == 88.125,
            "Scale frame decoder supports unterminated idle-flush packets");

        var median = new MedianStabilizer(3);
        median.Push(100.0); median.Push(999.0);
        Check(Math.Abs(median.Push(101.0) - 101.0) < 0.000001, "Median helper remains available but is not used in live scale path");

        using (var scale = new ScaleService())
        {
            var diagnostic = scale.TestAsync(new ScaleSettings
            {
                ScaleName = "ترازوی تست",
                Port = "COM65535",
                AutoRead = false
            }, 500).GetAwaiter().GetResult();
            Check(!diagnostic.Ok && diagnostic.Message.Contains("پیدا نشد", StringComparison.Ordinal),
                "Scale diagnostic reports a useful missing-COM error");
        }

        var s = new ScaleSettings
        {
            ScaleName = "  ترازو کارگاه  ", Port = " ", BaudRate = 50, DataBits = 99, Parity = "bad", StopBits = 9,
            FlowControl = "bad", ReadIntervalMs = 2, Decimals = 99, RequestCommand = null!,
            ReportDirectory = " "
        }.Normalize();
        Check(s.ScaleName == "ترازو کارگاه", "Scale name normalizes safely");
        Check(s.Port == "COM4", "Settings default COM port");
        Check(s.BaudRate == 300 && s.DataBits == 7 && s.Parity == "Even" && s.StopBits == 2,
              "Serial settings normalize safely");
        Check(s.ReadIntervalMs == 100 && s.Decimals == 6, "Numeric settings clamp safely");
        Check(s.RequestCommand == string.Empty, "Null request command normalized");
        Check(!string.IsNullOrWhiteSpace(s.ReportDirectory) && Path.IsPathFullyQualified(s.ReportDirectory),
              "Report directory has a safe absolute default");

        var reportDir = Path.Combine(Path.GetTempPath(), $"GoldBar-Report-Test-{Guid.NewGuid():N}");
        try
        {
            var request = new ReportRequest
            {
                Entries =
                [
                    new ReportEntry { Id = "1", Weight = 100, Assay = 740, Description = "تست اول", CreatedAt = "1405/05/28 - 12:00" },
                    new ReportEntry { Id = "2", Weight = 50, Assay = 760, Description = "تست دوم", CreatedAt = "1405/05/28 - 12:01" }
                ]
            };
            var path = new ReportService().SaveXlsx(reportDir, request);
            Check(File.Exists(path) && new FileInfo(path).Length > 1000 && string.Equals(Path.GetExtension(path), ".xlsx", StringComparison.OrdinalIgnoreCase),
                "Report is a real XLSX file");

            using var zip = ZipFile.OpenRead(path);
            var contentTypes = zip.GetEntry("[Content_Types].xml");
            var workbook = zip.GetEntry("xl/workbook.xml");
            var sheet = zip.GetEntry("xl/worksheets/sheet1.xml");
            Check(contentTypes is not null && workbook is not null && sheet is not null,
                  "Report XLSX has required OpenXML parts");

            var sheetXml = string.Empty;
            if (sheet is not null)
            {
                using var reader = new StreamReader(sheet.Open());
                sheetXml = reader.ReadToEnd();
            }
            Check(sheetXml.Contains("وزن (g)", StringComparison.Ordinal) &&
                  sheetXml.Contains("عیار (‰)", StringComparison.Ordinal) &&
                  sheetXml.Contains(">740<", StringComparison.Ordinal) &&
                  sheetXml.Contains(">760<", StringComparison.Ordinal) &&
                  sheetXml.Contains("746.666", StringComparison.Ordinal),
                  "Report XLSX contains entries and weighted summary");

            var imported = new ReportImportService().LoadXlsx(path);
            Check(imported.Entries.Count == 2 &&
                  Math.Abs(imported.Entries[0].Weight - 100) < 0.000001 && imported.Entries[0].Assay == 740 &&
                  Math.Abs(imported.Entries[1].Weight - 50) < 0.000001 && imported.Entries[1].Assay == 760,
                  "Saved XLSX imports back without changing melt values");
        }
        catch (Exception ex)
        {
            output.WriteLine("FAIL: Report export/import exception: " + ex);
            failures.Add("Report export/import exception");
        }
        finally
        {
            try { if (Directory.Exists(reportDir)) Directory.Delete(reportDir, true); } catch { }
        }

        output.WriteLine(failures.Count == 0 ? "SELF-TEST: PASS" : $"SELF-TEST: FAIL ({failures.Count})");
        return failures.Count == 0 ? 0 : 1;
    }
}
