using System.IO;

namespace GoldBar.Windows.Models;

public sealed class ScaleSettings
{
    public string ScaleName { get; set; } = "ترازو";
    public string Port { get; set; } = "COM4";
    public int BaudRate { get; set; } = 2400;
    public int DataBits { get; set; } = 7;
    public string Parity { get; set; } = "Even";
    public double StopBits { get; set; } = 2;
    public string FlowControl { get; set; } = "None";
    public bool AutoRead { get; set; } = true;
    public int ReadIntervalMs { get; set; } = 800;
    public int Decimals { get; set; } = 3;
    public string RequestCommand { get; set; } = "P";
    public bool KeyboardRead { get; set; } = true;
    public string ReportDirectory { get; set; } = GetDefaultReportDirectory();

    public static ScaleSettings Defaults() => new();

    public static string GetDefaultReportDirectory()
    {
        var documents = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
        if (string.IsNullOrWhiteSpace(documents))
            documents = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        return Path.Combine(documents, "Gold Bar", "Reports");
    }

    public ScaleSettings Normalize()
    {
        ScaleName = string.IsNullOrWhiteSpace(ScaleName) ? "ترازو" : ScaleName.Trim();
        if (ScaleName.Length > 60) ScaleName = ScaleName[..60];
        Port = string.IsNullOrWhiteSpace(Port) ? "COM4" : Port.Trim();
        BaudRate = Math.Clamp(BaudRate, 300, 921600);
        DataBits = DataBits is 5 or 6 or 7 or 8 ? DataBits : 7;
        Parity = Parity is "None" or "Even" or "Odd" or "Mark" or "Space" ? Parity : "Even";
        StopBits = StopBits is 1 or 1.5 or 2 ? StopBits : 2;
        FlowControl = FlowControl is "None" or "XOnXOff" or "RTS/CTS" ? FlowControl : "None";
        ReadIntervalMs = Math.Clamp(ReadIntervalMs, 100, 10000);
        Decimals = Math.Clamp(Decimals, 0, 6);
        RequestCommand ??= string.Empty;
        ReportDirectory = string.IsNullOrWhiteSpace(ReportDirectory)
            ? GetDefaultReportDirectory()
            : Path.GetFullPath(Environment.ExpandEnvironmentVariables(ReportDirectory.Trim()));
        return this;
    }
}
