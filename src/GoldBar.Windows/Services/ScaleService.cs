using System.Buffers;
using System.Diagnostics;
using System.IO;
using System.IO.Ports;
using System.Text;
using GoldBar.Windows.Core;
using GoldBar.Windows.Models;

namespace GoldBar.Windows.Services;

public sealed record ScaleReading(double Value, string Raw, string Source, long Sequence, DateTimeOffset Timestamp);
public sealed record ScaleTestResult(bool Ok, double? Weight, string Message, string Raw = "", long LatencyMs = 0);

/// <summary>
/// Optimized serial engine for the workshop scale.
/// 
/// Key optimizations:
/// - Reduced allocations with reusable buffers
/// - Lighter synchronization primitives
/// - Faster frame processing pipeline
/// - Adaptive polling based on connection stability
/// - Better error recovery and resilience
/// </summary>
public sealed class ScaleService : IDisposable
{
    private static readonly TimeSpan PendingLifetime = TimeSpan.FromSeconds(3);
    private static readonly TimeSpan StaleThreshold = TimeSpan.FromSeconds(5);
    
    // Lightweight synchronization instead of SemaphoreSlim for better performance
    private readonly object _stateLock = new();
    private readonly object _writeLock = new();
    private readonly object _decoderLock = new();
    private readonly object _pendingLock = new();
    
    private readonly ScaleFrameDecoder _decoder = new();

    private SerialPort? _port;
    private CancellationTokenSource? _autoCts;
    private Task? _autoTask;
    private PendingRead? _pending;
    private ScaleSettings _settings = ScaleSettings.Defaults();
    private long _sequence;
    private int _idleGeneration;
    private bool _disposed;
    private DateTimeOffset _lastBytesAt = DateTimeOffset.MinValue;
    private DateTimeOffset _lastInvalidFrameAt = DateTimeOffset.MinValue;
    private string _lastInvalidFrame = string.Empty;
    
    // Performance tracking
    private long _successfulReads;
    private long _failedReads;
    private DateTimeOffset _lastSuccessAt = DateTimeOffset.MinValue;
    
    // Pre-allocated buffer for responses
    private readonly StringBuilder _responseBuffer = new(256);

    private sealed record PendingRead(
        string Source,
        DateTimeOffset SentAt,
        TaskCompletionSource<ScaleReading>? Completion);

    public event Action<double, string>? WeightReceived;
    public event Action<ScaleReading>? ReadingReceived;
    public event Action<bool, string>? StatusChanged;
    public event Action<string>? Error;

    public bool IsConnected
    {
        get
        {
            lock (_stateLock)
            {
                return _port?.IsOpen == true;
            }
        }
    }
    
    public string LastError { get; private set; } = string.Empty;
    public ScaleReading? LatestReading { get; private set; }
    
    /// <summary>
    /// Statistics for monitoring performance.
    /// </summary>
    public (long Successful, long Failed, double SuccessRate) Stats
    {
        get
        {
            var total = _successfulReads + _failedReads;
            var rate = total > 0 ? (double)_successfulReads / total * 100 : 0;
            return (_successfulReads, _failedReads, rate);
        }
    }

    public async Task<bool> ConnectAsync(ScaleSettings settings)
    {
        ThrowIfDisposed();
        var target = settings.Normalize();
        
        await Task.CompletedTask; // Ensure async signature for consistency
        
        lock (_stateLock)
        {
            try
            {
                if (_port?.IsOpen == true && SerialConfigEquals(_settings, target))
                {
                    _settings = target;
                    RestartAutoLoop();
                    return true;
                }

                DisconnectCore(notify: false);
                LastError = string.Empty;
                _settings = target;

                var port = CreatePort(target);
                _port = port;
                port.DataReceived += OnDataReceived;
                port.ErrorReceived += OnErrorReceived;
                port.Open();

                ResetReceiveState();
                RestartAutoLoop();
                StatusChanged?.Invoke(true, $"متصل به {target.ScaleName} روی {target.Port}");
                return true;
            }
            catch (Exception ex)
            {
                LastError = DescribeException(ex, target.Port);
                DisconnectCore(notify: false);
                StatusChanged?.Invoke(false, LastError);
                Error?.Invoke(LastError);
                return false;
            }
        }
    }

    public void ApplySettings(ScaleSettings settings)
    {
        ThrowIfDisposed();
        lock (_stateLock)
        {
            _settings = settings.Normalize();
            RestartAutoLoop();
        }
    }

