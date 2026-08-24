using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using GoldBar.Windows.Models;

namespace GoldBar.Windows.Services;

public sealed class GoldQuoteSettingsStore
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };
    private readonly string _path;

    public GoldQuoteSettingsStore()
    {
        var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "GoldBar");
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "goldquote.dat");
    }

    public async Task<GoldQuoteSettings> LoadAsync()
    {
        try
        {
            if (!File.Exists(_path)) return new GoldQuoteSettings();
            var protectedBytes = await File.ReadAllBytesAsync(_path);
            var bytes = ProtectedData.Unprotect(protectedBytes, null, DataProtectionScope.CurrentUser);
            return (JsonSerializer.Deserialize<GoldQuoteSettings>(bytes) ?? new GoldQuoteSettings()).Normalize();
        }
        catch
        {
            return new GoldQuoteSettings();
        }
    }

    public async Task<GoldQuoteSettings> SaveAsync(GoldQuoteSettings settings)
    {
        settings.Normalize();
        var json = JsonSerializer.Serialize(settings, JsonOptions);
        var protectedBytes = ProtectedData.Protect(Encoding.UTF8.GetBytes(json), null, DataProtectionScope.CurrentUser);
        var temp = _path + ".tmp";
        await File.WriteAllBytesAsync(temp, protectedBytes);
        File.Move(temp, _path, true);
        return settings;
    }

    public async Task<GoldQuotePublicSettings> GetPublicAsync()
    {
        var s = await LoadAsync();
        return new GoldQuotePublicSettings(s.Url, s.Username, !string.IsNullOrWhiteSpace(s.Password));
    }
}
