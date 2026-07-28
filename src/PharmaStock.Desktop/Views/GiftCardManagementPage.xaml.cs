using PharmaStock.Desktop.Services;

namespace PharmaStock.Desktop.Views;

/// <summary>Section 21.3 — issuing and managing prepaid gift cards. Tapping
/// a card offers "Désactiver"/"Réactiver" (a lost/stolen card, or one
/// re-enabled by mistake) — never delete, since GiftCard rows are
/// referenced by Sale.GiftCardCode history.</summary>
public partial class GiftCardManagementPage : ContentPage
{
    private readonly PharmaStockApiClient _api;
    private readonly SessionService _session;
    private List<GiftCardResponse> _allCards = new();

    public GiftCardManagementPage(PharmaStockApiClient api, SessionService session, ThemeService themeService)
    {
        InitializeComponent();
        _api = api;
        _session = session;
        this.AttachStandardHeader(themeService, session);
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        try
        {
            await LoadGiftCardsAsync();
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    private async Task LoadGiftCardsAsync()
    {
        EmptyLabel.IsVisible = false;
        GiftCardsView.ItemsSource = null;
        LoadingSpinner.IsVisible = true;
        LoadingSpinner.IsRunning = true;
        try
        {
            var companyId = _session.CompanyId!.Value;
            _allCards = await _api.GetGiftCardsAsync(companyId);
            ApplyFilter(SearchBarControl.Text);
        }
        finally
        {
            LoadingSpinner.IsRunning = false;
            LoadingSpinner.IsVisible = false;
        }
    }

    private void ApplyFilter(string? search)
    {
        var filtered = string.IsNullOrWhiteSpace(search)
            ? _allCards
            : _allCards.Where(c => c.Code.Contains(search, StringComparison.OrdinalIgnoreCase)).ToList();

        GiftCardsView.ItemsSource = filtered.Select(c => new GiftCardRow(c)).ToList();
        EmptyLabel.IsVisible = filtered.Count == 0;
    }

    private void OnSearchTextChanged(object? sender, TextChangedEventArgs e) => ApplyFilter(e.NewTextValue);

    private async void OnIssueGiftCardClicked(object? sender, EventArgs e)
    {
        var amountText = await this.DisplayPromptAsync(
            LocalizationService.Translate("GiftCardManagement_IssueTitle"), LocalizationService.Translate("GiftCardManagement_AmountPrompt"),
            keyboard: Keyboard.Numeric);
        if (!decimal.TryParse(amountText, out var amount) || amount <= 0) return;

        try
        {
            var companyId = _session.CompanyId!.Value;
            var created = await _api.IssueGiftCardAsync(companyId, amount);
            await this.DisplayAlertAsync(
                LocalizationService.Translate("GiftCardManagement_IssueTitle"),
                LocalizationService.Translate("GiftCardManagement_IssueSuccess", created.Code),
                LocalizationService.Translate("Common_OK"));
            await LoadGiftCardsAsync();
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

    private async void OnGiftCardSelected(object? sender, SelectionChangedEventArgs e)
    {
        var row = e.CurrentSelection.FirstOrDefault() as GiftCardRow;
        GiftCardsView.SelectedItem = null;
        if (row is null) return;

        var actionLabel = LocalizationService.Translate(row.Card.Active ? "GiftCardManagement_Deactivate" : "GiftCardManagement_Reactivate");
        var choice = await this.DisplayActionSheetAsync(row.Card.Code, LocalizationService.Translate("Common_Cancel"), null, actionLabel);
        if (choice != actionLabel) return;

        try
        {
            var companyId = _session.CompanyId!.Value;
            await _api.SetGiftCardActiveAsync(companyId, row.Card.Id, !row.Card.Active);
            await LoadGiftCardsAsync();
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

    private sealed class GiftCardRow
    {
        public GiftCardResponse Card { get; }
        public string Code => Card.Code;
        public string BalanceText { get; }
        public string StatusText => LocalizationService.Translate(Card.Active ? "GiftCardManagement_Active" : "GiftCardManagement_Inactive");
        public Color StatusColor => (Color)Application.Current!.Resources[Card.Active ? "SuccessColor" : "ErrorColor"];

        public GiftCardRow(GiftCardResponse card)
        {
            Card = card;
            BalanceText = LocalizationService.Translate("GiftCardManagement_BalanceLine", card.RemainingValue, card.InitialValue);
        }
    }
}
