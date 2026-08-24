using System.IO;

namespace GoldBar.Windows.Core;

public static class R11SelfTest
{
    public static int Run(TextWriter output)
    {
        var failures = new List<string>();
        void Check(bool condition, string name)
        {
            if (condition) output.WriteLine($"PASS: {name}");
            else { output.WriteLine($"FAIL: {name}"); failures.Add(name); }
        }

        var credentialPath = Path.Combine(Path.GetTempPath(), $"GoldBar-R11-Credential-{Guid.NewGuid():N}.json");
        try
        {
            var store = new CredentialStore(credentialPath);
            store.Register("amir-r11", "old-1234");
            store.ChangePassword("amir-r11", "old-1234", "new-5678");
            Check(!store.Verify("amir-r11", "old-1234"), "Old password is rejected after password change");
            Check(store.Verify("amir-r11", "new-5678"), "New password is accepted after password change");
            var raw = File.ReadAllText(credentialPath);
            Check(!raw.Contains("old-1234", StringComparison.Ordinal) && !raw.Contains("new-5678", StringComparison.Ordinal),
                "Changed password is never stored as plaintext");
        }
        catch (Exception ex)
        {
            output.WriteLine("FAIL: R11 credential test exception: " + ex);
            failures.Add("R11 credential test exception");
        }
        finally
        {
            try { if (File.Exists(credentialPath)) File.Delete(credentialPath); } catch { }
        }

        // Exact Excel reference: AB6 = (Z6 / 100) * Y6.
        // For the uploaded workbook sample: 45% * 13.492570281124472 = 6.071656626506012 g.
        var summary = new AssaySummary(353.11, 273852.12, 775.5433717538443, 7);
        var alloy = AssayFormulaReference.Alloy(summary, 747, 45, 353.11);
        Check(Math.Abs(alloy.SilverRequired - 6.071656626506012) < 1e-9,
            "Dashboard silver reference equals workbook AB6");

        output.WriteLine(failures.Count == 0 ? "R11-SELF-TEST: PASS" : $"R11-SELF-TEST: FAIL ({failures.Count})");
        return failures.Count == 0 ? 0 : 1;
    }
}
