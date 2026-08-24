namespace GoldBar.Windows.Models;

public sealed class ReportRequest
{
    public List<ReportEntry> Entries { get; set; } = [];
    public double AssayCost { get; set; }
}

public sealed class ReportEntry
{
    public string? Id { get; set; }
    public double Weight { get; set; }
    public double Assay { get; set; }
    public string Description { get; set; } = string.Empty;
    public string CreatedAt { get; set; } = string.Empty;
}
