using System.Globalization;
using System.Runtime.CompilerServices;

namespace GoldBar.Windows.Core;

/// <summary>
/// Extracts a numeric weight from common ASCII scale frames such as:
/// ST,+ 214.373 g / WT=102,500 / +000214.373.
/// The last numeric field is used because status fields normally precede weight.
/// 
/// Optimized with manual parsing for high-frequency readings.
/// </summary>
public static partial class WeightParser
{
    public static double? Parse(string? raw, int decimals)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;

        // Find the last numeric token manually (faster than regex)
        var lastNumStart = -1;
        var lastNumEnd = -1;
        var i = raw.Length - 1;
        
        // Skip trailing whitespace
        while (i >= 0 && char.IsWhiteSpace(raw[i])) i--;
        
        if (i < 0) return null;
        
        // Find end of number (digits, comma, or dot)
        lastNumEnd = i + 1;
        while (i >= 0 && IsDigitOrSeparator(raw[i])) i--;
        lastNumStart = i + 1;
        
        if (lastNumStart >= lastNumEnd) return null;
        
        // Extract and parse the number
        Span<char> buffer = stackalloc char[lastNumEnd - lastNumStart];
        var pos = 0;
        
        for (var j = lastNumStart; j < lastNumEnd; j++)
        {
            var c = raw[j];
            if (c == ',' || c == ' ' || c == '\t')
                continue; // Skip separators and whitespace
            if (c == '.' || c == '٫') // Both Western and Arabic decimal separator
                buffer[pos++] = '.';
            else if (c == '+' || c == '-')
                buffer[pos++] = c;
            else if (c >= '0' && c <= '9')
                buffer[pos++] = c;
            else
                return null; // Invalid character in number
        }
        
        if (pos == 0) return null;
        
        if (!double.TryParse(buffer[..pos], 
            NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint,
            CultureInfo.InvariantCulture, out var value) || !double.IsFinite(value))
            return null;

        return Math.Round(value, Math.Clamp(decimals, 0, 6), MidpointRounding.AwayFromZero);
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    private static bool IsDigitOrSeparator(char c) =>
        c is >= '0' and <= '9' or '.' or ',' or '٫' or '+' or '-' or ' ' or '\t';
}

/// <summary>
/// Median stabilizer for smoothing rapid scale readings.
/// Retained for backward compatibility and optional use.
/// </summary>
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
