using PharmaStock.Desktop.Services;

namespace PharmaStock.Desktop.Views;

public partial class CreateCompanyPage : ContentPage
{
    private readonly PharmaStockApiClient _api;
    private readonly SessionService _session;
    private readonly SyncService _syncService;
    private int _step = 1;

    public CreateCompanyPage(PharmaStockApiClient api, SessionService session, SyncService syncService)
    {
        InitializeComponent();
        _api = api;
        _session = session;
        _syncService = syncService;
        // No language toggle lives on this page, so the language can't
        // change while it's visible — a one-time render here is enough,
        // unlike DashboardPage's imperative labels which sit next to the
        // toggle itself and do need a live LanguageChanged subscription.
        UpdateStepVisibility();
    }

    private void OnNextClicked(object? sender, EventArgs e)
    {
        if (string.IsNullOrWhiteSpace(NameField.Text))
        {
            ShowError(LocalizationService.Translate("CreateCompany_NameRequired"));
            return;
        }

        _step = 2;
        UpdateStepVisibility();
    }

    private void OnNameFieldCompleted(object? sender, EventArgs e) => DescriptionField.FocusField();
    private void OnDescriptionFieldCompleted(object? sender, EventArgs e) => CurrencyField.FocusField();
    private void OnAdminNameFieldCompleted(object? sender, EventArgs e) => AdminPhoneField.FocusField();
    private void OnAdminPhoneFieldCompleted(object? sender, EventArgs e) => AdminPasswordField.FocusField();

    private void OnBackClicked(object? sender, EventArgs e)
    {
        _step = 1;
        UpdateStepVisibility();
    }

    private void UpdateStepVisibility()
    {
        CompanyStep.IsVisible = _step == 1;
        AdminStep.IsVisible = _step == 2;
        BackButton.IsVisible = _step == 2;
        NextButton.IsVisible = _step == 1;
        SubmitButton.IsVisible = _step == 2;
        StepLabel.Text = _step == 1
            ? LocalizationService.Translate("CreateCompany_Step1")
            : LocalizationService.Translate("CreateCompany_Step2");
    }

    private async void OnSubmitClicked(object? sender, EventArgs e)
    {
        if (string.IsNullOrWhiteSpace(NameField.Text) ||
            string.IsNullOrWhiteSpace(AdminNameField.Text) ||
            string.IsNullOrWhiteSpace(AdminPhoneField.Text) ||
            string.IsNullOrWhiteSpace(AdminPasswordField.Text))
        {
            ShowError(LocalizationService.Translate("CreateCompany_RequiredFields"));
            return;
        }

        SetBusy(true);
        try
        {
            var response = await _api.CreateCompanyAsync(new CreateCompanyRequest(
                NameField.Text.Trim(),
                string.IsNullOrWhiteSpace(DescriptionField.Text) ? null : DescriptionField.Text.Trim(),
                string.IsNullOrWhiteSpace(CurrencyField.Text) ? "XAF" : CurrencyField.Text.Trim(),
                AdminNameField.Text.Trim(),
                AdminPhoneField.Text.Trim(),
                AdminPasswordField.Text.Trim(),
                _session.DeviceId, DeviceContext.Name, DeviceContext.Platform));

            _session.Save(response.Admin);
            _syncService.StartBackgroundSync();
            await Shell.Current.GoToAsync(AppShell.DashboardRoute);
        }
        catch (PharmaStockApiException ex)
        {
            ShowError(ex.Message);
        }
        catch (Exception ex)
        {
            // Anything else (navigation, JSON parsing, ...) still needs to
            // surface here rather than rely solely on the app-wide handler —
            // a silent close with no feedback is exactly the bug this guards against.
            ShowError(LocalizationService.Translate("Login_GenericError", ex.Message));
        }
        finally
        {
            SetBusy(false);
        }
    }

    private void ShowError(string message) => ToastExtensions.ShowError(this, message);

    private void SetBusy(bool busy)
    {
        SubmitButton.IsEnabled = !busy;
        BackButton.IsEnabled = !busy;
        Spinner.IsRunning = busy;
        Spinner.IsVisible = busy;
    }
}
