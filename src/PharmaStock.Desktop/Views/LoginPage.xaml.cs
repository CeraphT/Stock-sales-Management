using PharmaStock.Desktop.Services;

namespace PharmaStock.Desktop.Views;

public partial class LoginPage : ContentPage
{
    private readonly PharmaStockApiClient _api;
    private readonly SessionService _session;
    private readonly SyncService _syncService;

    public LoginPage(PharmaStockApiClient api, SessionService session, SyncService syncService)
    {
        InitializeComponent();
        _api = api;
        _session = session;
        _syncService = syncService;
    }

    private void OnPhoneFieldCompleted(object? sender, EventArgs e) => PasswordField.FocusField();

    private async void OnSubmitClicked(object? sender, EventArgs e)
    {
        if (string.IsNullOrWhiteSpace(PhoneField.Text) || string.IsNullOrWhiteSpace(PasswordField.Text))
        {
            ShowError(LocalizationService.Translate("Login_MissingFields"));
            return;
        }

        SetBusy(true);
        try
        {
            var auth = await _api.LoginAsync(
                PhoneField.Text.Trim(), PasswordField.Text.Trim(),
                _session.DeviceId, DeviceContext.Name, DeviceContext.Platform);
            _session.Save(auth);
            _syncService.StartBackgroundSync();
            await Shell.Current.GoToAsync(AppShell.DashboardRoute);
        }
        catch (PharmaStockApiException ex)
        {
            ShowError(ex.StatusCode == 401 ? LocalizationService.Translate("Login_InvalidCredentials") : ex.Message);
        }
        catch (Exception ex)
        {
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
        Spinner.IsRunning = busy;
        Spinner.IsVisible = busy;
    }
}
