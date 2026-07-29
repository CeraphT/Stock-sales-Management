using PharmaStock.Desktop.Services;

namespace PharmaStock.Desktop.Views;

[QueryProperty(nameof(ProductId), "productId")]
[QueryProperty(nameof(ProductName), "productName")]
public partial class StockReceivePage : ContentPage
{
    private readonly PharmaStockApiClient _api;
    private readonly SessionService _session;

    public string? ProductId { get; set; }
    public string? ProductName
    {
        get => ProductNameLabel.Text;
        set => ProductNameLabel.Text = Uri.UnescapeDataString(value ?? string.Empty);
    }

    public StockReceivePage(PharmaStockApiClient api, SessionService session)
    {
        InitializeComponent();
        _api = api;
        _session = session;
        ExpiryDatePicker.SelectedDate = DateTime.Today.AddYears(1);
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        SetBusy(true);
        try
        {
            await EnsureLocationAsync();
        }
        catch (PharmaStockApiException ex)
        {
            ShowError(ex.Message);
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

    // Same lazy single-location resolution as PosPage — every company has
    // exactly one default "Main" location today (no location picker yet).
    private async Task EnsureLocationAsync()
    {
        if (_session.LocationId is not null) return;

        var companyId = _session.CompanyId;
        if (companyId is null) return;

        var locations = await _api.GetLocationsAsync(companyId.Value);
        var location = locations.FirstOrDefault();
        if (location is null)
        {
            ShowError(LocalizationService.Translate("Pos_NoLocation"));
            return;
        }
        _session.SaveLocationId(location.Id);
    }

    private async void OnBackClicked(object? sender, EventArgs e)
    {
        try
        {
            await Shell.Current.GoToAsync("..");
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    private async void OnSaveClicked(object? sender, EventArgs e)
    {
        if (!Guid.TryParse(ProductId, out var productId))
        {
            ShowError(LocalizationService.Translate("Stock_ProductNotFound"));
            return;
        }

        var locationId = _session.LocationId;
        if (locationId is null)
        {
            ShowError(LocalizationService.Translate("Stock_CannotDetermineLocation"));
            return;
        }

        if (string.IsNullOrWhiteSpace(BatchNumberField.Text))
        {
            ShowError(LocalizationService.Translate("StockReceive_BatchNumberRequired"));
            return;
        }

        var quantity = QuantityEntry.Value.HasValue ? (int)QuantityEntry.Value.Value : (int?)null;
        if (quantity is null || quantity <= 0)
        {
            ShowError(LocalizationService.Translate("StockReceive_InvalidQuantity"));
            return;
        }

        var request = new ReceiveStockRequest(
            locationId.Value,
            BatchNumberField.Text.Trim(),
            ExpiryDatePicker.SelectedDate ?? DateTime.Today,
            quantity.Value,
            (decimal?)PurchasePriceEntry.Value);

        SetBusy(true);
        try
        {
            var companyId = _session.CompanyId!.Value;
            var batch = await _api.ReceiveStockAsync(companyId, productId, request);

            await this.DisplayAlertAsync(LocalizationService.Translate("StockReceive_SavedTitle"),
                LocalizationService.Translate("StockReceive_SavedMessage", batch.BatchNumber, batch.QuantityInBaseUnits), LocalizationService.Translate("Common_OK"));

            BatchNumberField.Text = string.Empty;
            QuantityEntry.Value = null;
            PurchasePriceEntry.Value = null;
        }
        catch (PharmaStockApiException ex)
        {
            ShowError(ex.Message);
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

    private void ShowError(string message) => ToastExtensions.ShowError(this, message);

    private void SetBusy(bool busy)
    {
        SaveButton.IsEnabled = !busy;
        Spinner.IsRunning = busy;
        Spinner.IsVisible = busy;
    }
}