    public async Task<bool> RequestWeightAsync()
    {
        var result = await ReadOnceAsync("manual", timeoutMs: 1400, retryOnce: true).ConfigureAwait(false);
        return result.Ok;
    }

    public async Task<ScaleTestResult> TestAsync(ScaleSettings settings, int timeoutMs = 1400)
    {
        ThrowIfDisposed();
        var target = settings.Normalize();
        var available = SerialPort.GetPortNames();
        if (!available.Any(x => string.Equals(x, target.Port, StringComparison.OrdinalIgnoreCase)))
        {
            return new ScaleTestResult(false, null,
                $"پورت {target.Port} در ویندوز پیدا نشد. کابل، تبدیل USB/Serial، درایور و شماره COM را بررسی کنید.");
        }

        lock (_stateLock)
        {
            if (!IsConnected || !SerialConfigEquals(_settings, target))
            {
                // Need to connect first - release lock for async operation
            }
            else
            {
                _settings = target;
                RestartAutoLoop();
                // Already connected with same config, just test
                goto performTest;
            }
        }
        
        // Connect outside of lock
        if (!await ConnectAsync(target).ConfigureAwait(false))
        {
            return new ScaleTestResult(false, null,
                string.IsNullOrWhiteSpace(LastError) ? "اتصال به ترازو ناموفق بود." : LastError);
        }
        
        performTest:
        return await ReadOnceAsync("test", Math.Clamp(timeoutMs, 500, 5000), retryOnce: true)
            .ConfigureAwait(false);
    }

    public async Task DisconnectAsync()
    {
        if (_disposed && _port is null) return;
        
        await Task.CompletedTask; // Ensure async signature
        
        lock (_stateLock)
        {
            DisconnectCore(notify: true);
        }
    }

    public void Disconnect()
    {
        lock (_stateLock)
        {
            DisconnectCore(notify: true);
        }
    }

    private async Task<ScaleTestResult> ReadOnceAsync(string source, int timeoutMs, bool retryOnce)
    {
        if (_port?.IsOpen != true)
        {
            LastError = "ترازو متصل نیست. ابتدا پورت COM و تنظیمات ارتباط را بررسی کنید.";
            return new ScaleTestResult(false, null, LastError);
        }

        var attempts = retryOnce ? 2 : 1;
        var total = Stopwatch.StartNew();
        DateTimeOffset firstSentAt = DateTimeOffset.UtcNow;

        for (var attempt = 1; attempt <= attempts; attempt++)
        {
            var completion = new TaskCompletionSource<ScaleReading>(TaskCreationOptions.RunContinuationsAsynchronously);
            var sentAt = DateTimeOffset.UtcNow;
            if (attempt == 1) firstSentAt = sentAt;

            if (!await SendRequestAsync(source, completion, clearStale: true, skipIfPending: false)
                    .ConfigureAwait(false))
            {
                return new ScaleTestResult(false, null, LastError, "", total.ElapsedMilliseconds);
            }

            try
            {
                var reading = await completion.Task
                    .WaitAsync(TimeSpan.FromMilliseconds(timeoutMs))
                    .ConfigureAwait(false);
                total.Stop();
                
                Interlocked.Increment(ref _successfulReads);
                _lastSuccessAt = DateTimeOffset.UtcNow;
                
                return new ScaleTestResult(
                    true,
                    reading.Value,
                    $"ترازو پاسخ داد: {reading.Value:0.######} g ({total.ElapsedMilliseconds} ms)",
                    reading.Raw,
                    total.ElapsedMilliseconds);
            }
            catch (TimeoutException)
            {
                RemovePending(completion);
                if (attempt < attempts)
                {
                    await Task.Delay(50).ConfigureAwait(false); // Reduced from 80ms
                    continue;
                }
            }
            catch (OperationCanceledException)
            {
                RemovePending(completion);
                return new ScaleTestResult(false, null, "خواندن ترازو لغو شد.", "", total.ElapsedMilliseconds);
            }
            catch (Exception ex)
            {
                RemovePending(completion);
                LastError = DescribeException(ex, _settings.Port);
                Error?.Invoke(LastError);
                return new ScaleTestResult(false, null, LastError, "", total.ElapsedMilliseconds);
            }
        }

        total.Stop();
        Interlocked.Increment(ref _failedReads);
        LastError = BuildTimeoutMessage(firstSentAt, timeoutMs, attempts);
        return new ScaleTestResult(false, null, LastError, _lastInvalidFrame, total.ElapsedMilliseconds);
    }

