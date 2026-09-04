using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using GoldBar.Windows.Models;

namespace GoldBar.Windows.Services;

public sealed class ReportImportService
{
    private static readonly XNamespace Ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

    public ReportRequest LoadXlsx(string path)
    {
        if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
            throw new FileNotFoundException("فایل گزارش پیدا نشد.", path);
        if (!string.Equals(Path.GetExtension(path), ".xlsx", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("فقط فایل گزارش Excel با پسوند xlsx قابل وارد کردن است.");

        using var zip = ZipFile.OpenRead(path);
        var result = new ReportRequest();

        LoadMelts(zip, result);
        result.IncreaseAssay = LoadSection(zip, "xl/worksheets/sheet2.xml");
        result.Assay = LoadSection(zip, "xl/worksheets/sheet3.xml");
        result.QuickCalculation = LoadSection(zip, "xl/worksheets/sheet4.xml");
        result.AssayCost = LoadSection(zip, "xl/worksheets/sheet5.xml");

        var hasSectionData = result.IncreaseAssay.Fields.Count > 0 ||
                             result.Assay.Fields.Count > 0 ||
                             result.QuickCalculation.Fields.Count > 0 ||
                             result.AssayCost.Fields.Count > 0;
        if (result.Entries.Count == 0 && !hasSectionData)
            throw new InvalidDataException("هیچ اطلاعات معتبری داخل فایل گزارش پیدا نشد.");

        return result;
    }

    private static void LoadMelts(ZipArchive zip, ReportRequest result)
    {
        var sheet = zip.GetEntry("xl/worksheets/sheet1.xml");
        if (sheet is null) return;

        using var stream = sheet.Open();
        var doc = XDocument.Load(stream);
        foreach (var row in doc.Descendants(Ns + "row"))
        {
            var cells = row.Elements(Ns + "c").ToDictionary(CellColumn, CellValue, StringComparer.OrdinalIgnoreCase);
            if (cells.TryGetValue("A", out var first) && first.Contains("خلاصه", StringComparison.OrdinalIgnoreCase))
                break;
            if (!TryNumber(cells.GetValueOrDefault("B"), out var weight) ||
                !TryNumber(cells.GetValueOrDefault("C"), out var assay))
                continue;
            if (!(weight > 0) || !(assay > 0 && assay <= 1000))
                continue;

            result.Entries.Add(new ReportEntry
            {
                Id = Guid.NewGuid().ToString("N"),
                Weight = weight,
                Assay = assay,
                Description = cells.GetValueOrDefault("D") ?? string.Empty,
                CreatedAt = NormalizeCreatedAt(cells.GetValueOrDefault("E"))
            });
        }
    }

    private static ReportSection LoadSection(ZipArchive zip, string entryName)
    {
        var section = new ReportSection();
        var sheet = zip.GetEntry(entryName);
        if (sheet is null) return section; // Backward compatibility with old one-sheet reports.

        using var stream = sheet.Open();
        var doc = XDocument.Load(stream);
        foreach (var row in doc.Descendants(Ns + "row"))
        {
            var rowNumber = (int?)row.Attribute("r") ?? 0;
            if (rowNumber < 5) continue;

            var cells = row.Elements(Ns + "c").ToDictionary(CellColumn, CellValue, StringComparer.OrdinalIgnoreCase);
            var label = (cells.GetValueOrDefault("A") ?? string.Empty).Trim();
            var value = (cells.GetValueOrDefault("B") ?? string.Empty).Trim();
            var unit = (cells.GetValueOrDefault("C") ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(label) && string.IsNullOrWhiteSpace(value)) continue;
            if (label.Contains("اطلاعاتی برای این بخش", StringComparison.OrdinalIgnoreCase)) continue;

            section.Fields.Add(new ReportField { Label = label, Value = value, Unit = unit });
        }
        return section;
    }

    private static string CellColumn(XElement cell)
    {
        var reference = (string?)cell.Attribute("r") ?? string.Empty;
        var match = Regex.Match(reference, "^[A-Za-z]+");
        return match.Success ? match.Value.ToUpperInvariant() : string.Empty;
    }

    private static string CellValue(XElement cell)
    {
        var type = (string?)cell.Attribute("t") ?? string.Empty;
        if (string.Equals(type, "inlineStr", StringComparison.OrdinalIgnoreCase))
            return string.Concat(cell.Descendants(Ns + "t").Select(x => x.Value));
        return cell.Element(Ns + "v")?.Value ?? string.Empty;
    }

    private static bool TryNumber(string? value, out double result)
    {
        var normalized = NormalizeDigits(value ?? string.Empty).Replace(',', '.');
        return double.TryParse(normalized, NumberStyles.Float, CultureInfo.InvariantCulture, out result) && double.IsFinite(result);
    }

    private static string NormalizeCreatedAt(string? value)
    {
        var raw = (value ?? string.Empty).Trim();
        if (DateTime.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.AllowWhiteSpaces, out var parsed) ||
            DateTime.TryParse(raw, CultureInfo.CurrentCulture, DateTimeStyles.AllowWhiteSpaces, out parsed))
            return parsed.ToString("O", CultureInfo.InvariantCulture);

        var normalized = NormalizeDigits(raw);
        var match = Regex.Match(normalized, @"(?<y>\d{4})\D+(?<m>\d{1,2})\D+(?<d>\d{1,2})(?:\D+(?<h>\d{1,2}):(?<min>\d{2}))?");
        if (match.Success)
        {
            var y = int.Parse(match.Groups["y"].Value, CultureInfo.InvariantCulture);
            var m = int.Parse(match.Groups["m"].Value, CultureInfo.InvariantCulture);
            var d = int.Parse(match.Groups["d"].Value, CultureInfo.InvariantCulture);
            var h = match.Groups["h"].Success ? int.Parse(match.Groups["h"].Value, CultureInfo.InvariantCulture) : 0;
            var min = match.Groups["min"].Success ? int.Parse(match.Groups["min"].Value, CultureInfo.InvariantCulture) : 0;
            try
            {
                DateTime dt;
                if (y < 1700)
                    dt = new PersianCalendar().ToDateTime(y, m, d, h, min, 0, 0);
                else
                    dt = new DateTime(y, m, d, h, min, 0, DateTimeKind.Local);
                return dt.ToString("O", CultureInfo.InvariantCulture);
            }
            catch { }
        }
        return DateTime.Now.ToString("O", CultureInfo.InvariantCulture);
    }

    private static string NormalizeDigits(string value)
    {
        const string fa = "۰۱۲۳۴۵۶۷۸۹";
        const string ar = "٠١٢٣٤٥٦٧٨٩";
        var chars = value.ToCharArray();
        for (var i = 0; i < chars.Length; i++)
        {
            var fi = fa.IndexOf(chars[i]);
            if (fi >= 0) { chars[i] = (char)('0' + fi); continue; }
            var ai = ar.IndexOf(chars[i]);
            if (ai >= 0) chars[i] = (char)('0' + ai);
        }
        return new string(chars);
    }
}
