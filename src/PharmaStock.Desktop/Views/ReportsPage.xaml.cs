using System.Collections.ObjectModel;
using System.Globalization;
using Microsoft.Maui.ApplicationModel.DataTransfer;
using Microsoft.Maui.Storage;
using PharmaStock.Desktop.Services;

namespace PharmaStock.Desktop.Views;

/// <summary>Section 14 — sales summary (revenue/profit/count, day-by-day)
/// and a top-selling-products ranking, both date-range filterable and each
/// independently exportable to CSV via the OS share sheet. Cost/profit come
/// from the API's real historical batch cost, not today's catalog price.</summary>
public partial class ReportsPage : ContentPage
{
    private readonly PharmaStockApiClient _api;
    private readonly SessionService _session;
    private readonly ObservableCollection<DailyRow> _dailyRows = new();
    private readonly ObservableCollection<TopProductRow> _topProductRows = new();
    private readonly List<Button> _presetChips;

    private List<DailySalesItem> _lastDaily = new();
    private List<TopProductItem> _lastTopProducts = new();
    private DateTime? _fromDate;
    private DateTime? _toDate;
    private string? _currency;
    private string? _companyName;

    public ReportsPage(PharmaStockApiClient api, SessionService session, ThemeService themeService)
    {
        InitializeComponent();
        _api = api;
        _session = session;
        this.AttachStandardHeader(themeService, session);
        DailyBreakdownView.ItemsSource = _dailyRows;
        TopProductsView.ItemsSource = _topProductRows;
        _presetChips = new List<Button> { TodayChip, Last7Chip, Last30Chip, AllChip };

        var today = DateTime.Today;
        FromDatePicker.Date = today;
        ToDatePicker.Date = today;
        _fromDate = today.AddDays(-29);
        _toDate = today;
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

        SelectChip(null);
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
        ContentStack.IsVisible = false;
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

            var summary = await _api.GetSalesSummaryAsync(companyId, from: _fromDate, to: _toDate);
            var topProducts = await _api.GetTopProductsAsync(companyId, from: _fromDate, to: _toDate);

            RevenueLabel.Text = MoneyFormatter.Format(summary.TotalRevenue, _currency);
            ProfitLabel.Text = MoneyFormatter.Format(summary.TotalProfit, _currency);
            SalesCountLabel.Text = summary.TotalSalesCount.ToString(CultureInfo.InvariantCulture);
            AverageSaleLabel.Text = MoneyFormatter.Format(summary.AverageSaleValue, _currency);

            _lastDaily = summary.DailyBreakdown;
            _dailyRows.Clear();
            foreach (var day in summary.DailyBreakdown.OrderByDescending(d => d.Date))
                _dailyRows.Add(new DailyRow(day, _currency));
            DailyBreakdownView.IsVisible = _dailyRows.Count > 0;
            DailyEmptyLabel.IsVisible = _dailyRows.Count == 0;

            _lastTopProducts = topProducts;
            _topProductRows.Clear();
            foreach (var product in topProducts)
                _topProductRows.Add(new TopProductRow(product, _currency));
            TopProductsView.IsVisible = _topProductRows.Count > 0;
            TopProductsEmptyLabel.IsVisible = _topProductRows.Count == 0;
        }
        finally
        {
            LoadingSpinner.IsRunning = false;
            LoadingSpinner.IsVisible = false;
            ContentStack.IsVisible = true;
        }
    }

    private async void OnExportDailyClicked(object? sender, EventArgs e)
    {
        if (_lastDaily.Count == 0)
        {
            this.ShowError(LocalizationService.Translate("Reports_ExportEmpty"));
            return;
        }

        try
        {
            var columns = new[]
            {
                new ExcelExportService.ExportColumn(LocalizationService.Translate("Reports_CsvDate"), ExcelExportService.ColumnType.Date, 14),
                new ExcelExportService.ExportColumn(LocalizationService.Translate("Reports_CsvRevenue"), ExcelExportService.ColumnType.Currency, 18),
                new ExcelExportService.ExportColumn(LocalizationService.Translate("Reports_CsvSalesCount"), ExcelExportService.ColumnType.Integer, 12),
            };
            var ordered = _lastDaily.OrderByDescending(d => d.Date).ToList();
            var rows = ordered.Select(d => new object?[] { d.Date, d.Revenue, d.SalesCount }).ToList();
            var totals = new object?[]
            {
                LocalizationService.Translate("Export_Total"), ordered.Sum(d => d.Revenue), ordered.Sum(d => d.SalesCount)
            };

            var path = ExcelExportService.Export("sales-by-day", LocalizationService.Translate("Reports_DailyBreakdown"),
                BuildSubtitle(), columns, rows, totals, _currency);
            await ShareAsync(path);
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    private async void OnExportTopProductsClicked(object? sender, EventArgs e)
    {
        if (_lastTopProducts.Count == 0)
        {
            this.ShowError(LocalizationService.Translate("Reports_ExportEmpty"));
            return;
        }

        try
        {
            var columns = new[]
            {
                new ExcelExportService.ExportColumn(LocalizationService.Translate("Reports_CsvProduct"), ExcelExportService.ColumnType.Text, 32),
                new ExcelExportService.ExportColumn(LocalizationService.Translate("Reports_CsvQuantity"), ExcelExportService.ColumnType.Integer, 12),
                new ExcelExportService.ExportColumn(LocalizationService.Translate("Reports_CsvRevenue"), ExcelExportService.ColumnType.Currency, 18),
                new ExcelExportService.ExportColumn(LocalizationService.Translate("Reports_CsvProfit"), ExcelExportService.ColumnType.Currency, 18),
            };
            var rows = _lastTopProducts.Select(p => new object?[] { p.ProductName, p.QuantitySold, p.Revenue, p.Profit }).ToList();
            var totals = new object?[]
            {
                LocalizationService.Translate("Export_Total"), _lastTopProducts.Sum(p => p.QuantitySold),
                _lastTopProducts.Sum(p => p.Revenue), _lastTopProducts.Sum(p => p.Profit)
            };

            var path = ExcelExportService.Export("top-products", LocalizationService.Translate("Reports_TopProducts"),
                BuildSubtitle(), columns, rows, totals, _currency);
            await ShareAsync(path);
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    // Company name • date-range (or "all dates") • generation timestamp —
    // shared banner row for every export from this page, so a file opened
    // days later out of context still identifies where/when it came from.
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

    private async Task ShareAsync(string path) =>
        await Share.Default.RequestAsync(new ShareFileRequest
        {
            Title = LocalizationService.Translate("Reports_Title"),
            File = new ShareFile(path),
        });

    private sealed class DailyRow
    {
        public string DateText { get; }
        public string RevenueText { get; }
        public string CountText { get; }

        public DailyRow(DailySalesItem item, string? currency)
        {
            DateText = item.Date.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
            RevenueText = MoneyFormatter.Format(item.Revenue, currency);
            CountText = LocalizationService.Translate("Reports_DailyRowSubtitle", item.SalesCount);
        }
    }

    private sealed class TopProductRow
    {
        public string ProductName { get; }
        public string RevenueText { get; }
        public string SubtitleText { get; }

        public TopProductRow(TopProductItem item, string? currency)
        {
            ProductName = item.ProductName;
            RevenueText = MoneyFormatter.Format(item.Revenue, currency);
            SubtitleText = LocalizationService.Translate(
                "Reports_TopProductRowSubtitle", item.QuantitySold, MoneyFormatter.Format(item.Profit, currency));
        }
    }
}
