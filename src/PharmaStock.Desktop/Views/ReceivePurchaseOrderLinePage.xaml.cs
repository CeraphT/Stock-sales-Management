using System.Globalization;
using PharmaStock.Desktop.Services;

namespace PharmaStock.Desktop.Views;

/// <summary>Modal form for receiving a delivery against one PO line — pushed
/// by instance via Navigation.PushModalAsync, same pattern as
/// CategoryPickerPage/SupplierPickerPage. Reuses the exact same
/// Batch + StockMovement creation as a manual stock receive, just scoped to
/// this line's remaining quantity via the API's dedicated endpoint.</summary>
public partial class ReceivePurchaseOrderLinePage : ContentPage
{
    private readonly PharmaStockApiClient _api;
    private readonly SessionService _session;

    private Guid _purchaseOrderId;
    private PurchaseOrderLineResponse? _line;
    private TaskCompletionSource<bool>? _completionSource;

    public ReceivePurchaseOrderLinePage(PharmaStockApiClient api, SessionService session)
    {
        InitializeComponent();
        _api = api;
        _session = session;
        ExpiryDatePicker.Date = DateTime.Today.AddYears(1);
    }

    public Task<bool> ReceiveAsync(Guid purchaseOrderId, PurchaseOrderLineResponse line)
    {
        _purchaseOrderId = purchaseOrderId;
        _line = line;

        var remaining = line.QuantityOrdered - line.QuantityReceived;
        ProductNameLabel.Text = line.ProductName;
        RemainingLabel.Text = LocalizationService.Translate("PurchaseOrder_RemainingSubtitle", remaining, line.QuantityOrdered);
        BatchNumberField.Text = string.Empty;
        ExpiryDatePicker.Date = DateTime.Today.AddYears(1);
        QuantityField.Text = remaining.ToString(CultureInfo.InvariantCulture);
        ActualUnitCostField.Text = line.UnitCost.ToString(CultureInfo.InvariantCulture);

        _completionSource = new TaskCompletionSource<bool>();
        return _completionSource.Task;
    }

    private async void OnSaveClicked(object? sender, EventArgs e)
    {
        if (_line is null) return;

        if (string.IsNullOrWhiteSpace(BatchNumberField.Text))
        {
            this.ShowError(LocalizationService.Translate("StockReceive_BatchNumberRequired"));
            return;
        }

        var quantity = ParseInt(QuantityField.Text);
        var remaining = _line.QuantityOrdered - _line.QuantityReceived;
        if (quantity is null || quantity <= 0 || quantity > remaining)
        {
            this.ShowError(LocalizationService.Translate("PurchaseOrder_InvalidQuantity", remaining));
            return;
        }

        SetBusy(true);
        try
        {
            var companyId = _session.CompanyId!.Value;
            var request = new ReceivePurchaseOrderLineRequest(
                quantity.Value, BatchNumberField.Text.Trim(), ExpiryDatePicker.Date, ParseDecimal(ActualUnitCostField.Text));

            await _api.ReceivePurchaseOrderLineAsync(companyId, _purchaseOrderId, _line.Id, request);
            await CloseAsync(true);
        }
        catch (PharmaStockApiException ex)
        {
            this.ShowError(ex.Message);
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
        finally
        {
            SetBusy(false);
        }
    }

    private async void OnCancelClicked(object? sender, EventArgs e) => await CloseAsync(false);

    private async Task CloseAsync(bool received)
    {
        try
        {
            await Navigation.PopModalAsync();
        }
        finally
        {
            _completionSource?.TrySetResult(received);
        }
    }

    private void SetBusy(bool busy)
    {
        SaveButton.IsEnabled = !busy;
        Spinner.IsRunning = busy;
        Spinner.IsVisible = busy;
    }

    private static int? ParseInt(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        return int.TryParse(text.Trim(), NumberStyles.Any, CultureInfo.InvariantCulture, out var value) ? value : null;
    }

    private static decimal? ParseDecimal(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        var normalized = text.Trim().Replace(',', '.');
        return decimal.TryParse(normalized, NumberStyles.Any, CultureInfo.InvariantCulture, out var value) ? value : null;
    }
}
