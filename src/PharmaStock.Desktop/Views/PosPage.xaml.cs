using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Globalization;
using PharmaStock.Desktop.Services;
using PharmaStock.Domain.Models;

namespace PharmaStock.Desktop.Views;

public partial class PosPage : ContentPage
{
    private readonly LocalSalesService _localSales;
    private readonly LocalCatalogQueryService _localCatalog;
    private readonly SessionService _session;
    private readonly SyncService _sync;
    private readonly BarcodeScannerPage _scannerPage;
    private readonly ReceiptPrintingService _printing;
    private readonly HeldSalesPage _heldSalesPage;
    private readonly ObservableCollection<CartLine> _cart = new();

    private CancellationTokenSource? _searchDebounceCts;
    private PaymentMethod _selectedPaymentMethod = PaymentMethod.Cash;
    private bool _checkoutInProgress;
    private string? _companyName;
    private string? _companyCurrency;
    private string? _locationName;

    public PosPage(LocalSalesService localSales, LocalCatalogQueryService localCatalog, SessionService session, SyncService sync, BarcodeScannerPage scannerPage, ReceiptPrintingService printing, HeldSalesPage heldSalesPage, ThemeService themeService)
    {
        InitializeComponent();
        _localSales = localSales;
        _localCatalog = localCatalog;
        _session = session;
        _sync = sync;
        _scannerPage = scannerPage;
        _printing = printing;
        _heldSalesPage = heldSalesPage;
        this.AttachStandardHeader(themeService, session);

        CartView.ItemsSource = _cart;
        ScanButton.IsVisible = DeviceInfo.Current.Platform == Microsoft.Maui.Devices.DevicePlatform.Android;
        ApplyResponsiveLayout();
        ApplyPaymentModeUi();
    }

