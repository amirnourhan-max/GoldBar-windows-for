namespace GoldBar.Windows.Models;

public sealed class SilverQuoteSettings
{
    public string Url { get; set; } = "https://nogreh.com/price-list/";
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;

    public SilverQuoteSettings Normalize()
    {
        Url = string.IsNullOrWhiteSpace(Url) ? "https://nogreh.com/price-list/" : Url.Trim();
        if (!Uri.TryCreate(Url, UriKind.Absolute, out var uri) || (uri.Scheme != Uri.UriSchemeHttps && uri.Scheme != Uri.UriSchemeHttp))
            Url = "https://nogreh.com/price-list/";
        Username = (Username ?? string.Empty).Trim();
        Password ??= string.Empty;
        return this;
    }
}

// Public projection sent to the renderer; never exposes the stored password.
public sealed record SilverQuotePublicSettings(string Url, string Username, bool HasPassword);

// Price is the live per-gram silver quote extracted from the source page.
public sealed record SilverQuoteResult(bool Ok, decimal? Quote, string Message, DateTimeOffset? UpdatedAt = null);