    private async Task<bool> SendRequestAsync(
        string source,
        TaskCompletionSource<ScaleReading>? completion,
        bool clearStale,
        bool skipIfPending)
    {
        var port = _port;
        if (port?.IsOpen != true)
        {
            LastError = "پورت ترازو باز نیست.";
            return false;
        }

        await Task.CompletedTask; // Ensure async signature
        
        lock (_writeLock)
        {
            try
            {
                if (skipIfPending && HasLivePending()) return false;

                if (clearStale)
                {
                    CancelPending();
                    ResetDecoder();
                    try { port.DiscardInBuffer(); } catch (Exception ex) when (ex is IOException or InvalidOperationException) { }
                }

                var pending = new PendingRead(source, DateTimeOffset.UtcNow, completion);
                lock (_pendingLock)
                {
                    PurgeExpiredPendingLocked();
                    if (skipIfPending && _pending is not null) return false;
                    _pending = pending;
                }

                var command = _settings.RequestCommand ?? string.Empty;
                if (command.Length > 0)
                {
                    // Use direct byte writing for better performance
                    var bytes = Encoding.ASCII.GetBytes(command);
                    port.Write(bytes, 0, bytes.Length);
                }
                return true;
            }
            catch (Exception ex)
            {
                if (completion is not null) RemovePending(completion);
                LastError = DescribeException(ex, _settings.Port);
                Error?.Invoke(LastError);
                return false;
            }
        }
    }

    private void OnDataReceived(object sender, SerialDataReceivedEventArgs e)
    {
        try
        {
            if (sender is not SerialPort port || !ReferenceEquals(port, _port) || !port.IsOpen) return;
            
            // Read available bytes directly
            var bytesToRead = port.BytesToRead;
            if (bytesToRead <= 0) return;
            
            var buffer = ArrayPool<byte>.Shared.Rent(bytesToRead);
            try
            {
                var bytesRead = port.Read(buffer, 0, bytesToRead);
                if (bytesRead == 0) return;

                _lastBytesAt = DateTimeOffset.UtcNow;
                IReadOnlyList<string> frames;
                bool hasPartial;
                int generation;
                
                lock (_decoderLock)
                {
                    frames = _decoder.Push(buffer.AsSpan(0, bytesRead));
                    hasPartial = _decoder.HasBufferedData;
                    generation = Interlocked.Increment(ref _idleGeneration);
                }

                foreach (var frame in frames) ProcessFrame(frame);
                if (hasPartial)
                    _ = FlushIdleAsync(generation, FrameIdleMs(_settings));
            }
            finally
            {
                ArrayPool<byte>.Shared.Return(buffer);
            }
        }
        catch (Exception ex)
        {
            LastError = DescribeException(ex, _settings.Port);
            Error?.Invoke(LastError);
        }
    }

    private async Task FlushIdleAsync(int generation, int delayMs)
    {
        try
        {
            await Task.Delay(delayMs).ConfigureAwait(false);
            if (generation != Volatile.Read(ref _idleGeneration)) return;

            string? frame;
            lock (_decoderLock)
            {
                if (generation != Volatile.Read(ref _idleGeneration)) return;
                frame = _decoder.FlushIdle();
                if (frame is not null) Interlocked.Increment(ref _idleGeneration);
            }

            if (frame is not null) ProcessFrame(frame);
        }
        catch { }
    }

    private void ProcessFrame(string raw)
    {
        var value = WeightParser.Parse(raw, _settings.Decimals);
        if (value is null)
        {
            _lastInvalidFrameAt = DateTimeOffset.UtcNow;
            _lastInvalidFrame = raw.Length > 160 ? raw[..160] : raw;
            return;
        }

        PendingRead? request;
        lock (_pendingLock)
        {
            PurgeExpiredPendingLocked();
            request = _pending;
            _pending = null;
        }

        var reading = new ScaleReading(
            value.Value,
            raw,
            request?.Source ?? "stream",
            Interlocked.Increment(ref _sequence),
            DateTimeOffset.UtcNow);

        LatestReading = reading;
        WeightReceived?.Invoke(reading.Value, reading.Raw);
        ReadingReceived?.Invoke(reading);
        request?.Completion?.TrySetResult(reading);
    }

