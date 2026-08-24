using System.IO;
using System.Security.Cryptography;
using System.Text.Json;

namespace GoldBar.Windows.Core;

public sealed class CredentialStore
{
    private const int DefaultIterations = 210_000;
    private const int SaltSize = 16;
    private const int HashSize = 32;
    private readonly string _path;
    private readonly JsonSerializerOptions _json = new(JsonSerializerDefaults.Web) { WriteIndented = true };

    private sealed class CredentialFile
    {
        public string Username { get; set; } = string.Empty;
        public string Salt { get; set; } = string.Empty;
        public string PasswordHash { get; set; } = string.Empty;
        public int Iterations { get; set; } = DefaultIterations;
        public int Version { get; set; } = 1;
    }

    public CredentialStore(string? customPath = null)
    {
        _path = customPath ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "GoldBar", "credentials.json");
    }

    public bool IsRegistered
    {
        get
        {
            try { return Load() is not null; }
            catch { return false; }
        }
    }

    public string RegisteredUsername
    {
        get
        {
            try { return Load()?.Username ?? string.Empty; }
            catch { return string.Empty; }
        }
    }

    public void Register(string username, string password)
    {
        username = (username ?? string.Empty).Trim();
        ValidateUsername(username);
        ValidatePassword(password);
        Save(CreateCredential(username, password));
    }

    public bool Verify(string? username, string? password)
    {
        var file = Load();
        if (file is null || password is null) return false;
        if (!string.Equals(file.Username, username?.Trim(), StringComparison.OrdinalIgnoreCase)) return false;

        try
        {
            var salt = Convert.FromBase64String(file.Salt);
            var expected = Convert.FromBase64String(file.PasswordHash);
            var actual = Rfc2898DeriveBytes.Pbkdf2(password, salt, Math.Max(50_000, file.Iterations), HashAlgorithmName.SHA256, expected.Length);
            return CryptographicOperations.FixedTimeEquals(actual, expected);
        }
        catch
        {
            return false;
        }
    }

    public void ChangePassword(string username, string currentPassword, string newPassword)
    {
        var file = Load() ?? throw new InvalidOperationException("اطلاعات ورود ثبت نشده است.");
        var normalizedUser = (username ?? string.Empty).Trim();
        if (!string.Equals(file.Username, normalizedUser, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("نام کاربری معتبر نیست.");
        if (!Verify(file.Username, currentPassword))
            throw new InvalidOperationException("رمز عبور فعلی صحیح نیست.");
        ValidatePassword(newPassword);
        if (string.Equals(currentPassword, newPassword, StringComparison.Ordinal))
            throw new InvalidOperationException("رمز جدید باید با رمز فعلی متفاوت باشد.");

        Save(CreateCredential(file.Username, newPassword));
    }

    private static void ValidateUsername(string username)
    {
        if (username.Length < 2) throw new ArgumentException("نام کاربری باید حداقل ۲ کاراکتر باشد.");
        if (username.Length > 60) throw new ArgumentException("نام کاربری حداکثر ۶۰ کاراکتر می‌تواند باشد.");
    }

    private static void ValidatePassword(string password)
    {
        if (string.IsNullOrWhiteSpace(password) || password.Length < 4)
            throw new ArgumentException("رمز عبور باید حداقل ۴ کاراکتر باشد.");
        if (password.Length > 128) throw new ArgumentException("رمز عبور بیش از حد طولانی است.");
    }

    private static CredentialFile CreateCredential(string username, string password)
    {
        var salt = RandomNumberGenerator.GetBytes(SaltSize);
        var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, DefaultIterations, HashAlgorithmName.SHA256, HashSize);
        return new CredentialFile
        {
            Username = username,
            Salt = Convert.ToBase64String(salt),
            PasswordHash = Convert.ToBase64String(hash),
            Iterations = DefaultIterations,
            Version = 1
        };
    }

    private void Save(CredentialFile file)
    {
        var dir = Path.GetDirectoryName(_path)!;
        Directory.CreateDirectory(dir);
        var temp = _path + ".tmp";
        File.WriteAllText(temp, JsonSerializer.Serialize(file, _json));
        File.Move(temp, _path, true);
    }

    private CredentialFile? Load()
    {
        if (!File.Exists(_path)) return null;
        var raw = File.ReadAllText(_path);
        var file = JsonSerializer.Deserialize<CredentialFile>(raw, _json);
        if (file is null || string.IsNullOrWhiteSpace(file.Username) || string.IsNullOrWhiteSpace(file.Salt) || string.IsNullOrWhiteSpace(file.PasswordHash))
            return null;
        return file;
    }
}

public static class CurrentUser
{
    public static string Username { get; set; } = string.Empty;
}
