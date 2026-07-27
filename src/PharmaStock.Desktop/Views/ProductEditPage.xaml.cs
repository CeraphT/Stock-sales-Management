using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Globalization;
using PharmaStock.Desktop.Services;

namespace PharmaStock.Desktop.Views;

[QueryProperty(nameof(ProductId), "productId")]
public partial class ProductEditPage : ContentPage
{
    private readonly PharmaStockApiClient _api;
    private readonly SessionService _session;
    private readonly CategoryPickerPage _categoryPicker;
    private readonly PackagingUnitPickerPage _packagingUnitPicker;
    private readonly SupplierPickerPage _supplierPicker;
    private readonly ObservableCollection<PackagingLevelRow> _levels = new();

    private Guid? _productId;
    private Guid? _selectedCategoryId;
    private Guid? _selectedSupplierId;
    private bool _loaded;

    public string? ProductId
    {
        get => _productId?.ToString();
        set
        {
            // MAUI Shell can re-invoke this QueryProperty setter with the same
            // value after a modal round-trip (observed after returning from
            // PackagingUnitPickerPage/CategoryPickerPage) — unconditionally
            // resetting _loaded here made OnAppearing redo its full reload,
            // clearing any unsaved edits (like a just-added packaging level)
            // out from under an in-flight picker selection. Only reset when
            // the id actually changes.
            Guid? newId = Guid.TryParse(value, out var id) ? id : null;
            if (newId != _productId) _loaded = false;
            _productId = newId;
        }
    }

    public ProductEditPage(PharmaStockApiClient api, SessionService session, CategoryPickerPage categoryPicker, PackagingUnitPickerPage packagingUnitPicker, SupplierPickerPage supplierPicker)
    {
        InitializeComponent();
        _api = api;
        _session = session;
        _categoryPicker = categoryPicker;
        _packagingUnitPicker = packagingUnitPicker;
        _supplierPicker = supplierPicker;
        BindableLayout.SetItemsSource(PackagingLevelsView, _levels);
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        if (_loaded) return;
        _loaded = true;

        var isEdit = _productId.HasValue;
        TitleLabel.Text = LocalizationService.Translate(isEdit ? "ProductEdit_TitleEdit" : "ProductEdit_TitleNew");
        SaveButton.Text = LocalizationService.Translate(isEdit ? "ProductEdit_SaveExisting" : "ProductEdit_SaveNew");
        StockActionsRow.IsVisible = isEdit;
        if (!isEdit)
        {
            CategoryLabel.Text = LocalizationService.Translate("ProductEdit_NoCategory");
            SupplierLabel.Text = LocalizationService.Translate("ProductEdit_NoSupplier");
        }

        if (!isEdit) return;

        // Hides the whole form (not just disabling Save) while the fetch is
        // in flight — previously only SaveButton was disabled, so a keystroke
        // typed into NameField/etc. during the request got silently
        // overwritten the instant GetProductDetailAsync resolved and set
        // NameField.Text = detail.Name.
        FormScroll.IsVisible = false;
        LoadingSpinner.IsVisible = true;
        LoadingSpinner.IsRunning = true;
        try
        {
            SetBusy(true);
            var companyId = _session.CompanyId!.Value;
            var detail = await _api.GetProductDetailAsync(companyId, _productId!.Value);

            NameField.Text = detail.Name;
            BarcodeField.Text = detail.Barcode ?? string.Empty;
            _selectedCategoryId = detail.CategoryId;
            CategoryLabel.Text = detail.CategoryName ?? LocalizationService.Translate("ProductEdit_NoCategory");
            _selectedSupplierId = detail.SupplierId;
            SupplierLabel.Text = detail.SupplierName ?? LocalizationService.Translate("ProductEdit_NoSupplier");
            PurchasePriceField.Text = detail.PurchasePrice.ToString(CultureInfo.InvariantCulture);
            SalePriceField.Text = detail.SalePrice.ToString(CultureInfo.InvariantCulture);
            LowStockThresholdField.Text = detail.LowStockThreshold.ToString(CultureInfo.InvariantCulture);
            TaxRateField.Text = detail.TaxRateOverridePercent?.ToString(CultureInfo.InvariantCulture) ?? string.Empty;
            FavoriteCheckBox.IsChecked = detail.IsFavorite;
            SetArchivedState(detail.IsActive);

            _levels.Clear();
            foreach (var level in detail.PackagingLevels)
                _levels.Add(new PackagingLevelRow(level.UnitName, level.QuantityInBaseUnits, level.SalePriceOverride));
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
            LoadingSpinner.IsRunning = false;
            LoadingSpinner.IsVisible = false;
            FormScroll.IsVisible = true;
        }
    }

