namespace GoldBar.Windows.Models;

public sealed class GoldQuoteSettings
{
    public string Url { get; set; } = "https://aminigold.com/";
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;

    public GoldQuoteSettings Normalize()
    {
        Url = string.IsNullOrWhiteSpace(Url) ? "https://aminigold.com/" : Url.Trim();
        if (!Uri.TryCreate(Url, UriKind.Absolute, out var uri) || (uri.Scheme != Uri.UriSchemeHttps && uri.Scheme != Uri.UriSchemeHttp))
            Url = "https://aminigold.com/";
        Username = (Username ?? string.Empty).Trim();
        Password ??= string.Empty;
        return this;
    }
}

public sealed record GoldQuotePublicSettings(string Url, string Username, bool HasPassword);

// Quote remains the requested green «خرید از ما» value for backwards compatibility.
// SellQuote carries the red «فروش به ما» value for the dashboard header.
public sealed record GoldQuoteResult(bool Ok, decimal? Quote, string Message, DateTimeOffset? UpdatedAt = null)
{
    public decimal? BuyQuote => Quote;
    public decimal? SellQuote { get; init; }
}
