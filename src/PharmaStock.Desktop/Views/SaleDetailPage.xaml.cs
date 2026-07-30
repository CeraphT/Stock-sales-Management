using System.Globalization;
using PharmaStock.Desktop.Services;

namespace PharmaStock.Desktop.Views;

[QueryProperty(nameof(SaleId), "saleId")]
public partial class SaleDetailPage : ContentPage
{
    private readonly PharmaStockApiClient _api;
    private readonly SessionService _session;
    private readonly ReceiptPrintingService _printing;

    private Guid? _saleId;
    private SaleDetailResponse? _sale;
    private string? _companyName;
    private string? _currency;

    public string? SaleId
    {
        get => _saleId?.ToString();
        set => _saleId = Guid.TryParse(value, out var id) ? id : null;
    }

    public SaleDetailPage(PharmaStockApiClient api, SessionService session, ReceiptPrintingService printing)
    {
        InitializeComponent();
        _api = api;
        _session = session;
        _printing = printing;
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        if (_saleId is null) return;

        ContentScroll.IsVisible = false;
        LoadingSpinner.IsVisible = true;
        LoadingSpinner.IsRunning = true;
        try
        {
            var companyId = _session.CompanyId!.Value;
            var company = await _api.GetCompanyAsync(companyId);
            _companyName = company.Name;
            _currency = company.Currency;
            _sale = await _api.GetSaleDetailAsync(companyId, _saleId.Value);
            Render(_sale);
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
        finally
        {
            LoadingSpinner.IsRunning = false;
            LoadingSpinner.IsVisible = false;
            ContentScroll.IsVisible = true;
        }
    }

    private void Render(SaleDetailResponse sale)
    {
        CompanyNameLabel.Text = _companyName;
        LocationLabel.Text = sale.LocationName;
        TimestampLabel.Text = sale.Timestamp.ToLocalTime().ToString("dd/MM/yyyy HH:mm", CultureInfo.InvariantCulture);
        CashierLabel.Text = LocalizationService.Translate("SaleDetail_Cashier", sale.CashierName);

        LinesView.ItemsSource = BuildReceiptLines(sale);
        TotalLabel.Text = MoneyFormatter.Format(sale.Total, _currency);
        PaymentBadge.Text = LocalizationService.TranslatePaymentMethod(sale.PaymentMethod);
        PaymentBadge.Color = LocalizationService.PaymentMethodColor(sale.PaymentMethod);

        var splits = sale.PaymentSplits.Select(p => new PaymentSplitRow(
            LocalizationService.TranslatePaymentMethod(p.Method), MoneyFormatter.Format(p.Amount, _currency))).ToList();
        PaymentBreakdownLabel.IsVisible = splits.Count > 0;
        PaymentSplitsView.IsVisible = splits.Count > 0;
        PaymentSplitsView.ItemsSource = splits;

        TenderedLabel.IsVisible = sale.AmountTendered.HasValue;
        TenderedLabel.Text = sale.AmountTendered.HasValue
            ? LocalizationService.Translate("SaleDetail_Tendered", MoneyFormatter.Format(sale.AmountTendered.Value, _currency))
            : string.Empty;

        ChangeDueLabel.IsVisible = sale.ChangeDue.HasValue;
        ChangeDueLabel.Text = sale.ChangeDue.HasValue
            ? LocalizationService.Translate("SaleDetail_ChangeDue", MoneyFormatter.Format(sale.ChangeDue.Value, _currency))
            : string.Empty;
    }

    private sealed record PaymentSplitRow(string MethodText, string AmountText);

    // Shared between the on-screen line list (LinesView binds Name/DetailText/
    // AmountText directly) and the printed receipt, so the two never drift apart.
    private static List<ReceiptLine> BuildReceiptLines(SaleDetailResponse sale) =>
        sale.ProductLines.Select(l => new ReceiptLine(
            l.ProductName,
            l.PackagingLevelName is null
                ? LocalizationService.Translate("Pos_ReceiptUnitLine", l.QuantityInBaseUnits, l.UnitPrice.ToString("N0", CultureInfo.InvariantCulture))
                : $"{l.QuantityInBaseUnits / l.UnitsPerPackagingLevel} {l.PackagingLevelName} × {(l.UnitPrice * l.UnitsPerPackagingLevel).ToString("N0", CultureInfo.InvariantCulture)}",
            l.LineTotal.ToString("N0", CultureInfo.InvariantCulture))).ToList();

    private async void OnPrintClicked(object? sender, EventArgs e)
    {
        if (_sale is null) return;

        var paymentSplits = _sale.PaymentSplits.Any()
            ? _sale.PaymentSplits.Select(p => (LocalizationService.TranslatePaymentMethod(p.Method), p.Amount.ToString("N0", CultureInfo.InvariantCulture))).ToList()
            : null;

        var receipt = new ReceiptData(
            _companyName ?? string.Empty, _sale.LocationName, _sale.CashierName, _sale.Timestamp,
            BuildReceiptLines(_sale), _sale.Total.ToString("N0", CultureInfo.InvariantCulture),
            LocalizationService.TranslatePaymentMethod(_sale.PaymentMethod), _currency ?? string.Empty,
            paymentSplits,
            _sale.AmountTendered?.ToString("N0", CultureInfo.InvariantCulture),
            _sale.ChangeDue?.ToString("N0", CultureInfo.InvariantCulture));

        try
        {
            await _printing.PrintReceiptAsync(receipt);
        }
        catch (NoPrinterConfiguredException)
        {
            var goToSettings = await this.DisplayAlertAsync(
                LocalizationService.Translate("Printer_NoneConfiguredTitle"), LocalizationService.Translate("Printer_NoneConfiguredMessage"),
                LocalizationService.Translate("Printer_Configure"), LocalizationService.Translate("Common_Cancel"));
            if (goToSettings)
                await Shell.Current.GoToAsync(AppShell.PrinterSettingsRoute);
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }
}
