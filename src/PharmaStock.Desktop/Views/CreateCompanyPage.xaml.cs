using PharmaStock.Desktop.Services;

namespace PharmaStock.Desktop.Views;

public partial class CreateCompanyPage : ContentPage
{
    private readonly PharmaStockApiClient _api;
    private readonly SessionService _session;

    public CreateCompanyPage(PharmaStockApiClient api, SessionService session)
    {
        InitializeComponent();
        _api = api;
        _session = session;
    }

    private async void OnSubmitClicked(object? sender, EventArgs e)
    {
        ErrorLabel.IsVisible = false;

        if (string.IsNullOrWhiteSpace(NameField.Text) ||
            string.IsNullOrWhiteSpace(AdminNameField.Text) ||
            string.IsNullOrWhiteSpace(AdminPhoneField.Text) ||
            string.IsNullOrWhiteSpace(AdminPasswordField.Text))
        {
            ShowError("Please fill in all required fields.");
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
                AdminPasswordField.Text));

            _session.Save(response.Admin);
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
