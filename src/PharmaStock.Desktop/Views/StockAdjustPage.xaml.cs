using PharmaStock.Desktop.Services;

namespace PharmaStock.Desktop.Views;

[QueryProperty(nameof(ProductId), "productId")]
[QueryProperty(nameof(ProductName), "productName")]
public partial class StockAdjustPage : ContentPage
{
    private readonly PharmaStockApiClient _api;
    private readonly SessionService _session;
    private List<BatchResponse> _batches = new();

    public string? ProductId { get; set; }
    public string? ProductName
    {
        get => ProductNameLabel.Text;
        set => ProductNameLabel.Text = Uri.UnescapeDataString(value ?? string.Empty);
    }

    public StockAdjustPage(PharmaStockApiClient api, SessionService session)
    {
        InitializeComponent();
        _api = api;
        _session = session;
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        SetBusy(true);
        try
        {
            await LoadBatchesAsync();
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

    private async Task LoadBatchesAsync()
    {
        if (!Guid.TryParse(ProductId, out var productId)) return;

        var companyId = _session.CompanyId!.Value;
        _batches = await _api.GetBatchesAsync(companyId, productId);

        var selectedIndex = BatchPicker.SelectedIndex;
        BatchPicker.ItemsSource = _batches
            .Select(b => LocalizationService.Translate("StockAdjust_BatchUnits", b.BatchNumber, b.QuantityInBaseUnits) +
                (b.ExpiryDate.HasValue ? LocalizationService.Translate("StockAdjust_BatchExpiry", b.ExpiryDate.Value.ToString("dd/MM/yyyy")) : string.Empty))
            .ToList();
        if (selectedIndex >= 0 && selectedIndex < _batches.Count)
            BatchPicker.SelectedIndex = selectedIndex;
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

        if (BatchPicker.SelectedIndex < 0 || BatchPicker.SelectedIndex >= _batches.Count)
        {
            ShowError(LocalizationService.Translate("StockAdjust_ChooseBatch"));
            return;
        }

        var delta = DeltaEntry.Value.HasValue ? (int)DeltaEntry.Value.Value : (int?)null;
        if (delta is null || delta == 0)
        {
            ShowError(LocalizationService.Translate("StockAdjust_InvalidDelta"));
            return;
        }

        if (string.IsNullOrWhiteSpace(ReasonField.Text))
        {
            ShowError(LocalizationService.Translate("StockAdjust_ReasonRequired"));
            return;
        }

        var batch = _batches[BatchPicker.SelectedIndex];
        var request = new AdjustStockRequest(batch.Id, delta.Value, ReasonField.Text.Trim());

        SetBusy(true);
        try
        {
            var companyId = _session.CompanyId!.Value;
            var updated = await _api.AdjustStockAsync(companyId, productId, request);

            await this.DisplayAlertAsync(LocalizationService.Translate("StockAdjust_SavedTitle"),
                LocalizationService.Translate("StockAdjust_SavedMessage", updated.BatchNumber, updated.QuantityInBaseUnits), LocalizationService.Translate("Common_OK"));

            DeltaEntry.Value = null;
            ReasonField.Text = string.Empty;
            await LoadBatchesAsync();
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