    // Phone: MainColumnGrid (search/cart) stacked above FooterPanel (payment/
    // checkout), same as every other page — one column, whole thing scrolls
    // top to bottom. Tablet: side by side instead, so the checkout panel
    // stays pinned and visible no matter how long the cart gets, rather than
    // requiring a scroll past every line to reach "Encaisser". Same two
    // control instances either way — only their Grid.Row/Column changes.
    private void ApplyResponsiveLayout()
    {
        RootLayoutGrid.RowDefinitions.Clear();
        RootLayoutGrid.ColumnDefinitions.Clear();

        if (DeviceInfo.Current.Idiom == DeviceIdiom.Tablet)
        {
            RootLayoutGrid.ColumnDefinitions.Add(new ColumnDefinition(GridLength.Star));
            RootLayoutGrid.ColumnDefinitions.Add(new ColumnDefinition(420));
            Grid.SetRow(MainColumnGrid, 0);
            Grid.SetColumn(MainColumnGrid, 0);
            Grid.SetRow(FooterPanel, 0);
            Grid.SetColumn(FooterPanel, 1);
        }
        else
        {
            RootLayoutGrid.RowDefinitions.Add(new RowDefinition(GridLength.Star));
            RootLayoutGrid.RowDefinitions.Add(new RowDefinition(GridLength.Auto));
            Grid.SetRow(MainColumnGrid, 0);
            Grid.SetColumn(MainColumnGrid, 0);
            Grid.SetRow(FooterPanel, 1);
            Grid.SetColumn(FooterPanel, 0);
        }
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        try
        {
            await EnsureLocationAndCurrencyAsync();
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

    // Every company currently has exactly one default "Main" location (no
    // location-picker UI exists yet) — resolved lazily here and cached in
    // SessionService rather than at login, to avoid touching LoginPage.
    private async Task EnsureLocationAndCurrencyAsync()
    {
        var companyId = _session.CompanyId;
        if (companyId is null) return;

        if (_session.LocationId is null || _locationName is null)
        {
            var locations = await _localCatalog.GetLocationsAsync(companyId.Value);
            if (locations.Count == 0)
            {
                // Local cache is empty — most likely a freshly-installed
                // device whose first background sync (fired at login) is
                // still running or hasn't started yet. SyncNowAsync awaits
                // that same in-flight cycle instead of racing a second one,
                // so this blocks only as long as the real bootstrap sync
                // takes, then the local query is retried once.
                await _sync.SyncNowAsync();
                locations = await _localCatalog.GetLocationsAsync(companyId.Value);
            }

            var location = _session.LocationId is { } existingId
                ? locations.FirstOrDefault(l => l.Id == existingId) ?? locations.FirstOrDefault()
                : locations.FirstOrDefault();
            if (location is null)
            {
                ShowError(LocalizationService.Translate("Pos_NoLocation"));
                return;
            }
            _session.SaveLocationId(location.Id);
            _locationName = location.Name;
        }

        if (_companyCurrency is null)
        {
            var company = await _localCatalog.GetCompanyAsync(companyId.Value);
            _companyName = company.Name;
            _companyCurrency = company.Currency;
            UpdateTotalsAndButtons();
        }
    }


    private async void OnBarcodeEntryCompleted(object? sender, EventArgs e)
    {
        var barcode = BarcodeEntry.Text?.Trim();
        BarcodeEntry.Text = string.Empty;
        if (string.IsNullOrWhiteSpace(barcode)) return;

        await HandleScannedBarcodeAsync(barcode);
    }

    private async void OnScanClicked(object? sender, EventArgs e)
    {
        try
        {
            var scanTask = _scannerPage.ScanAsync();
            await Navigation.PushModalAsync(_scannerPage);
            var barcode = await scanTask;
            if (!string.IsNullOrWhiteSpace(barcode))
                await HandleScannedBarcodeAsync(barcode);
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    private async Task HandleScannedBarcodeAsync(string barcode)
    {
        try
        {
            var companyId = _session.CompanyId!.Value;
            var availability = await _localCatalog.GetProductAvailabilityAsync(companyId, barcode);
            await AddProductToCartAsync(availability.ProductId, availability.Name, availability.SalePrice,
                availability.PackagingLevels.ToList());
            UpdateTotalsAndButtons();
        }
        catch (PharmaStockApiException ex)
        {
            ShowError(ex.StatusCode == 404 ? LocalizationService.Translate("Pos_BarcodeNotFound", barcode) : ex.Message);
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
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

            // The debounce passed uncancelled, so this term is now actually
            // being searched — clear whatever the previous term's results
            // were (stale for this term) and show the spinner for the
            // network round-trip, rather than leaving old rows on screen
            // with zero feedback until the new response arrives.
            SearchResultsView.ItemsSource = null;
            SearchResultsView.IsVisible = false;
            SearchSpinner.IsVisible = true;
            SearchSpinner.IsRunning = true;

            var companyId = _session.CompanyId!.Value;
            var results = await _localCatalog.SearchProductsAsync(companyId, term, cts.Token);
            if (cts.IsCancellationRequested) return;

            // Out-of-stock matches are still shown (a cashier may need to see
            // "this exists but we have none left"), just pushed to the
            // bottom so the sellable matches are never buried under them.
            var rows = results.Select(r => new ProductSearchRow(r, _companyCurrency))
                .OrderBy(r => r.IsOutOfStock)
                .ToList();
            SearchResultsView.ItemsSource = rows;
            SearchResultsView.IsVisible = rows.Count > 0;
        }
        catch (TaskCanceledException)
        {
            // Superseded by a newer keystroke — ignore.
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
            SearchSpinner.IsRunning = false;
            SearchSpinner.IsVisible = false;
        }
    }

    private async void OnSearchResultSelected(object? sender, SelectionChangedEventArgs e)
    {
        var row = e.CurrentSelection.FirstOrDefault() as ProductSearchRow;
        SearchResultsView.SelectedItem = null; // allow tapping the same result again later
        if (row is null) return;

        try
        {
            await AddProductToCartAsync(row.Result.ProductId, row.Result.Name, row.Result.SalePrice,
                row.Result.PackagingLevels.ToList());
            UpdateTotalsAndButtons();
            ProductSearchBar.Text = string.Empty;
            SearchResultsView.ItemsSource = null;
            SearchResultsView.IsVisible = false;
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    // Both the barcode-scan path and the search-tap path funnel through here.
    // If a product has packaging levels (Box/Blister/...) beyond its base
    // unit, the cashier is asked which one they're selling.
    private async Task AddProductToCartAsync(Guid productId, string name, decimal baseSalePrice, IReadOnlyList<PackagingLevelInfo> levels)
    {
        var unitWord = LocalizationService.Translate("Pos_Unit");
        if (levels.Count == 0)
        {
            AddOrIncrementCartLine(productId, null, name, unitWord, baseSalePrice);
            return;
        }

        var options = new List<(string Label, Guid? LevelId, string UnitLabel, decimal Price)>
        {
            ($"{LocalizationService.Translate("Pos_UnitCapitalized")} — {FormatMoney(baseSalePrice)}", null, unitWord, baseSalePrice)
        };
        options.AddRange(levels.Select(l =>
            ($"{l.UnitName} — {FormatMoney(l.UnitPrice)}", (Guid?)l.Id, l.UnitName, l.UnitPrice)));

        var cancelLabel = LocalizationService.Translate("Common_Cancel");
        var choice = await this.DisplayActionSheetAsync(name, cancelLabel, null, options.Select(o => o.Label).ToArray());
        if (string.IsNullOrEmpty(choice) || choice == cancelLabel) return;

        var selected = options.FirstOrDefault(o => o.Label == choice);
        if (selected.Label is null) return;

        AddOrIncrementCartLine(productId, selected.LevelId, name, selected.UnitLabel, selected.Price);
    }

    private void AddOrIncrementCartLine(Guid productId, Guid? packagingLevelId, string name, string unitLabel, decimal unitPrice)
    {
        var existing = _cart.FirstOrDefault(l => l.ProductId == productId && l.PackagingLevelId == packagingLevelId);
        if (existing is not null)
        {
            existing.Quantity += 1;
        }
        else
        {
            _cart.Add(new CartLine(productId, packagingLevelId, name, unitLabel, unitPrice, 1, _companyCurrency));
        }
        UpdateTotalsAndButtons();
    }

    private void OnIncreaseQuantityClicked(object? sender, EventArgs e)
    {
        if ((sender as Button)?.CommandParameter is not CartLine line) return;
        line.Quantity += 1;
        UpdateTotalsAndButtons();
    }

    private void OnDecreaseQuantityClicked(object? sender, EventArgs e)
    {
        if ((sender as Button)?.CommandParameter is not CartLine line) return;
        if (line.Quantity <= 1)
            _cart.Remove(line);
        else
            line.Quantity -= 1;
        UpdateTotalsAndButtons();
    }

    private void OnRemoveLineClicked(object? sender, EventArgs e)
    {
        if ((sender as Button)?.CommandParameter is not CartLine line) return;
        _cart.Remove(line);
        UpdateTotalsAndButtons();
    }

    private void OnCashChipClicked(object? sender, EventArgs e) => SelectPaymentMethod(PaymentMethod.Cash);

    private void OnMobileMoneyChipClicked(object? sender, EventArgs e) => SelectPaymentMethod(PaymentMethod.MobileMoney);

    private void OnSplitChipClicked(object? sender, EventArgs e) => SelectPaymentMethod(PaymentMethod.Split);

    private void SelectPaymentMethod(PaymentMethod method)
    {
        // Re-tapping the already-active chip must not wipe whatever the
        // cashier is mid-typing into the tendered/split amount fields.
        if (_selectedPaymentMethod == method) return;
        _selectedPaymentMethod = method;
        ApplyPaymentModeUi();
    }

    // Syncs chip styling + which amount fields are visible to
    // _selectedPaymentMethod, and clears any amounts typed under the
    // previous mode — a stale "10000 tendered" from Cash mode must not
    // silently carry into Split mode against a smaller cash leg.
    private void ApplyPaymentModeUi()
    {
        CashChip.Style = (Style)Application.Current!.Resources[_selectedPaymentMethod == PaymentMethod.Cash ? "ChipButtonSelected" : "ChipButtonUnselected"];
        MobileMoneyChip.Style = (Style)Application.Current!.Resources[_selectedPaymentMethod == PaymentMethod.MobileMoney ? "ChipButtonSelected" : "ChipButtonUnselected"];
        SplitChip.Style = (Style)Application.Current!.Resources[_selectedPaymentMethod == PaymentMethod.Split ? "ChipButtonSelected" : "ChipButtonUnselected"];

        SplitCashEntry.Text = string.Empty;
        SplitMobileMoneyEntry.Text = string.Empty;
        TenderedEntry.Text = string.Empty;

        SplitPaymentDetail.IsVisible = _selectedPaymentMethod == PaymentMethod.Split;
        TenderedDetail.IsVisible = _selectedPaymentMethod is PaymentMethod.Cash or PaymentMethod.Split;

        UpdateTotalsAndButtons();
    }

    private void OnTenderedTextChanged(object? sender, TextChangedEventArgs e) => UpdateTotalsAndButtons();

    private void OnSplitCashTextChanged(object? sender, TextChangedEventArgs e) => UpdateTotalsAndButtons();

    private void OnSplitMobileMoneyTextChanged(object? sender, TextChangedEventArgs e) => UpdateTotalsAndButtons();

    private async void OnCheckoutClicked(object? sender, EventArgs e)
    {
        if (_cart.Count == 0) return;

        var companyId = _session.CompanyId;
        var locationId = _session.LocationId;
        if (companyId is null || locationId is null)
        {
            ShowError(LocalizationService.Translate("Pos_CannotDetermineLocation"));
            return;
        }

        _checkoutInProgress = true;
        SetBusy(true);
        try
        {
            List<PaymentSplitRequest>? paymentSplits = null;
            if (_selectedPaymentMethod == PaymentMethod.Split)
            {
                paymentSplits = new List<PaymentSplitRequest>
                {
                    new(PaymentMethod.Cash, ParseDecimal(SplitCashEntry.Text) ?? 0),
                    new(PaymentMethod.MobileMoney, ParseDecimal(SplitMobileMoneyEntry.Text) ?? 0),
                };
            }
            var amountTendered = TenderedDetail.IsVisible ? ParseDecimal(TenderedEntry.Text) : null;

            var request = new CreateSaleRequest(
                locationId.Value, null, _selectedPaymentMethod,
                _cart.Select(l => new SaleLineRequest(l.ProductId, l.Quantity, l.PackagingLevelId)).ToList(),
                null, paymentSplits, amountTendered);

            var sale = await _localSales.CreateSaleAsync(companyId.Value, request);

            _cart.Clear();
            _selectedPaymentMethod = PaymentMethod.Cash;
            ApplyPaymentModeUi();

            var wantsPrint = await this.DisplayAlertAsync(
                LocalizationService.Translate("Pos_SaleComplete"), LocalizationService.Translate("Pos_SaleTotal", FormatMoney(sale.Total)),
                LocalizationService.Translate("Pos_PrintAction"), LocalizationService.Translate("Common_OK"));
            if (wantsPrint)
                await PrintReceiptAsync(sale);
        }
        catch (PharmaStockApiException ex)
        {
            // Includes 409 (insufficient stock) — the cart is deliberately left
            // intact so the cashier can adjust quantity and retry instead of
            // losing a half-built sale.
            ShowError(ex.Message);
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
        finally
        {
            _checkoutInProgress = false;
            SetBusy(false);
            UpdateTotalsAndButtons();
        }
    }

    // Section 18.1 — parks the current cart server-side with no stock impact
    // (see SaleEndpoints' /sales/hold: no FEFO deduction happens until the
    // cart is actually resumed and checked out) and clears it locally so the
    // cashier can start a fresh sale, e.g. for the next customer.
    private async void OnHoldClicked(object? sender, EventArgs e)
    {
        if (_cart.Count == 0) return;

        var companyId = _session.CompanyId;
        var locationId = _session.LocationId;
        if (companyId is null || locationId is null)
        {
            ShowError(LocalizationService.Translate("Pos_CannotDetermineLocation"));
            return;
        }

        SetBusy(true);
        try
        {
            var request = new HoldSaleRequest(
                locationId.Value, null,
                _cart.Select(l => new SaleLineRequest(l.ProductId, l.Quantity, l.PackagingLevelId)).ToList());

            await _localSales.HoldSaleAsync(companyId.Value, request);

            _cart.Clear();
            _selectedPaymentMethod = PaymentMethod.Cash;
            ApplyPaymentModeUi();
            ToastExtensions.ShowSuccess(this, LocalizationService.Translate("Pos_HoldSuccess"));
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

    // Resuming requires an empty cart rather than merging into whatever's
    // already there — silently combining two carts is far more likely to
    // confuse a cashier (and misprice a line if the same product ends up
    // needing to merge quantities across two different sources) than
    // asking them to check out or hold their current cart first.
    private async void OnResumeClicked(object? sender, EventArgs e)
    {
        if (_cart.Count > 0)
        {
            ShowError(LocalizationService.Translate("Pos_CartNotEmptyForResume"));
            return;
        }

        try
        {
            var pickTask = _heldSalesPage.PickAsync();
            await Navigation.PushModalAsync(_heldSalesPage);
            var saleId = await pickTask;
            if (saleId is null) return;

            var companyId = _session.CompanyId!.Value;
            var sale = await _localSales.GetSaleDetailAsync(companyId, saleId.Value);

            foreach (var line in sale.ProductLines)
            {
                // SaleLineResponse.UnitPrice is always per BASE unit (see its
                // own doc comment in SaleEndpoints.cs) — the cart wants price
                // per the packaging level actually sold (e.g. per box), so it
                // has to be scaled back up by UnitsPerPackagingLevel.
                var unitsPerLevel = line.UnitsPerPackagingLevel <= 0 ? 1 : line.UnitsPerPackagingLevel;
                var quantity = line.QuantityInBaseUnits / unitsPerLevel;
                var unitPrice = line.UnitPrice * unitsPerLevel;
                var unitLabel = line.PackagingLevelName ?? LocalizationService.Translate("Pos_Unit");
                _cart.Add(new CartLine(line.ProductId, line.PackagingLevelId, line.ProductName, unitLabel, unitPrice, quantity, _companyCurrency));
            }

            // Best-effort: if this fails, the cart is already populated on
            // screen (nothing is lost for this cashier) but the held-sale row
            // lingers server-side as a duplicate of what's now in the cart —
            // rare, and cheap to clean up later from the held-sales list.
            await _localSales.DeleteHeldSaleAsync(companyId, saleId.Value);
            UpdateTotalsAndButtons();
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

    private async Task PrintReceiptAsync(SaleResponse sale)
    {
        var lines = sale.ProductLines.Select(l => new ReceiptLine(
            l.ProductName,
            l.PackagingLevelName is null
                ? LocalizationService.Translate("Pos_ReceiptUnitLine", l.QuantityInBaseUnits, FormatMoney(l.UnitPrice))
                : $"{l.QuantityInBaseUnits / l.UnitsPerPackagingLevel} {l.PackagingLevelName} × {FormatMoney(l.UnitPrice * l.UnitsPerPackagingLevel)}",
            FormatMoney(l.LineTotal))).ToList();

        var paymentSplits = sale.PaymentSplits.Any()
            ? sale.PaymentSplits.Select(p => (LocalizationService.TranslatePaymentMethod(p.Method), FormatMoney(p.Amount))).ToList()
            : null;

        var receipt = new ReceiptData(
            _companyName ?? string.Empty, _locationName, _session.UserName ?? "—", sale.Timestamp,
            lines, sale.Total.ToString("N0", CultureInfo.InvariantCulture),
            LocalizationService.TranslatePaymentMethod(sale.PaymentMethod), _companyCurrency ?? string.Empty,
            paymentSplits,
            sale.AmountTendered.HasValue ? FormatMoney(sale.AmountTendered.Value) : null,
            sale.ChangeDue.HasValue ? FormatMoney(sale.ChangeDue.Value) : null);

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

    private void UpdateTotalsAndButtons()
    {
        var total = _cart.Sum(l => l.LineTotal);
        TotalLabel.Text = FormatMoney(total);
        EmptyCartLabel.IsVisible = _cart.Count == 0;
        CartView.IsVisible = _cart.Count > 0;

        // Split mode requires both legs to actually be present — a single
        // non-zero leg is really a plain Cash or MobileMoney sale mislabeled
        // as Split, not a genuine two-way split.
        var splitValid = true;
        if (_selectedPaymentMethod == PaymentMethod.Split)
        {
            var cashAmount = ParseDecimal(SplitCashEntry.Text) ?? 0;
            var mobileMoneyAmount = ParseDecimal(SplitMobileMoneyEntry.Text) ?? 0;
            var remaining = total - cashAmount - mobileMoneyAmount;
            splitValid = cashAmount > 0 && mobileMoneyAmount > 0 && remaining == 0;

            SplitHintLabel.IsVisible = remaining != 0;
            SplitHintLabel.Text = remaining != 0
                ? LocalizationService.Translate("Pos_SplitRemaining", FormatMoney(remaining))
                : string.Empty;
        }

        var cashOwed = _selectedPaymentMethod switch
        {
            PaymentMethod.Cash => total,
            PaymentMethod.Split => ParseDecimal(SplitCashEntry.Text) ?? 0,
            _ => 0m
        };

        var tenderedValid = true;
        if (TenderedDetail.IsVisible && !string.IsNullOrWhiteSpace(TenderedEntry.Text))
        {
            var tendered = ParseDecimal(TenderedEntry.Text);
            if (tendered is null || tendered < cashOwed)
            {
                tenderedValid = false;
                ChangeDueLabel.IsVisible = true;
                ChangeDueLabel.Text = LocalizationService.Translate("Pos_TenderedInsufficient");
                ChangeDueLabel.TextColor = (Color)Application.Current!.Resources["ErrorColor"];
            }
            else
            {
                ChangeDueLabel.IsVisible = true;
                ChangeDueLabel.Text = LocalizationService.Translate("Pos_ChangeDue", FormatMoney(tendered.Value - cashOwed));
                ChangeDueLabel.ClearValue(Label.TextColorProperty);
            }
        }
        else
        {
            ChangeDueLabel.IsVisible = false;
        }

        CheckoutButton.IsEnabled = _cart.Count > 0 && !_checkoutInProgress && splitValid && tenderedValid;
        HoldButton.IsEnabled = _cart.Count > 0 && !_checkoutInProgress;
    }

    private static decimal? ParseDecimal(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        var normalized = text.Trim().Replace(',', '.');
        return decimal.TryParse(normalized, NumberStyles.Any, CultureInfo.InvariantCulture, out var value) ? value : null;
    }

    private void SetBusy(bool busy)
    {
        Spinner.IsRunning = busy;
        Spinner.IsVisible = busy;
        CheckoutButton.IsEnabled = !busy && _cart.Count > 0;
        HoldButton.IsEnabled = !busy && _cart.Count > 0;
        ResumeButton.IsEnabled = !busy;
    }

    private void ShowError(string message) => ToastExtensions.ShowError(this, message);

    private string FormatMoney(decimal value)
    {
        var text = value.ToString("N0", CultureInfo.InvariantCulture);
        return string.IsNullOrEmpty(_companyCurrency) ? text : $"{text} {_companyCurrency}";
    }

    private sealed class CartLine : INotifyPropertyChanged
    {
        public Guid ProductId { get; }
        public Guid? PackagingLevelId { get; }
        public string Name { get; }
        public string UnitLabel { get; }
        public decimal UnitPrice { get; }
        private readonly string? _currency;

        private int _quantity;
        public int Quantity
        {
            get => _quantity;
            set
            {
                if (_quantity == value) return;
                _quantity = value;
                OnPropertyChanged(nameof(Quantity));
                OnPropertyChanged(nameof(LineTotalText));
            }
        }

        public decimal LineTotal => Quantity * UnitPrice;
        public string LineTotalText => MoneyFormatter.Format(LineTotal, _currency);

        public CartLine(Guid productId, Guid? packagingLevelId, string name, string unitLabel, decimal unitPrice, int quantity, string? currency)
        {
            ProductId = productId;
            PackagingLevelId = packagingLevelId;
            Name = name;
            UnitLabel = unitLabel;
            UnitPrice = unitPrice;
            _quantity = quantity;
            _currency = currency;
        }

        public event PropertyChangedEventHandler? PropertyChanged;
        private void OnPropertyChanged(string name) => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
    }

    private sealed class ProductSearchRow
    {
        public ProductSearchResult Result { get; }
        public string Name => Result.Name;
        // Search results otherwise show a bare number next to a stock-status
        // badge — easy to misread as a quantity. Appending the currency
        // (same "{amount} {currency}" format FormatMoney uses everywhere
        // else on this page) makes it unambiguous that it's the unit price.
        public string PriceText { get; }
        public bool IsOutOfStock => Result.StockStatus == "out_of_stock";
        public string StatusText => Result.StockStatus switch
        {
            "out_of_stock" => LocalizationService.Translate("StockStatus_OutOfStock"),
            "low_stock" => LocalizationService.Translate("StockStatus_LowStock"),
            _ => LocalizationService.Translate("StockStatus_InStock")
        };
        // Same out-of-stock/low-stock/in-stock color convention as
        // ProductCatalogPage's ProductRow, for a consistent cue across the app.
        public Color StatusColor => Result.StockStatus switch
        {
            "out_of_stock" => (Color)Application.Current!.Resources["ErrorColor"],
            "low_stock" => (Color)Application.Current!.Resources["Gray400"],
            _ => (Color)Application.Current!.Resources["SuccessColor"]
        };

        public ProductSearchRow(ProductSearchResult result, string? currency)
        {
            Result = result;
            var amount = result.SalePrice.ToString("N0", CultureInfo.InvariantCulture);
            PriceText = string.IsNullOrEmpty(currency) ? amount : $"{amount} {currency}";
        }
    }
}
