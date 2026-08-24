using System.Text;

namespace GoldBar.Windows.Core;

/// <summary>
/// Incrementally reconstructs ASCII frames received from a serial scale.
/// Supports CR/LF terminated frames, STX/ETX framed packets, fragmented reads,
/// and a bounded idle-flush fallback for devices that do not send a terminator.
/// </summary>
public sealed class ScaleFrameDecoder
{
    private const int MaxFrameLength = 256;
    private readonly StringBuilder _buffer = new(MaxFrameLength);

    public bool HasBufferedData => _buffer.Length > 0;

    public IReadOnlyList<string> Push(ReadOnlySpan<byte> bytes)
    {
        var frames = new List<string>();

        foreach (var b in bytes)
        {
            switch (b)
            {
                case 0x02: // STX: begin a new explicit frame.
                    _buffer.Clear();
                    break;

                case 0x03: // ETX: finish the current explicit frame.
                    FlushTo(frames);
                    break;

                case (byte)'\r':
                case (byte)'\n':
                    FlushTo(frames);
                    break;

                case 0x00:
                    // Some USB/serial adapters pad buffers with NUL bytes.
                    break;

                default:
                    // Scales in this application use ASCII. Keep TAB and printable
                    // characters; ignore other control bytes rather than polluting a frame.
                    if (b == (byte)'\t' || b is >= 0x20 and <= 0x7E)
                    {
                        if (_buffer.Length >= MaxFrameLength)
                            _buffer.Clear(); // Corrupt/unbounded frame: resynchronize safely.
                        _buffer.Append((char)b);
                    }
                    break;
            }
        }

        return frames;
    }

    public string? FlushIdle()
    {
        if (_buffer.Length == 0) return null;
        var frame = _buffer.ToString().Trim();
        _buffer.Clear();
        return frame.Length == 0 ? null : frame;
    }

    public void Reset() => _buffer.Clear();

    private void FlushTo(List<string> frames)
    {
        var frame = FlushIdle();
        if (frame is not null) frames.Add(frame);
    }
}
