using System.Globalization;

namespace PharmaStock.Desktop.Services;

public static class MoneyFormatter
{
    public static string Format(decimal value, string? currency)
    {
        var amount = value.ToString("N0", CultureInfo.InvariantCulture);
        return string.IsNullOrEmpty(currency) ? amount : $"{amount} {currency}";
    }
}
