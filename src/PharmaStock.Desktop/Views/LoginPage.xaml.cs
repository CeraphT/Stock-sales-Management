using PharmaStock.Desktop.Services;

namespace PharmaStock.Desktop.Views;

public partial class LoginPage : ContentPage
{
    private readonly PharmaStockApiClient _api;
    private readonly SessionService _session;

    public LoginPage(PharmaStockApiClient api, SessionService session)
    {
        InitializeComponent();
        _api = api;
        _session = session;
    }

    private async void OnSubmitClicked(object? sender, EventArgs e)
    {
        ErrorLabel.IsVisible = false;

        if (string.IsNullOrWhiteSpace(PhoneField.Text) || string.IsNullOrWhiteSpace(PasswordField.Text))
        {
            ShowError("Enter your phone number and password.");
            return;
        }

        SetBusy(true);
        try
        {
            var auth = await _api.LoginAsync(PhoneField.Text.Trim(), PasswordField.Text);
            _session.Save(auth);
            await Shell.Current.GoToAsync(AppShell.DashboardRoute);
        }
        catch (PharmaStockApiException ex)
        {
            ShowError(ex.StatusCode == 401 ? "Incorrect phone number or password." : ex.Message);
        }
        catch (Exception ex)
        {
            ShowError($"Something went wrong: {ex.Message}");
        }
        finally
        {
            SetBusy(false);
        }
    }

    private void ShowError(string message)
    {
        ErrorLabel.Text = message;
        ErrorLabel.IsVisible = true;
    }

    private void SetBusy(bool busy)
    {
        SubmitButton.IsEnabled = !busy;
        Spinner.IsRunning = busy;
        Spinner.IsVisible = busy;
    }
}
