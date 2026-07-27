using System.Collections.ObjectModel;
using System.Globalization;
using Microsoft.Maui.ApplicationModel.DataTransfer;
using Microsoft.Maui.Storage;
using PharmaStock.Desktop.Services;

namespace PharmaStock.Desktop.Views;

/// <summary>Management/audit view of every held (parked) sale across every
/// location — date-range filterable, exportable to Excel via the OS share
/// sheet. Distinct from HeldSalesPage, the POS's own single-location
/// "Reprendre" quick-resume picker: this one is read-only browsing plus
/// cleanup (discard via 🗑), it never resumes a cart into a cashier's
/// screen.</summary>
public partial class HeldSalesHistoryPage : ContentPage
{
    private readonly PharmaStockApiClient _api;
    private readonly SessionService _session;
    private readonly ObservableCollection<HeldSaleRow> _rows = new();
    private readonly List<Button> _presetChips;

    private List<HeldSaleSummaryResponse> _lastResults = new();
    private DateTime? _fromDate;
    private DateTime? _toDate;
    private string? _currency;
    private string? _companyName;

    public HeldSalesHistoryPage(PharmaStockApiClient api, SessionService session, ThemeService themeService)
    {
        InitializeComponent();
        _api = api;
        _session = session;
        this.AttachStandardHeader(themeService, session);
        HeldSalesView.ItemsSource = _rows;
        _presetChips = new List<Button> { TodayChip, Last7Chip, Last30Chip, AllChip };

        var today = DateTime.Today;
        FromDatePicker.Date = today;
        ToDatePicker.Date = today;
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        try
        {
            await LoadAsync();
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    private async void OnTodayClicked(object? sender, EventArgs e) => await ApplyPresetAsync(TodayChip, DateTime.Today, DateTime.Today);

    private async void OnLast7Clicked(object? sender, EventArgs e) => await ApplyPresetAsync(Last7Chip, DateTime.Today.AddDays(-6), DateTime.Today);

    private async void OnLast30Clicked(object? sender, EventArgs e) => await ApplyPresetAsync(Last30Chip, DateTime.Today.AddDays(-29), DateTime.Today);

    private async void OnAllClicked(object? sender, EventArgs e) => await ApplyPresetAsync(AllChip, null, null);

    private async Task ApplyPresetAsync(Button selected, DateTime? from, DateTime? to)
    {
        SelectChip(selected);
        CustomRangeRow.IsVisible = false;
        _fromDate = from;
        _toDate = to;
        try
        {
            await LoadAsync();
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    private void OnCustomRangeToggleClicked(object? sender, EventArgs e) =>
        CustomRangeRow.IsVisible = !CustomRangeRow.IsVisible;

    private async void OnApplyCustomRangeClicked(object? sender, EventArgs e)
    {
        if (FromDatePicker.Date > ToDatePicker.Date)
        {
            this.ShowError(LocalizationService.Translate("SalesHistory_InvalidRangeMessage"));
            return;
        }

        SelectChip(null); // no preset matches an arbitrary custom range
        _fromDate = FromDatePicker.Date;
        _toDate = ToDatePicker.Date;
        try
        {
            await LoadAsync();
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    private void SelectChip(Button? selected)
    {
        foreach (var chip in _presetChips)
            chip.Style = (Style)Application.Current!.Resources[chip == selected ? "ChipButtonSelected" : "ChipButtonUnselected"];
    }

    private async Task LoadAsync()
    {
        _rows.Clear();
        EmptyLabel.IsVisible = false;
        LoadingSpinner.IsVisible = true;
        LoadingSpinner.IsRunning = true;
        try
        {
            var companyId = _session.CompanyId!.Value;
            if (_currency is null)
            {
                var company = await _api.GetCompanyAsync(companyId);
                _currency = company.Currency;
                _companyName = company.Name;
            }
            _lastResults = await _api.GetHeldSalesAsync(companyId, locationId: null, from: _fromDate, to: _toDate);
            foreach (var item in _lastResults)
                _rows.Add(new HeldSaleRow(item, _currency));
            EmptyLabel.IsVisible = _rows.Count == 0;
        }
        finally
        {
            LoadingSpinner.IsRunning = false;
            LoadingSpinner.IsVisible = false;
        }
    }

    private async void OnDeleteHeldSaleClicked(object? sender, EventArgs e)
    {
        if ((sender as Button)?.CommandParameter is not HeldSaleRow row) return;

        var confirmed = await this.DisplayAlertAsync(LocalizationService.Translate("HeldSales_DeleteTitle"),
            LocalizationService.Translate("HeldSales_DeleteMessage"),
            LocalizationService.Translate("HeldSales_Delete"), LocalizationService.Translate("Common_Cancel"));
        if (!confirmed) return;

        try
        {
            var companyId = _session.CompanyId!.Value;
            await _api.DeleteHeldSaleAsync(companyId, row.Id);
            await LoadAsync();
        }
        catch (PharmaStockApiException ex)
        {
            this.ShowError(ex.Message);
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    private async void OnExportClicked(object? sender, EventArgs e)
    {
        if (_lastResults.Count == 0)
        {
            this.ShowError(LocalizationService.Translate("HeldSalesHistory_ExportEmpty"));
            return;
        }

        try
        {
            var columns = new[]
            {
                new ExcelExportService.ExportColumn(LocalizationService.Translate("HeldSalesHistory_CsvDate"), ExcelExportService.ColumnType.DateTime, 18),
                new ExcelExportService.ExportColumn(LocalizationService.Translate("HeldSalesHistory_CsvLocation"), ExcelExportService.ColumnType.Text, 20),
                new ExcelExportService.ExportColumn(LocalizationService.Translate("HeldSalesHistory_CsvCashier"), ExcelExportService.ColumnType.Text, 20),
                new ExcelExportService.ExportColumn(LocalizationService.Translate("HeldSalesHistory_CsvItems"), ExcelExportService.ColumnType.Integer, 12),
                new ExcelExportService.ExportColumn(LocalizationService.Translate("HeldSalesHistory_CsvTotal"), ExcelExportService.ColumnType.Currency, 18),
            };
            var rows = _lastResults.Select(item => new object?[]
            {
                item.Timestamp.ToLocalTime(), item.LocationName, item.CashierName, item.ItemCount, item.Total
            }).ToList();
            var totals = new object?[]
            {
                LocalizationService.Translate("Export_Total"), null, null,
                _lastResults.Sum(i => i.ItemCount), _lastResults.Sum(i => i.Total)
            };

            var path = ExcelExportService.Export("held-sales", LocalizationService.Translate("Shell_HeldSales"),
                BuildSubtitle(), columns, rows, totals, _currency);

            await Share.Default.RequestAsync(new ShareFileRequest
            {
                Title = LocalizationService.Translate("Shell_HeldSales"),
                File = new ShareFile(path),
            });
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    private string BuildSubtitle()
    {
        var period = _fromDate is null && _toDate is null
            ? LocalizationService.Translate("Export_AllDates")
            : LocalizationService.Translate("Export_DateRange",
                (_fromDate ?? DateTime.MinValue).ToString("dd/MM/yyyy", CultureInfo.InvariantCulture),
                (_toDate ?? DateTime.Now).ToString("dd/MM/yyyy", CultureInfo.InvariantCulture));
        var generated = LocalizationService.Translate("Export_GeneratedOn", DateTime.Now.ToString("dd/MM/yyyy HH:mm", CultureInfo.InvariantCulture));
        return $"{_companyName} • {period} • {generated}";
    }

    private sealed class HeldSaleRow
    {
        public Guid Id { get; }
        public string TimeText { get; }
        public string SubtitleText { get; }

        public HeldSaleRow(HeldSaleSummaryResponse s, string? currency)
        {
            Id = s.Id;
            TimeText = s.Timestamp.ToLocalTime().ToString("dd/MM/yyyy HH:mm", CultureInfo.InvariantCulture);
            SubtitleText = LocalizationService.Translate(
                "HeldSalesHistory_RowSubtitle", s.CashierName, s.LocationName, s.ItemCount, MoneyFormatter.Format(s.Total, currency));
        }
    }
}
