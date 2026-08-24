namespace GoldBar.Windows.Core;

public readonly record struct AssaySummary(double Weight, double WeightedSum, double AverageAssay, int Count);
public readonly record struct IncreaseAssayResult(double AssayDifference, double Denominator, double RequiredBar);
public readonly record struct AlloyResult(double TotalAlloyRequired, double SilverRequired, double NonSilverRequired, double FourPerThousand, double FinalOtherAlloy, double TotalAfterAlloy);

public static class AssayFormulaReference
{
    public static AssaySummary Summarize(IEnumerable<(double Weight, double Assay)> entries)
    {
        double weight = 0;
        double weighted = 0;
        var count = 0;
        foreach (var item in entries)
        {
            if (!(item.Weight > 0) || !(item.Assay > 0) || item.Assay > 1000) continue;
            weight += item.Weight;
            weighted += item.Weight * item.Assay;
            count++;
        }
        return new AssaySummary(weight, weighted, weight > 0 ? weighted / weight : double.NaN, count);
    }

    public static IncreaseAssayResult Increase(AssaySummary summary, double targetAssay, double barAssay)
    {
        var difference = targetAssay - summary.AverageAssay;
        var denominator = barAssay - targetAssay;
        var raw = denominator == 0 ? double.NaN : summary.Weight * difference / denominator;
        var required = double.IsFinite(raw) ? RoundDownTowardZero(raw, 1) : double.NaN;
        return new IncreaseAssayResult(difference, denominator, required);
    }

    public static AlloyResult Alloy(AssaySummary summary, double targetAssay, double silverPercent, double globalWeight)
    {
        if (!(summary.Weight > 0) || !double.IsFinite(summary.AverageAssay) || targetAssay == 0)
            return new AlloyResult(double.NaN, double.NaN, double.NaN, double.NaN, double.NaN, double.NaN);
        var total = summary.Weight * summary.AverageAssay / targetAssay - summary.Weight;
        var silver = silverPercent / 100d * total;
        var nonSilver = total - silver;
        var fourPerThousand = globalWeight * 0.004d;
        var finalOther = total - silver - fourPerThousand;
        var totalAfter = summary.Weight + total;
        return new AlloyResult(total, silver, nonSilver, fourPerThousand, finalOther, totalAfter);
    }

    public static (double Gold995, double Gold750) Split(double value, double percent995 = 36.79, double percent750 = 63.21) =>
        (value * percent995 / 100d, value * percent750 / 100d);

    public static double CorrectionForDrop(double baseWeight, double baseAssay, double assayDrop)
    {
        var denominator = baseAssay - assayDrop;
        return denominator == 0 ? double.NaN : baseWeight * baseAssay / denominator - baseWeight;
    }

    public static double RoundDownTowardZero(double value, int digits)
    {
        var factor = Math.Pow(10, digits);
        return Math.Truncate(value * factor) / factor;
    }
}
