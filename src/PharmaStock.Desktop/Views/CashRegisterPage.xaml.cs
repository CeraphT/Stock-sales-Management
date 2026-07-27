using System.Collections.ObjectModel;
using System.Globalization;
using PharmaStock.Desktop.Services;
using PharmaStock.Domain.Models;

namespace PharmaStock.Desktop.Views;

public partial class CashRegisterPage : ContentPage
{
    // Shift open/close/current all run against the local database so the
    // cash-register lifecycle keeps working offline (Section 6); shift
    // history browsing (LoadHistoryPageAsync) stays online-only — it's a
    // reporting view across every past shift, not part of the offline POS
    // day-to-day flow, same category as SalesHistoryPage.
    private readonly PharmaStockApiClient _api;
    private readonly LocalShiftService _localShift;
    private readonly LocalCatalogQueryService _localCatalog;
    private readonly SessionService _session;
    private readonly ObservableCollection<ShiftRow> _history = new();

    private Guid? _locationId;
    private ShiftDetailResponse? _currentShift;
    private int _currentPage = 1;
    private bool _loading;
    private string? _currency;

    public CashRegisterPage(PharmaStockApiClient api, LocalShiftService localShift, LocalCatalogQueryService localCatalog, SessionService session, ThemeService themeService)
    {
        InitializeComponent();
        _api = api;
        _localShift = localShift;
        _localCatalog = localCatalog;
        _session = session;
        this.AttachStandardHeader(themeService, session);
        HistoryView.ItemsSource = _history;
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

    private async Task LoadAsync()
    {
        // Every call here re-fetches everything on screen (initial appearance
        // AND every later revisit) — hide the previous shift card/history
        // first so the spinner's "no data visible yet" state holds for the
        // whole reload, not just the very first time this page opens.
        OpenShiftCard.IsVisible = false;
        ActiveShiftCard.IsVisible = false;
        _history.Clear();
        EmptyHistoryLabel.IsVisible = false;
        SetLoading(true);
        try
        {
            var companyId = _session.CompanyId;
            if (companyId is null) return;

            if (_currency is null)
            {
                var company = await _localCatalog.GetCompanyAsync(companyId.Value);
                _currency = company.Currency;
            }

            if (_locationId is null)
            {
                var locations = await _localCatalog.GetLocationsAsync(companyId.Value);
                var location = _session.LocationId is { } existingId
                    ? locations.FirstOrDefault(l => l.Id == existingId) ?? locations.FirstOrDefault()
                    : locations.FirstOrDefault();
                if (location is null) return;
                _locationId = location.Id;
            }

            _currentShift = await _localShift.GetCurrentShiftAsync(companyId.Value, _locationId.Value);
            RenderCurrentShift();

            await LoadHistoryPageAsync(1, append: false);
        }
        finally
        {
            SetLoading(false);
        }
    }

    private void RenderCurrentShift()
    {
        var isOpen = _currentShift is not null;
        OpenShiftCard.IsVisible = !isOpen;
        ActiveShiftCard.IsVisible = isOpen;
        ClosePanel.IsVisible = false;

        if (_currentShift is null) return;

        OpenedInfoLabel.Text = LocalizationService.Translate(
            "Shift_OpenedInfo", _currentShift.OpenedAt.ToLocalTime().ToString("dd/MM/yyyy HH:mm", CultureInfo.InvariantCulture), _currentShift.OpenedByName);
        OpeningAmountLabel.Text = MoneyFormatter.Format(_currentShift.OpeningCashAmount, _currency);
        SalesCountLabel.Text = _currentShift.SalesCount.ToString(CultureInfo.InvariantCulture);
        TotalSalesLabel.Text = MoneyFormatter.Format(_currentShift.TotalSales, _currency);

        var cashSoFar = _currentShift.OpeningCashAmount +
            (_currentShift.PaymentBreakdown.FirstOrDefault(p => p.Method == PaymentMethod.Cash)?.Total ?? 0);
        ExpectedCashLabel.Text = MoneyFormatter.Format(cashSoFar, _currency);
    }

    private async void OnOpenShiftClicked(object? sender, EventArgs e)
    {
        var companyId = _session.CompanyId;
        if (companyId is null || _locationId is null) return;

        var amount = ParseDecimal(OpeningCashField.Text);
        if (amount is null || amount < 0)
        {
            ShowOpenError(LocalizationService.Translate("Shift_InvalidAmount"));
            return;
        }

        OpenShiftButton.IsEnabled = false;
        try
        {
            _currentShift = await _localShift.OpenShiftAsync(companyId.Value, _locationId.Value, amount.Value);
            OpeningCashField.Text = string.Empty;
            RenderCurrentShift();
        }
        catch (PharmaStockApiException ex)
        {
            ShowOpenError(ex.Message);
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
        finally
        {
            OpenShiftButton.IsEnabled = true;
        }
    }

    private void OnCloseToggleClicked(object? sender, EventArgs e) =>
        ClosePanel.IsVisible = !ClosePanel.IsVisible;

    private async void OnConfirmCloseClicked(object? sender, EventArgs e)
    {
        var companyId = _session.CompanyId;
        if (companyId is null || _currentShift is null) return;

        var amount = ParseDecimal(ClosingCashField.Text);
        if (amount is null || amount < 0)
        {
            ShowCloseError(LocalizationService.Translate("Shift_InvalidAmount"));
            return;
        }

        ConfirmCloseButton.IsEnabled = false;
        try
        {
            var notes = string.IsNullOrWhiteSpace(ClosingNotesField.Text) ? null : ClosingNotesField.Text.Trim();
            var closed = await _localShift.CloseShiftAsync(companyId.Value, _currentShift.Id, amount.Value, notes);

            ClosingCashField.Text = string.Empty;
            ClosingNotesField.Text = string.Empty;
            _currentShift = null;
            RenderCurrentShift();
            await LoadHistoryPageAsync(1, append: false);

            var discrepancy = closed.Discrepancy ?? 0;
            var summaryKey = discrepancy == 0 ? "Shift_ClosedBalanced" : discrepancy > 0 ? "Shift_ClosedOverage" : "Shift_ClosedShortage";
            await this.DisplayAlertAsync(
                LocalizationService.Translate("Shift_ClosedTitle"),
                LocalizationService.Translate(summaryKey, MoneyFormatter.Format(Math.Abs(discrepancy), _currency)),
                LocalizationService.Translate("Common_OK"));
        }
        catch (PharmaStockApiException ex)
        {
            ShowCloseError(ex.Message);
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
        finally
        {
            ConfirmCloseButton.IsEnabled = true;
        }
    }

    private async void OnLoadMoreClicked(object? sender, EventArgs e)
    {
        try
        {
            await LoadHistoryPageAsync(_currentPage + 1, append: true);
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    private async Task LoadHistoryPageAsync(int page, bool append)
    {
        if (_loading) return;
        _loading = true;
        LoadMoreButton.IsEnabled = false;
        try
        {
            var companyId = _session.CompanyId;
            if (companyId is null) return;

            var result = await _api.GetShiftHistoryAsync(companyId.Value, page);

            if (!append) _history.Clear();
            foreach (var item in result.Items)
                _history.Add(new ShiftRow(item, _currency));

            _currentPage = page;
            LoadMoreButton.IsVisible = result.HasMore;
            EmptyHistoryLabel.IsVisible = _history.Count == 0;
        }
        finally
        {
            _loading = false;
            LoadMoreButton.IsEnabled = true;
        }
    }

    private void SetLoading(bool loading)
    {
        LoadingSpinner.IsRunning = loading;
        LoadingSpinner.IsVisible = loading;
    }

    private void ShowOpenError(string message) => ToastExtensions.ShowError(this, message);

    private void ShowCloseError(string message) => ToastExtensions.ShowError(this, message);

    private static decimal? ParseDecimal(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        var normalized = text.Trim().Replace(',', '.');
        return decimal.TryParse(normalized, NumberStyles.Any, CultureInfo.InvariantCulture, out var value) ? value : null;
    }

    private sealed class ShiftRow
    {
        public string DateRangeText { get; }
        public string OpenedByText { get; }
        public string OpeningText { get; }
        public string ClosingText { get; }
        public string DiscrepancyText { get; }
        public Color DiscrepancyColor { get; }

        public ShiftRow(ShiftSummaryResponse s, string? currency)
        {
            var opened = s.OpenedAt.ToLocalTime().ToString("dd/MM/yyyy HH:mm", CultureInfo.InvariantCulture);
            var closed = s.ClosedAt?.ToLocalTime().ToString("HH:mm", CultureInfo.InvariantCulture);
            DateRangeText = closed is null ? opened : $"{opened} — {closed}";
            OpenedByText = s.ClosedByName is null
                ? LocalizationService.Translate("Shift_RowOpenedBy", s.OpenedByName)
                : LocalizationService.Translate("Shift_RowOpenedClosedBy", s.OpenedByName, s.ClosedByName);
            OpeningText = MoneyFormatter.Format(s.OpeningCashAmount, currency);
            ClosingText = s.ClosingCashAmount.HasValue ? MoneyFormatter.Format(s.ClosingCashAmount.Value, currency) : "—";

            if (s.Discrepancy is { } d)
            {
                DiscrepancyText = (d > 0 ? "+" : string.Empty) + MoneyFormatter.Format(d, currency);
                DiscrepancyColor = d == 0
                    ? (Color)Application.Current!.Resources["SuccessColor"]
                    : (Color)Application.Current!.Resources["ErrorColor"];
            }
            else
            {
                DiscrepancyText = "—";
                DiscrepancyColor = (Color)Application.Current!.Resources["Gray400"];
            }
        }
    }
}
