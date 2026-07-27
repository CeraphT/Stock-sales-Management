using System.Collections.ObjectModel;
using System.Globalization;
using Microsoft.Maui.ApplicationModel.DataTransfer;
using PharmaStock.Desktop.Services;
using PharmaStock.Domain.Models;

namespace PharmaStock.Desktop.Views;

public partial class SalesHistoryPage : ContentPage
{
    private readonly PharmaStockApiClient _api;
    private readonly SessionService _session;
    private readonly ObservableCollection<SaleRow> _sales = new();
    private readonly List<Button> _presetChips;

    private int _currentPage = 1;
    private bool _loading;
    private DateTime? _fromDate;
    private DateTime? _toDate;
    private string? _currency;
    private string? _companyName;

    public SalesHistoryPage(PharmaStockApiClient api, SessionService session, ThemeService themeService)
    {
        InitializeComponent();
        _api = api;
        _session = session;
        this.AttachStandardHeader(themeService, session);
        SalesView.ItemsSource = _sales;
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
            await LoadPageAsync(1, append: false);
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
            await LoadPageAsync(1, append: false);
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
            await LoadPageAsync(1, append: false);
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

    private async void OnSaleSelected(object? sender, SelectionChangedEventArgs e)
    {
        var row = e.CurrentSelection.FirstOrDefault() as SaleRow;
        SalesView.SelectedItem = null;
        if (row is null) return;

        try
        {
            await Shell.Current.GoToAsync($"{nameof(SaleDetailPage)}?saleId={row.Id}");
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    private async void OnLoadMoreClicked(object? sender, EventArgs e)
    {
        try
        {
            await LoadPageAsync(_currentPage + 1, append: true);
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    private async void OnExportClicked(object? sender, EventArgs e)
    {
        try
        {
            var companyId = _session.CompanyId!.Value;
            if (_currency is null)
            {
                var company = await _api.GetCompanyAsync(companyId);
                _currency = company.Currency;
                _companyName = company.Name;
            }

            // The on-screen list only holds whatever's been paged in via
            // "Load more" — export needs every sale in the current filter,
            // so it re-fetches every page rather than reusing _sales.
            var all = new List<SaleSummaryResponse>();
            var page = 1;
            while (true)
            {
                var result = await _api.GetSalesHistoryAsync(companyId, page, _fromDate, _toDate);
                all.AddRange(result.Items);
                if (!result.HasMore) break;
                page++;
            }

            if (all.Count == 0)
            {
                this.ShowError(LocalizationService.Translate("SalesHistory_ExportEmpty"));
                return;
            }

            var columns = new[]
            {
                new ExcelExportService.ExportColumn(LocalizationService.Translate("SalesHistory_CsvDate"), ExcelExportService.ColumnType.DateTime, 18),
                new ExcelExportService.ExportColumn(LocalizationService.Translate("SalesHistory_CsvCashier"), ExcelExportService.ColumnType.Text, 20),
                new ExcelExportService.ExportColumn(LocalizationService.Translate("SalesHistory_CsvPayment"), ExcelExportService.ColumnType.Text, 16),
                new ExcelExportService.ExportColumn(LocalizationService.Translate("SalesHistory_CsvItems"), ExcelExportService.ColumnType.Integer, 12),
                new ExcelExportService.ExportColumn(LocalizationService.Translate("SalesHistory_CsvTotal"), ExcelExportService.ColumnType.Currency, 18),
            };
            var rows = all.Select(item => new object?[]
            {
                item.Timestamp.ToLocalTime(), item.CashierName, LocalizationService.TranslatePaymentMethod(item.PaymentMethod), item.ItemCount, item.Total
            }).ToList();
            var totals = new object?[]
            {
                LocalizationService.Translate("Export_Total"), null, null, all.Sum(i => i.ItemCount), all.Sum(i => i.Total)
            };

            var path = ExcelExportService.Export("sales-history", LocalizationService.Translate("Shell_SalesHistory"),
                BuildSubtitle(), columns, rows, totals, _currency);

            await Share.Default.RequestAsync(new ShareFileRequest
            {
                Title = LocalizationService.Translate("Shell_SalesHistory"),
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

    private async Task LoadPageAsync(int page, bool append)
    {
        if (_loading) return;
        _loading = true;
        LoadMoreButton.IsEnabled = false;

        if (!append)
        {
            _sales.Clear();
            EmptyLabel.IsVisible = false;
            LoadingSpinner.IsVisible = true;
            LoadingSpinner.IsRunning = true;
        }

        try
        {
            var companyId = _session.CompanyId!.Value;
            if (_currency is null)
            {
                var company = await _api.GetCompanyAsync(companyId);
                _currency = company.Currency;
                _companyName = company.Name;
            }
            var result = await _api.GetSalesHistoryAsync(companyId, page, _fromDate, _toDate);

            foreach (var item in result.Items)
                _sales.Add(new SaleRow(item, _currency));

            _currentPage = page;
            LoadMoreButton.IsVisible = result.HasMore;
            EmptyLabel.IsVisible = _sales.Count == 0;
        }
        finally
        {
            _loading = false;
            LoadMoreButton.IsEnabled = true;
            LoadingSpinner.IsRunning = false;
            LoadingSpinner.IsVisible = false;
        }
    }

    private sealed class SaleRow
    {
        public Guid Id { get; }
        public string TimeText { get; }
        public string SubtitleText { get; }
        public string TotalText { get; }

        public SaleRow(SaleSummaryResponse item, string? currency)
        {
            Id = item.Id;
            TimeText = item.Timestamp.ToLocalTime().ToString("dd/MM/yyyy HH:mm", CultureInfo.InvariantCulture);
            SubtitleText = $"{item.CashierName} · {LocalizationService.TranslatePaymentMethod(item.PaymentMethod)} · {item.ItemCount} {LocalizationService.Translate("SalesHistory_Articles")}";
            TotalText = MoneyFormatter.Format(item.Total, currency);
        }
    }
}