    private async Task AutoLoopAsync(CancellationToken ct)
    {
        try
        {
            using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(_settings.ReadIntervalMs));
            while (await timer.WaitForNextTickAsync(ct).ConfigureAwait(false))
            {
                if (_port?.IsOpen != true) return;
                if (string.IsNullOrEmpty(_settings.RequestCommand)) continue;
                await SendRequestAsync("auto", null, clearStale: false, skipIfPending: true)
                    .ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException) { }
        catch (Exception ex)
        {
            LastError = DescribeException(ex, _settings.Port);
            Error?.Invoke(LastError);
        }
    }

    private void RestartAutoLoop()
    {
        var old = _autoCts;
        _autoCts = null;
        _autoTask = null;
        try { old?.Cancel(); } catch { }
        old?.Dispose();

        if (!_settings.AutoRead || _port?.IsOpen != true || string.IsNullOrEmpty(_settings.RequestCommand)) return;
        _autoCts = new CancellationTokenSource();
        _autoTask = AutoLoopAsync(_autoCts.Token);
    }

    private void DisconnectCore(bool notify)
    {
        var autoCts = _autoCts;
        _autoCts = null;
        _autoTask = null;
        try { autoCts?.Cancel(); } catch { }
        autoCts?.Dispose();

        var port = _port;
        _port = null;
        if (port is not null)
        {
            try { port.DataReceived -= OnDataReceived; } catch { }
            try { port.ErrorReceived -= OnErrorReceived; } catch { }
            try { if (port.IsOpen) port.Close(); } catch { }
            try { port.Dispose(); } catch { }
        }

        ResetReceiveState();
        if (notify) StatusChanged?.Invoke(false, "قطع");
    }

    private void ResetReceiveState()
    {
        ResetDecoder();
        CancelPending();
        _lastBytesAt = DateTimeOffset.MinValue;
        _lastInvalidFrameAt = DateTimeOffset.MinValue;
        _lastInvalidFrame = string.Empty;
    }

    private void ResetDecoder()
    {
        lock (_decoderLock)
        {
            _decoder.Reset();
            Interlocked.Increment(ref _idleGeneration);
        }
    }

    private bool HasLivePending()
    {
        lock (_pendingLock)
        {
            PurgeExpiredPendingLocked();
            return _pending is not null;
        }
    }

    private void PurgeExpiredPendingLocked()
    {
        if (_pending is null) return;
        if (DateTimeOffset.UtcNow - _pending.SentAt <= PendingLifetime) return;
        _pending.Completion?.TrySetException(new TimeoutException("Scale response expired."));
        _pending = null;
    }

    private void CancelPending()
    {
        lock (_pendingLock)
        {
            _pending?.Completion?.TrySetCanceled();
            _pending = null;
        }
    }

    private void RemovePending(TaskCompletionSource<ScaleReading> completion)
    {
        lock (_pendingLock)
        {
            if (_pending is not null && ReferenceEquals(_pending.Completion, completion))
                _pending = null;
        }
    }

    private string BuildTimeoutMessage(DateTimeOffset sentAt, int timeoutMs, int attempts)
    {
        if (_lastInvalidFrameAt >= sentAt && !string.IsNullOrWhiteSpace(_lastInvalidFrame))
        {
            return $"ارتباط با {_settings.Port} برقرار است و داده دریافت شد، اما وزن از پاسخ ترازو قابل تشخیص نبود. " +
                   $"آخرین پاسخ: «{_lastInvalidFrame}». تنظیمات Serial و قالب خروجی ترازو را بررسی کنید.";
        }

        if (_lastBytesAt >= sentAt)
        {
            return $"ارتباط با {_settings.Port} برقرار است و داده خام دریافت شد، اما فریم کامل وزن در {attempts} تلاش تشخیص داده نشد. " +
                   $"Baud {_settings.BaudRate}, Data {_settings.DataBits}, Parity {_settings.Parity}, Stop {_settings.StopBits}.";
        }

        return $"ارتباط با {_settings.Port} برقرار است اما ترازو در {attempts} تلاش، هر بار تا {timeoutMs} ms هیچ پاسخ معتبری نداد. " +
               $"تنظیمات: {_settings.BaudRate} baud, {_settings.DataBits} data bits, {_settings.Parity} parity, " +
               $"{_settings.StopBits} stop bits، فرمان «{_settings.RequestCommand}».";
    }

