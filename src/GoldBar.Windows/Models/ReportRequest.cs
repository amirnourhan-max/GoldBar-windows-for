namespace GoldBar.Windows.Models;

public sealed class ReportRequest
{
    public List<ReportEntry> Entries { get; set; } = [];
    public ReportSection IncreaseAssay { get; set; } = new();
    public ReportSection Assay { get; set; } = new();
    public ReportSection QuickCalculation { get; set; } = new();
    public ReportSection AssayCost { get; set; } = new();
}

public sealed class ReportEntry
{
    public string? Id { get; set; }
    public double Weight { get; set; }
    public double Assay { get; set; }
    public string Description { get; set; } = string.Empty;
    public string CreatedAt { get; set; } = string.Empty;
}

public sealed class ReportSection
{
    public List<ReportField> Fields { get; set; } = [];
}

public sealed class ReportField
{
    public string Label { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
    public string Unit { get; set; } = string.Empty;
}
