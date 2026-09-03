using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Security;
using System.Text;
using GoldBar.Windows.Models;

namespace GoldBar.Windows.Services;

public sealed class ReportService
{
    public string SaveXlsx(string directory, ReportRequest request)
    {
        if (string.IsNullOrWhiteSpace(directory))
            throw new InvalidOperationException("محل ذخیره گزارش مشخص نشده است.");

        Directory.CreateDirectory(directory);
        var safeStamp = DateTime.Now.ToString("yyyy-MM-dd_HH-mm-ss", CultureInfo.InvariantCulture);
        var path = Path.Combine(directory, $"GoldBar_Report_{safeStamp}.xlsx");
        var suffix = 1;
        while (File.Exists(path))
            path = Path.Combine(directory, $"GoldBar_Report_{safeStamp}_{suffix++}.xlsx");

        var valid = (request.Entries ?? [])
            .Where(e => double.IsFinite(e.Weight) && double.IsFinite(e.Assay) && e.Weight > 0 && e.Assay > 0)
            .ToList();
        var totalWeight = valid.Sum(e => e.Weight);
        var weighted = valid.Sum(e => e.Weight * e.Assay);
        var average = totalWeight > 0 ? weighted / totalWeight : 0d;

        using var file = File.Create(path);
        using var zip = new ZipArchive(file, ZipArchiveMode.Create, leaveOpen: false, Encoding.UTF8);

        Write(zip, "[Content_Types].xml", ContentTypesXml());
        Write(zip, "_rels/.rels", RootRelsXml());
        Write(zip, "xl/workbook.xml", WorkbookXml());
        Write(zip, "xl/_rels/workbook.xml.rels", WorkbookRelsXml());
        Write(zip, "xl/styles.xml", StylesXml());
        Write(zip, "xl/worksheets/sheet1.xml", MeltsSheetXml(valid, totalWeight, average));
        Write(zip, "xl/worksheets/sheet2.xml", SectionSheetXml("افزایش عیار", request.IncreaseAssay));
        Write(zip, "xl/worksheets/sheet3.xml", SectionSheetXml("عیار", request.Assay));
        Write(zip, "xl/worksheets/sheet4.xml", SectionSheetXml("محاسبه سریع", request.QuickCalculation));
        Write(zip, "xl/worksheets/sheet5.xml", SectionSheetXml("هزینه عیار", request.AssayCost));

        return path;
    }

    private static void Write(ZipArchive zip, string name, string content)
    {
        var entry = zip.CreateEntry(name, CompressionLevel.Optimal);
        using var stream = entry.Open();
        using var writer = new StreamWriter(stream, new UTF8Encoding(false));
        writer.Write(content);
    }

    private static string Esc(string? value) => SecurityElement.Escape(value ?? string.Empty) ?? string.Empty;
    private static string Num(double value) => value.ToString("0.###############", CultureInfo.InvariantCulture);

    private static string TextCell(string reference, string value, int style = 0) =>
        $"<c r=\"{reference}\" t=\"inlineStr\" s=\"{style}\"><is><t xml:space=\"preserve\">{Esc(value)}</t></is></c>";

    private static string NumberCell(string reference, double value, int style = 0) =>
        $"<c r=\"{reference}\" s=\"{style}\"><v>{Num(value)}</v></c>";

