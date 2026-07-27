using System.Collections.ObjectModel;
using System.Globalization;
using PharmaStock.Desktop.Services;

namespace PharmaStock.Desktop.Views;

public partial class PurchaseOrderCreatePage : ContentPage
{
    private readonly PharmaStockApiClient _api;
    private readonly SessionService _session;
    private readonly SupplierPickerPage _supplierPicker;
    private readonly ObservableCollection<CreateLineRow> _lines = new();

    private CancellationTokenSource? _searchDebounceCts;
    private SupplierResponse? _selectedSupplier;

    public PurchaseOrderCreatePage(PharmaStockApiClient api, SessionService session, SupplierPickerPage supplierPicker, ThemeService themeService)
    {
        InitializeComponent();
        _api = api;
        _session = session;
        _supplierPicker = supplierPicker;
        this.AttachStandardHeader(themeService, session);
        LinesView.ItemsSource = _lines;
    }

    private async void OnSupplierClicked(object? sender, EventArgs e)
    {
        try
        {
            var pickTask = _supplierPicker.PickAsync();
            await Navigation.PushModalAsync(_supplierPicker);
            var picked = await pickTask;
            if (picked is null) return;

            _selectedSupplier = picked;
            SupplierButton.Text = picked.Name;
            UpdateSubmitEnabled();
            await LoadRestockSuggestionsAsync();
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    private async Task LoadRestockSuggestionsAsync()
    {
        var locationId = _session.LocationId;
        if (_selectedSupplier is null || locationId is null) return;

        RestockSuggestionsSection.IsVisible = true;
        RestockSuggestionsView.ItemsSource = null;
        RestockSuggestionsView.IsVisible = false;
        NoRestockSuggestionsLabel.IsVisible = false;
        RestockSpinner.IsVisible = true;
        RestockSpinner.IsRunning = true;
        try
        {
            var companyId = _session.CompanyId!.Value;
            var suggestions = await _api.GetRestockSuggestionsAsync(companyId, _selectedSupplier.Id, locationId.Value);
            var rows = suggestions.Select(s => new RestockSuggestionRow(s)).ToList();
            RestockSuggestionsView.ItemsSource = rows;
            RestockSuggestionsView.IsVisible = rows.Count > 0;
            NoRestockSuggestionsLabel.IsVisible = rows.Count == 0;
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
            RestockSpinner.IsRunning = false;
            RestockSpinner.IsVisible = false;
        }
    }

    private void OnAddRestockSuggestionClicked(object? sender, EventArgs e)
    {
        if ((sender as Button)?.CommandParameter is not RestockSuggestionRow row) return;

        var existing = _lines.FirstOrDefault(l => l.ProductId == row.ProductId);
        if (existing is not null)
        {
            existing.Quantity = row.SuggestedQuantity;
            existing.UnitCost = row.EstimatedUnitCost;
            existing.RefreshText();
        }
        else
        {
            _lines.Add(new CreateLineRow(row.ProductId, row.Name, row.SuggestedQuantity, row.EstimatedUnitCost));
        }

        UpdateLinesVisibility();
        UpdateSubmitEnabled();
    }

    private async void OnSearchTextChanged(object? sender, TextChangedEventArgs e)
    {
        _searchDebounceCts?.Cancel();
        var cts = new CancellationTokenSource();
        _searchDebounceCts = cts;

        var term = e.NewTextValue?.Trim() ?? string.Empty;
        if (term.Length == 0)
        {
            SearchResultsView.ItemsSource = null;
            SearchResultsView.IsVisible = false;
            SearchSpinner.IsVisible = false;
            SearchSpinner.IsRunning = false;
            return;
        }

        try
        {
            await Task.Delay(350, cts.Token);

            SearchResultsView.ItemsSource = null;
            SearchResultsView.IsVisible = false;
            SearchSpinner.IsVisible = true;
            SearchSpinner.IsRunning = true;

            var companyId = _session.CompanyId!.Value;
            var results = await _api.SearchProductsAsync(companyId, term, cts.Token);
            if (cts.IsCancellationRequested) return;

            SearchResultsView.ItemsSource = results.ToList();
            SearchResultsView.IsVisible = results.Any();
        }
        catch (TaskCanceledException)
        {
            // Superseded by a newer keystroke — ignore.
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
            SearchSpinner.IsRunning = false;
            SearchSpinner.IsVisible = false;
        }
    }

    private void OnSearchResultSelected(object? sender, SelectionChangedEventArgs e)
    {
        var result = e.CurrentSelection.FirstOrDefault() as ProductSearchResult;
        SearchResultsView.SelectedItem = null;
        if (result is null) return;

        var existing = _lines.FirstOrDefault(l => l.ProductId == result.ProductId);
        if (existing is not null)
        {
            existing.Quantity += 1;
            existing.RefreshText();
        }
        else
        {
            _lines.Add(new CreateLineRow(result.ProductId, result.Name, 1, 0));
        }

        ProductSearchBar.Text = string.Empty;
        SearchResultsView.ItemsSource = null;
        SearchResultsView.IsVisible = false;
        UpdateLinesVisibility();
        UpdateSubmitEnabled();
    }

    private void OnRemoveLineClicked(object? sender, EventArgs e)
    {
        if ((sender as Button)?.CommandParameter is not CreateLineRow row) return;
        _lines.Remove(row);
        UpdateLinesVisibility();
        UpdateSubmitEnabled();
    }

    private void OnLineQuantityChanged(object? sender, TextChangedEventArgs e)
    {
        if ((sender as Entry)?.BindingContext is not CreateLineRow row) return;
        row.Quantity = ParseInt(e.NewTextValue) ?? 0;
        UpdateSubmitEnabled();
    }

    private void OnLineUnitCostChanged(object? sender, TextChangedEventArgs e)
    {
        if ((sender as Entry)?.BindingContext is not CreateLineRow row) return;
        row.UnitCost = ParseDecimal(e.NewTextValue) ?? 0;
        UpdateSubmitEnabled();
    }

    private void UpdateLinesVisibility()
    {
        LinesView.IsVisible = _lines.Count > 0;
        NoLinesLabel.IsVisible = _lines.Count == 0;
    }

    private void UpdateSubmitEnabled() =>
        SubmitButton.IsEnabled = _selectedSupplier is not null && _lines.Count > 0 && _lines.All(l => l.Quantity > 0 && l.UnitCost >= 0);

    private async void OnSubmitClicked(object? sender, EventArgs e)
    {
        if (_selectedSupplier is null || _lines.Count == 0) return;

        var locationId = _session.LocationId;
        if (locationId is null)
        {
            this.ShowError(LocalizationService.Translate("Stock_CannotDetermineLocation"));
            return;
        }

        SetBusy(true);
        try
        {
            var companyId = _session.CompanyId!.Value;
            var request = new CreatePurchaseOrderRequest(
                locationId.Value, _selectedSupplier.Id,
                string.IsNullOrWhiteSpace(NotesField.Text) ? null : NotesField.Text.Trim(),
                _lines.Select(l => new PurchaseOrderLineRequest(l.ProductId, l.Quantity, l.UnitCost)).ToList());

            await _api.CreatePurchaseOrderAsync(companyId, request);
            await Shell.Current.GoToAsync("..");
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

    private void SetBusy(bool busy)
    {
        SubmitButton.IsEnabled = !busy && _selectedSupplier is not null && _lines.Count > 0;
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

    private sealed class CreateLineRow : System.ComponentModel.INotifyPropertyChanged
    {
        public Guid ProductId { get; }
        public string ProductName { get; }
        public int Quantity { get; set; }
        public decimal UnitCost { get; set; }

        public string QuantityText => Quantity.ToString(CultureInfo.InvariantCulture);
        public string UnitCostText => UnitCost.ToString(CultureInfo.InvariantCulture);

        public event System.ComponentModel.PropertyChangedEventHandler? PropertyChanged;

        public CreateLineRow(Guid productId, string productName, int quantity, decimal unitCost)
        {
            ProductId = productId;
            ProductName = productName;
            Quantity = quantity;
            UnitCost = unitCost;
        }

        public void RefreshText()
        {
            PropertyChanged?.Invoke(this, new System.ComponentModel.PropertyChangedEventArgs(nameof(QuantityText)));
            PropertyChanged?.Invoke(this, new System.ComponentModel.PropertyChangedEventArgs(nameof(UnitCostText)));
        }
    }

    private sealed class RestockSuggestionRow
    {
        public Guid ProductId { get; }
        public string Name { get; }
        public int SuggestedQuantity { get; }
        public decimal EstimatedUnitCost { get; }
        public string SubtitleText { get; }

        public RestockSuggestionRow(RestockSuggestionItem item)
        {
            ProductId = item.ProductId;
            Name = item.Name;
            SuggestedQuantity = item.SuggestedQuantity;
            EstimatedUnitCost = item.EstimatedUnitCost;
            SubtitleText = LocalizationService.Translate(
                "PurchaseOrder_RestockSuggestionSubtitle", item.CurrentStock, item.LowStockThreshold, item.SuggestedQuantity);
        }
    }
}
