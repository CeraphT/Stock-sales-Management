using System.Globalization;
using PharmaStock.Desktop.Services;

namespace PharmaStock.Desktop.Views;

public partial class DashboardPage : ContentPage
{
    private readonly PharmaStockApiClient _api;
    private readonly SessionService _session;
    private DashboardSummaryResponse? _lastSummary;
    private string? _currency;

    public DashboardPage(PharmaStockApiClient api, SessionService session, ThemeService themeService)
    {
        InitializeComponent();
        _api = api;
        _session = session;
        this.AttachStandardHeader(themeService, session);
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        LocalizationService.LanguageChanged += OnLanguageChanged;
        UpdateWelcomeLabel();

        try
        {
            await LoadSummaryAsync();
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    protected override void OnDisappearing()
    {
        base.OnDisappearing();
        LocalizationService.LanguageChanged -= OnLanguageChanged;
    }

    // WelcomeLabel and the recent-sales rows are built in code-behind rather
    // than bound via {loc:Translate} (they splice in runtime data), so a
    // language switch needs to explicitly re-render them here — everything
    // else on this page updates itself automatically through the markup
    // extension's live binding.
    private void OnLanguageChanged(object? sender, EventArgs e)
    {
        UpdateWelcomeLabel();
        if (_lastSummary is not null)
            Render(_lastSummary);
    }

    private void UpdateWelcomeLabel() =>
        WelcomeLabel.Text = LocalizationService.Translate("Dashboard_Welcome", _session.UserName ?? string.Empty, LocalizationService.TranslateRole(_session.UserRole));

    private async Task LoadSummaryAsync()
    {
        var companyId = _session.CompanyId;
        if (companyId is null) return;

        // The stat cards default to "0" in XAML — without this, a slow
        // request (e.g. a cold-starting dev API) briefly renders as if every
        // metric had genuinely dropped to zero rather than "still loading."
        ContentStack.IsVisible = false;
        LoadingSpinner.IsVisible = true;
        LoadingSpinner.IsRunning = true;
        try
        {
            if (_currency is null)
            {
                var company = await _api.GetCompanyAsync(companyId.Value);
                _currency = company.Currency;
            }
            var summary = await _api.GetDashboardSummaryAsync(companyId.Value);
            _lastSummary = summary;
            Render(summary);
        }
        finally
        {
            LoadingSpinner.IsRunning = false;
            LoadingSpinner.IsVisible = false;
            ContentStack.IsVisible = true;
        }
    }

    private void Render(DashboardSummaryResponse summary)
    {
        RevenueTodayTile.Value = MoneyFormatter.Format(summary.TodayRevenue, _currency);
        SalesTodayTile.Value = summary.TodaySalesCount.ToString(CultureInfo.InvariantCulture);
        TotalProductsTile.Value = summary.TotalProducts.ToString(CultureInfo.InvariantCulture);
        LowStockTile.Value = summary.LowStockCount.ToString(CultureInfo.InvariantCulture);
        OutOfStockTile.Value = summary.OutOfStockCount.ToString(CultureInfo.InvariantCulture);
        ExpiringSoonTile.Value = summary.ExpiringSoonCount.ToString(CultureInfo.InvariantCulture);
        ExpiredTile.Value = summary.ExpiredCount.ToString(CultureInfo.InvariantCulture);
        ArchivedProductsTile.Value = summary.ArchivedProductsCount.ToString(CultureInfo.InvariantCulture);

        // Section 6 — only surfaces when there's actually something for an
        // admin to reconcile (two offline devices oversold the same batch,
        // or collided opening a shift at the same location); silent
        // otherwise, rather than a permanent "0" tile.
        var conflictCount = summary.NegativeStockBatchCount + summary.AutoClosedShiftConflictCount;
        NegativeStockCard.IsVisible = conflictCount > 0;
        NegativeStockCard.Value = conflictCount.ToString(CultureInfo.InvariantCulture);

        var rows = summary.RecentSales.Select(s => new RecentSaleRow(s, _currency)).ToList();
        RecentSalesView.ItemsSource = rows;
        RecentSalesView.IsVisible = rows.Count > 0;
        NoRecentSalesLabel.IsVisible = rows.Count == 0;
    }

    private async void OnArchivedCardTapped(object? sender, EventArgs e)
    {
        try
        {
            await Shell.Current.GoToAsync(AppShell.ArchivedProductsRoute);
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    private sealed class RecentSaleRow
    {
        public string TimeText { get; }
        public string PaymentMethodText { get; }
        public string TotalText { get; }
        public string ItemsSummaryText { get; }

        public RecentSaleRow(RecentSaleItem item, string? currency)
        {
            TimeText = item.Timestamp.ToLocalTime().ToString("dd/MM HH:mm", CultureInfo.InvariantCulture);
            PaymentMethodText = LocalizationService.TranslatePaymentMethod(item.PaymentMethod);
            TotalText = MoneyFormatter.Format(item.Total, currency);
            ItemsSummaryText = item.Items.Count > 0
                ? string.Join(", ", item.Items.Select(i => $"{i.Name} ×{i.Quantity} {i.UnitLabel}"))
                : LocalizationService.Translate("Dashboard_NoItems");
        }
    }
}