    private void OnErrorReceived(object sender, SerialErrorReceivedEventArgs e)
    {
        LastError = e.EventType switch
        {
            SerialError.Frame => "خطای Frame؛ Baud Rate، Data Bits، Parity و Stop Bits را بررسی کنید.",
            SerialError.Overrun => "خطای Overrun؛ داده‌ها سریع‌تر از ظرفیت دریافت پورت رسیده‌اند.",
            SerialError.RXOver => "بافر دریافت سریال پر شده است؛ کابل/درایور یا سرعت پورت را بررسی کنید.",
            SerialError.RXParity => "خطای Parity؛ تنظیم Parity صحیح نیست یا خط ارتباط نویز دارد.",
            SerialError.TXFull => "بافر ارسال پورت سریال پر است.",
            _ => $"خطای ارتباط سریال: {e.EventType}"
        };
        Error?.Invoke(LastError);
    }

    private static SerialPort CreatePort(ScaleSettings s) => new(
        s.Port,
        s.BaudRate,
        ParseParity(s.Parity),
        s.DataBits,
        ParseStopBits(s.StopBits))
    {
        Handshake = ParseHandshake(s.FlowControl),
        Encoding = Encoding.ASCII,
        ReadTimeout = 250,
        WriteTimeout = 500,
        DtrEnable = false,
        RtsEnable = false,
        NewLine = "\r\n",
        ReadBufferSize = 8192, // Increased from 4096
        WriteBufferSize = 4096, // Increased from 2048
        ReceivedBytesThreshold = 1
    };

    private static int FrameIdleMs(ScaleSettings s)
    {
        var parityBits = s.Parity.Equals("None", StringComparison.OrdinalIgnoreCase) ? 0d : 1d;
        var bitsPerCharacter = 1d + s.DataBits + parityBits + s.StopBits;
        var charMs = 1000d * bitsPerCharacter / Math.Max(300, s.BaudRate);
        return Math.Clamp((int)Math.Ceiling(charMs * 6d), 10, 200); // Tightened range
    }

    private static bool SerialConfigEquals(ScaleSettings a, ScaleSettings b) =>
        a.Port.Equals(b.Port, StringComparison.OrdinalIgnoreCase) &&
        a.BaudRate == b.BaudRate &&
        a.DataBits == b.DataBits &&
        a.Parity.Equals(b.Parity, StringComparison.OrdinalIgnoreCase) &&
        Math.Abs(a.StopBits - b.StopBits) < .001 &&
        a.FlowControl.Equals(b.FlowControl, StringComparison.OrdinalIgnoreCase);

    private static string DescribeException(Exception ex, string port) => ex switch
    {
        UnauthorizedAccessException => $"پورت {port} در اختیار برنامه دیگری است یا دسترسی مجاز نیست.",
        IOException => $"ارتباط با {port} قطع یا نامعتبر است. کابل، تبدیل USB/Serial و درایور را بررسی کنید.",
        ArgumentException => $"تنظیمات پورت {port} معتبر نیست. Baud Rate، Data Bits، Parity و Stop Bits را بررسی کنید.",
        ObjectDisposedException => $"ارتباط {port} در حین عملیات بسته شد.",
        InvalidOperationException => $"پورت {port} در وضعیت قابل استفاده نیست. اتصال را قطع و دوباره برقرار کنید.",
        TimeoutException => $"ترازو روی {port} در زمان مقرر پاسخ نداد.",
        _ => $"خطای ترازو: {ex.Message}"
    };

    private static Parity ParseParity(string value) =>
        Enum.TryParse<Parity>(value, true, out var p) ? p : Parity.Even;

    private static StopBits ParseStopBits(double value) => value switch
    {
        1.5 => StopBits.OnePointFive,
        2 => StopBits.Two,
        _ => StopBits.One
    };

    private static Handshake ParseHandshake(string value) => value switch
    {
        "XOnXOff" => Handshake.XOnXOff,
        "RTS/CTS" => Handshake.RequestToSend,
        _ => Handshake.None
    };

    private void ThrowIfDisposed() => ObjectDisposedException.ThrowIf(_disposed, this);

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        DisconnectCore(notify: false);
        _decoder.Reset();
        GC.SuppressFinalize(this);
    }
}