    private static string MeltsSheetXml(IReadOnlyList<ReportEntry> entries, double totalWeight, double average)
    {
        var sb = BeginSheet();
        sb.Append("<cols><col min=\"1\" max=\"1\" width=\"8\" customWidth=\"1\"/><col min=\"2\" max=\"3\" width=\"16\" customWidth=\"1\"/><col min=\"4\" max=\"4\" width=\"38\" customWidth=\"1\"/><col min=\"5\" max=\"5\" width=\"24\" customWidth=\"1\"/></cols>");
        sb.Append("<sheetData>");
        sb.Append($"<row r=\"1\" ht=\"26\" customHeight=\"1\">{TextCell("A1", "GOLD BAR - گزارش آبشده‌ها", 2)}</row>");
        sb.Append($"<row r=\"2\">{TextCell("A2", $"تاریخ ذخیره: {DateTime.Now:yyyy/MM/dd HH:mm:ss}")}</row>");
        sb.Append("<row r=\"4\">");
        sb.Append(TextCell("A4", "ردیف", 1));
        sb.Append(TextCell("B4", "وزن (g)", 1));
        sb.Append(TextCell("C4", "عیار (‰)", 1));
        sb.Append(TextCell("D4", "توضیحات", 1));
        sb.Append(TextCell("E4", "تاریخ ثبت", 1));
        sb.Append("</row>");

        var row = 5;
        for (var i = 0; i < entries.Count; i++, row++)
        {
            var e = entries[i];
            sb.Append($"<row r=\"{row}\">");
            sb.Append(NumberCell($"A{row}", i + 1));
            sb.Append(NumberCell($"B{row}", e.Weight));
            sb.Append(NumberCell($"C{row}", e.Assay));
            sb.Append(TextCell($"D{row}", e.Description));
            sb.Append(TextCell($"E{row}", e.CreatedAt));
            sb.Append("</row>");
        }

        row++;
        sb.Append($"<row r=\"{row}\">{TextCell($"A{row}", "خلاصه", 2)}</row>");
        row++;
        sb.Append($"<row r=\"{row}\">{TextCell($"A{row}", "تعداد آبشده‌ها", 1)}{NumberCell($"B{row}", entries.Count)}</row>");
        row++;
        sb.Append($"<row r=\"{row}\">{TextCell($"A{row}", "وزن کل (g)", 1)}{NumberCell($"B{row}", totalWeight)}</row>");
        row++;
        sb.Append($"<row r=\"{row}\">{TextCell($"A{row}", "عیار میانگین (‰)", 1)}{NumberCell($"B{row}", average)}</row>");
        sb.Append("</sheetData></worksheet>");
        return sb.ToString();
    }

    private static string SectionSheetXml(string title, ReportSection? section)
    {
        var fields = section?.Fields ?? [];
        var sb = BeginSheet();
        sb.Append("<cols><col min=\"1\" max=\"1\" width=\"34\" customWidth=\"1\"/><col min=\"2\" max=\"2\" width=\"24\" customWidth=\"1\"/><col min=\"3\" max=\"3\" width=\"18\" customWidth=\"1\"/></cols>");
        sb.Append("<sheetData>");
        sb.Append($"<row r=\"1\" ht=\"26\" customHeight=\"1\">{TextCell("A1", $"GOLD BAR - {title}", 2)}</row>");
        sb.Append($"<row r=\"2\">{TextCell("A2", $"تاریخ ذخیره: {DateTime.Now:yyyy/MM/dd HH:mm:ss}")}</row>");
        sb.Append($"<row r=\"4\">{TextCell("A4", "عنوان", 1)}{TextCell("B4", "مقدار", 1)}{TextCell("C4", "واحد", 1)}</row>");

        var row = 5;
        foreach (var field in fields)
        {
            if (string.IsNullOrWhiteSpace(field.Label) && string.IsNullOrWhiteSpace(field.Value)) continue;
            sb.Append($"<row r=\"{row}\">{TextCell($"A{row}", field.Label)}{TextCell($"B{row}", field.Value)}{TextCell($"C{row}", field.Unit)}</row>");
            row++;
        }

        if (row == 5)
            sb.Append($"<row r=\"5\">{TextCell("A5", "اطلاعاتی برای این بخش ثبت نشده است.")}</row>");

        sb.Append("</sheetData></worksheet>");
        return sb.ToString();
    }

    private static StringBuilder BeginSheet()
    {
        var sb = new StringBuilder(8192);
        sb.Append("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>");
        sb.Append("<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">");
        sb.Append("<sheetViews><sheetView workbookViewId=\"0\" rightToLeft=\"1\"/></sheetViews>");
        return sb;
    }

    private static string ContentTypesXml() => """
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet4.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet5.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>
""";

    private static string RootRelsXml() => """
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>
""";

    private static string WorkbookXml() => """
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="آبشده‌ها" sheetId="1" r:id="rId1"/>
    <sheet name="افزایش عیار" sheetId="2" r:id="rId2"/>
    <sheet name="عیار" sheetId="3" r:id="rId3"/>
    <sheet name="محاسبه سریع" sheetId="4" r:id="rId4"/>
    <sheet name="هزینه عیار" sheetId="5" r:id="rId5"/>
  </sheets>
</workbook>
""";

    private static string WorkbookRelsXml() => """
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet4.xml"/>
  <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet5.xml"/>
  <Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>
""";

    private static string StylesXml() => """
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF2C45B"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="3">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>
""";
}
