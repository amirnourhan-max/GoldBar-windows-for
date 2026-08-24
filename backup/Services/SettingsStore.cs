using System.IO;
using System.Text.Json;
using GoldBar.Windows.Models;

namespace GoldBar.Windows.Services;

public sealed class SettingsStore
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };
    private readonly string _path;

    public SettingsStore()
    {
        var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "GoldBar");
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "settings.json");
    }

    public async Task<ScaleSettings> LoadAsync()
    {
        try
        {
            if (!File.Exists(_path)) return ScaleSettings.Defaults();
            await using var stream = File.OpenRead(_path);
            return (await JsonSerializer.DeserializeAsync<ScaleSettings>(stream) ?? ScaleSettings.Defaults()).Normalize();
        }
        catch
        {
            return ScaleSettings.Defaults();
        }
    }

    public async Task<ScaleSettings> SaveAsync(ScaleSettings value)
    {
        value.Normalize();
        var temp = _path + ".tmp";
        await using (var stream = File.Create(temp))
            await JsonSerializer.SerializeAsync(stream, value, JsonOptions);
        File.Move(temp, _path, true);
        return value;
    }

    public Task<ScaleSettings> ResetAsync() => SaveAsync(ScaleSettings.Defaults());
}