    private async void OnCategoryFieldTapped(object? sender, EventArgs e)
    {
        try
        {
            var pickTask = _categoryPicker.PickAsync();
            await Navigation.PushModalAsync(_categoryPicker);
            var category = await pickTask;
            if (category is null) return;

            _selectedCategoryId = category.Id;
            CategoryLabel.Text = category.Name;
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    private async void OnQuickAddCategoryClicked(object? sender, EventArgs e)
    {
        var name = await this.DisplayPromptAsync(LocalizationService.Translate("Category_NewTitle"), LocalizationService.Translate("Category_NamePrompt"));
        if (string.IsNullOrWhiteSpace(name)) return;

        try
        {
            var companyId = _session.CompanyId!.Value;
            var created = await _api.CreateCategoryAsync(companyId, name.Trim());
            _selectedCategoryId = created.Id;
            CategoryLabel.Text = created.Name;
        }
        catch (PharmaStockApiException ex)
        {
            ShowError(ex.Message);
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    private async void OnSupplierFieldTapped(object? sender, EventArgs e)
    {
        try
        {
            var pickTask = _supplierPicker.PickAsync();
            await Navigation.PushModalAsync(_supplierPicker);
            var supplier = await pickTask;
            if (supplier is null) return;

            _selectedSupplierId = supplier.Id;
            SupplierLabel.Text = supplier.Name;
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    private void OnAddPackagingLevelClicked(object? sender, EventArgs e)
        => _levels.Add(new PackagingLevelRow(string.Empty, 0, null));

    private void OnRemovePackagingLevelClicked(object? sender, EventArgs e)
    {
        if ((sender as Button)?.CommandParameter is PackagingLevelRow row)
            _levels.Remove(row);
    }

    private async void OnPackagingUnitNameTapped(object? sender, TappedEventArgs e)
    {
        if (e.Parameter is not PackagingLevelRow row) return;

        try
        {
            var pickTask = _packagingUnitPicker.PickAsync();
            await Navigation.PushModalAsync(_packagingUnitPicker);
            var name = await pickTask;
            if (name is null) return;

            row.UnitName = name;
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    private async void OnReceiveStockClicked(object? sender, EventArgs e)
    {
        if (_productId is null) return;
        try
        {
            await Shell.Current.GoToAsync(
                $"{nameof(StockReceivePage)}?productId={_productId}&productName={Uri.EscapeDataString(NameField.Text ?? string.Empty)}");
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    private async void OnAdjustStockClicked(object? sender, EventArgs e)
    {
        if (_productId is null) return;
        try
        {
            await Shell.Current.GoToAsync(
                $"{nameof(StockAdjustPage)}?productId={_productId}&productName={Uri.EscapeDataString(NameField.Text ?? string.Empty)}");
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    private async void OnSaveClicked(object? sender, EventArgs e)
    {
        if (string.IsNullOrWhiteSpace(NameField.Text))
        {
            ShowError(LocalizationService.Translate("ProductEdit_NameRequired"));
            return;
        }

        var purchasePrice = ParseDecimal(PurchasePriceField.Text);
        var salePrice = ParseDecimal(SalePriceField.Text);
        if (purchasePrice is null || salePrice is null)
        {
            ShowError(LocalizationService.Translate("ProductEdit_InvalidPrices"));
            return;
        }

        var lowStockThreshold = (int)(ParseDecimal(LowStockThresholdField.Text) ?? 0);
        var taxRate = ParseDecimal(TaxRateField.Text);

        var levelRequests = new List<PackagingLevelRequest>();
        foreach (var row in _levels)
        {
            if (string.IsNullOrWhiteSpace(row.UnitName)) continue;
            var quantity = (int)(ParseDecimal(row.QuantityText) ?? 0);
            if (quantity <= 0)
            {
                ShowError(LocalizationService.Translate("ProductEdit_PackagingLevelQuantityRequired", row.UnitName));
                return;
            }
            levelRequests.Add(new PackagingLevelRequest(row.UnitName.Trim(), quantity, ParseDecimal(row.SalePriceOverrideText)));
        }

        var request = new ProductRequest(
            NameField.Text.Trim(),
            string.IsNullOrWhiteSpace(BarcodeField.Text) ? null : BarcodeField.Text.Trim(),
            _selectedCategoryId, _selectedSupplierId,
            purchasePrice.Value, salePrice.Value, lowStockThreshold, taxRate,
            FavoriteCheckBox.IsChecked, levelRequests);

        SetBusy(true);
        try
        {
            var companyId = _session.CompanyId!.Value;
            if (_productId.HasValue)
                await _api.UpdateProductAsync(companyId, _productId.Value, request);
            else
                await _api.CreateProductAsync(companyId, request);

            await Shell.Current.GoToAsync(AppShell.ProductCatalogRoute);
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

    private async void OnDeleteProductClicked(object? sender, EventArgs e)
    {
        if (_productId is null) return;

        var confirmed = await this.DisplayAlertAsync(LocalizationService.Translate("ProductEdit_ArchiveTitle"),
            LocalizationService.Translate("ProductEdit_ArchiveMessage", NameField.Text),
            LocalizationService.Translate("ProductEdit_Archive"), LocalizationService.Translate("Common_Cancel"));
        if (!confirmed) return;

        SetBusy(true);
        try
        {
            var companyId = _session.CompanyId!.Value;
            await _api.DeleteProductAsync(companyId, _productId.Value);
            await Shell.Current.GoToAsync(AppShell.ProductCatalogRoute);
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

    private async void OnRestoreProductClicked(object? sender, EventArgs e)
    {
        if (_productId is null) return;

        SetBusy(true);
        try
        {
            var companyId = _session.CompanyId!.Value;
            await _api.RestoreProductAsync(companyId, _productId.Value);
            // Stay on the page rather than navigating away — restoring is
            // low-stakes/reversible, unlike delete, so there's no need to
            // interrupt whatever else the user was doing on this form.
            SetArchivedState(true);
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

    private void SetArchivedState(bool isActive)
    {
        ArchivedNoticeLabel.IsVisible = !isActive;
        DeleteButton.IsVisible = isActive;
        RestoreButton.IsVisible = !isActive;
    }

    private void ShowError(string message) => ToastExtensions.ShowError(this, message);

    private void SetBusy(bool busy)
    {
        SaveButton.IsEnabled = !busy;
        Spinner.IsRunning = busy;
        Spinner.IsVisible = busy;
    }

    private static decimal? ParseDecimal(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        var normalized = text.Trim().Replace(',', '.');
        return decimal.TryParse(normalized, NumberStyles.Any, CultureInfo.InvariantCulture, out var value) ? value : null;
    }

    private sealed class PackagingLevelRow : INotifyPropertyChanged
    {
        private string _unitName;

        public string UnitName
        {
            get => _unitName;
            set
            {
                _unitName = value;
                OnPropertyChanged(nameof(UnitName));
                OnPropertyChanged(nameof(UnitNameDisplay));
            }
        }

        public string UnitNameDisplay => string.IsNullOrWhiteSpace(UnitName) ? LocalizationService.Translate("ProductEdit_UnitNamePlaceholder") : UnitName;
        public string QuantityText { get; set; }
        public string SalePriceOverrideText { get; set; }

        public PackagingLevelRow(string unitName, int quantity, decimal? salePriceOverride)
        {
            _unitName = unitName;
            QuantityText = quantity > 0 ? quantity.ToString(CultureInfo.InvariantCulture) : string.Empty;
            SalePriceOverrideText = salePriceOverride?.ToString(CultureInfo.InvariantCulture) ?? string.Empty;
        }

        public event PropertyChangedEventHandler? PropertyChanged;
        private void OnPropertyChanged(string name) => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
    }
}
