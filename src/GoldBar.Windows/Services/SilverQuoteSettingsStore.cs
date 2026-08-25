using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using GoldBar.Windows.Models;

namespace GoldBar.Windows.Services;

// DPAPI-protected store for the silver quote source settings (same pattern as GoldQuoteSettingsStore).
public sealed class SilverQuoteSettingsStore
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };
    private readonly string _path;

    public SilverQuoteSettingsStore()
    {
        var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "GoldBar");
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "silverquote.dat");
    }

    public async Task<SilverQuoteSettings> LoadAsync()
    {
        try
        {
            if (!File.Exists(_path)) return new SilverQuoteSettings();
            var protectedBytes = await File.ReadAllBytesAsync(_path);
            var bytes = ProtectedData.Unprotect(protectedBytes, null, DataProtectionScope.CurrentUser);
            return (JsonSerializer.Deserialize<SilverQuoteSettings>(bytes) ?? new SilverQuoteSettings()).Normalize();
        }
        catch
        {
            return new SilverQuoteSettings();
        }
    }

    public async Task<SilverQuoteSettings> SaveAsync(SilverQuoteSettings settings)
    {
        settings.Normalize();
        var json = JsonSerializer.Serialize(settings, JsonOptions);
        var protectedBytes = ProtectedData.Protect(Encoding.UTF8.GetBytes(json), null, DataProtectionScope.CurrentUser);
        var temp = _path + ".tmp";
        await File.WriteAllBytesAsync(temp, protectedBytes);
        File.Move(temp, _path, true);
        return settings;
    }

    public async Task<SilverQuotePublicSettings> GetPublicAsync()
    {
        var s = await LoadAsync();
        return new SilverQuotePublicSettings(s.Url, s.Username, !string.IsNullOrWhiteSpace(s.Password));
    }
}
