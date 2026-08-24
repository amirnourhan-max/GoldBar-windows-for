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

        // Find the last numeric token: a contiguous sequence of digits,
        // optionally with a leading decimal separator and/or leading sign.
        
        var i = raw.Length - 1;
        
        // Step 1: Find the last digit
        while (i >= 0 && !IsDigit(raw[i])) i--;
        if (i < 0) return null;
        
        // Step 2: Scan left through digits and decimal separators (dots/commas)
        var end = i + 1;
        while (i >= 0 && (IsDigit(raw[i]) || IsDecimalSeparator(raw[i]))) i--;
        
        // Step 3: Check for optional leading sign (+/-)
        if (i >= 0 && (raw[i] == '+' || raw[i] == '-'))
        {
            // Only include sign if it's immediately before the number (no whitespace gap)
            if (i + 1 < end && raw[i + 1] != ' ' && raw[i + 1] != '\t')
                i--;
        }
        
        var start = i + 1;
        if (start >= end) return null;
        
        // Step 4: Extract and parse the number
        var len = end - start;
        Span<char> buffer = stackalloc char[len];
        var pos = 0;
        
        for (var j = start; j < end; j++)
        {
            var c = raw[j];
            if (c == ' ' || c == '\t')
                continue; // Skip whitespace within number
            if (c == '.' || c == ',' || c == '٫') // Decimal separators
                buffer[pos++] = '.';
            else if (c == '+' || c == '-')
                buffer[pos++] = c;
            else if (c >= '0' && c <= '9')
                buffer[pos++] = c;
            else
                return null; // Invalid character
        }
        
        if (pos == 0) return null;
        
        if (!double.TryParse(buffer[..pos], 
            NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint,
            CultureInfo.InvariantCulture, out var value) || !double.IsFinite(value))
            return null;

        return Math.Round(value, Math.Clamp(decimals, 0, 6), MidpointRounding.AwayFromZero);
    }

    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    private static bool IsDigit(char c) => c >= '0' && c <= '9';
    
    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    private static bool IsDecimalSeparator(char c) =>
        c == '.' || c == ',' || c == '٫';
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
