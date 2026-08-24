using System.Globalization;
using System.Text.RegularExpressions;

namespace GoldBar.Windows.Core;

/// <summary>
/// Extracts a numeric weight from common ASCII scale frames such as:
/// ST,+ 214.373 g / WT=102,500 / +000214.373.
/// The last numeric field is used because status fields normally precede weight.
/// </summary>
public static partial class WeightParser
{
    [GeneratedRegex(@"[-+]?\s*\d+(?:[\.,]\d+)?", RegexOptions.CultureInvariant)]
    private static partial Regex NumberRegex();

    public static double? Parse(string? raw, int decimals)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;

        var matches = NumberRegex().Matches(raw);
        if (matches.Count == 0) return null;

        var token = matches[^1].Value
            .Replace(" ", string.Empty, StringComparison.Ordinal)
            .Replace("\t", string.Empty, StringComparison.Ordinal)
            .Replace(',', '.');

        if (!double.TryParse(token, NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint,
                CultureInfo.InvariantCulture, out var value) || !double.IsFinite(value))
            return null;

        return Math.Round(value, Math.Clamp(decimals, 0, 6), MidpointRounding.AwayFromZero);
    }
}

// Retained as a generic helper for diagnostics/backward compatibility. The live scale
// path intentionally does not median-filter readings because that previously caused
// the displayed weight to lag one measurement behind rapid changes.
public sealed class MedianStabilizer
{
    private readonly int _window;
    private readonly Queue<double> _values = new();
    private readonly object _gate = new();

    public MedianStabilizer(int window = 3) => _window = Math.Max(1, window);

    public double Push(double value)
    {
        lock (_gate)
        {
            _values.Enqueue(value);
            while (_values.Count > _window) _values.Dequeue();
            var sorted = _values.OrderBy(v => v).ToArray();
            var middle = sorted.Length / 2;
            return sorted.Length % 2 == 1
                ? sorted[middle]
                : (sorted[middle - 1] + sorted[middle]) / 2d;
        }
    }

    public void Reset()
    {
        lock (_gate) _values.Clear();
    }
}
