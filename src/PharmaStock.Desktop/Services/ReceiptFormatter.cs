using System.Text;

namespace PharmaStock.Desktop.Services;

public record ReceiptLine(string Name, string DetailText, string AmountText);

public record ReceiptData(
    string CompanyName,
    string? LocationName,
    string CashierName,
    DateTime Timestamp,
    IReadOnlyList<ReceiptLine> Lines,
    string TotalText,
    string PaymentMethodText,
    string Currency,
    IReadOnlyList<(string MethodText, string AmountText)>? PaymentSplits = null,
    string? TenderedText = null,
    string? ChangeDueText = null);

/// <summary>Builds a raw ESC/POS byte stream for a 58mm thermal receipt
/// printer (32 characters/line at normal width on Font A — the standard for
/// these mini printers, e.g. the Bisoice-style clones this app targets). Not
/// a general ESC/POS library: just the handful of commands one receipt
/// needs (init, codepage, align, bold, feed, cut).</summary>
public static class ReceiptFormatter
{
    private const int LineWidth = 32;

    // Cheap 58mm ESC/POS clones don't agree on a single codepage numbering
    // scheme for "ESC t n", so accented characters (é, è, à…) are a
    // best-effort: CP850 covers Western-European accents and is a common
    // default, but a specific printer may need a different "n" here. If
    // accents come out wrong on the real device, this is the one place to
    // adjust — the rest of the receipt still prints fine either way.
    private static readonly Encoding TextEncoding = ResolveEncoding();
    private const byte CodePageSelector = 2;

    private static Encoding ResolveEncoding()
    {
        try { return Encoding.GetEncoding(850); }
        catch { return Encoding.ASCII; }
    }

    public static byte[] Build(ReceiptData receipt)
    {
        using var stream = new MemoryStream();

        WriteRaw(stream, 0x1B, 0x40); // ESC @ — initialize
        WriteRaw(stream, 0x1B, 0x74, CodePageSelector); // ESC t n — select character code table

        WriteAlign(stream, Align.Center);
        WriteBold(stream, true);
        WriteLine(stream, receipt.CompanyName);
        WriteBold(stream, false);
        if (!string.IsNullOrWhiteSpace(receipt.LocationName))
            WriteLine(stream, receipt.LocationName);
        WriteLine(stream, receipt.Timestamp.ToLocalTime().ToString("dd/MM/yyyy HH:mm"));
        WriteLine(stream, $"Caissier(e) : {receipt.CashierName}");
        WriteSeparator(stream);

        WriteAlign(stream, Align.Left);
        foreach (var line in receipt.Lines)
        {
            foreach (var wrapped in Wrap(line.Name, LineWidth))
                WriteLine(stream, wrapped);
            WriteJustified(stream, line.DetailText, line.AmountText);
        }

        WriteSeparator(stream);
        WriteBold(stream, true);
        WriteJustified(stream, "TOTAL", $"{receipt.TotalText} {receipt.Currency}");
        WriteBold(stream, false);

        if (receipt.PaymentSplits is { Count: > 0 })
        {
            foreach (var split in receipt.PaymentSplits)
                WriteJustified(stream, split.MethodText, split.AmountText);
        }
        else
        {
            WriteLine(stream, receipt.PaymentMethodText);
        }

        if (receipt.TenderedText is not null)
            WriteJustified(stream, "Reçu", receipt.TenderedText);
        if (receipt.ChangeDueText is not null)
            WriteJustified(stream, "Monnaie", receipt.ChangeDueText);

        WriteSeparator(stream);

        WriteAlign(stream, Align.Center);
        WriteLine(stream, "Merci de votre visite !");
        WriteFeed(stream, 4);
        WriteRaw(stream, 0x1D, 0x56, 1); // GS V 1 — partial cut; harmlessly ignored by printers with no cutter

        return stream.ToArray();
    }

    private enum Align : byte { Left = 0, Center = 1, Right = 2 }

    private static void WriteAlign(MemoryStream s, Align a) => WriteRaw(s, 0x1B, 0x61, (byte)a);
    private static void WriteBold(MemoryStream s, bool on) => WriteRaw(s, 0x1B, 0x45, (byte)(on ? 1 : 0));
    private static void WriteFeed(MemoryStream s, int lines) => WriteRaw(s, 0x1B, 0x64, (byte)lines);

    private static void WriteSeparator(MemoryStream s) => WriteLine(s, new string('-', LineWidth));

    private static void WriteLine(MemoryStream s, string text)
    {
        var bytes = TextEncoding.GetBytes(text);
        s.Write(bytes, 0, bytes.Length);
        s.WriteByte(0x0A); // LF
    }

    // Right-aligns amount to the line's edge, truncating the label if the
    // two together would overflow LineWidth.
    private static void WriteJustified(MemoryStream s, string label, string amount)
    {
        var maxLabelWidth = Math.Max(1, LineWidth - amount.Length - 1);
        var trimmedLabel = label.Length > maxLabelWidth ? label[..maxLabelWidth] : label;
        var padding = Math.Max(1, LineWidth - trimmedLabel.Length - amount.Length);
        WriteLine(s, trimmedLabel + new string(' ', padding) + amount);
    }

    private static IEnumerable<string> Wrap(string text, int width)
    {
        if (text.Length <= width) { yield return text; yield break; }
        for (var i = 0; i < text.Length; i += width)
            yield return text.Substring(i, Math.Min(width, text.Length - i));
    }

    private static void WriteRaw(MemoryStream s, params byte[] bytes) => s.Write(bytes, 0, bytes.Length);
}
