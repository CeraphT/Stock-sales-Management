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

        if (string.IsNullOrWhiteSpace(NameEntry.Text) ||
            string.IsNullOrWhiteSpace(AdminNameEntry.Text) ||
            string.IsNullOrWhiteSpace(AdminPhoneEntry.Text) ||
            string.IsNullOrWhiteSpace(AdminPasswordEntry.Text))
        {
            ShowError("Please fill in all required fields.");
            return;
        }

        SetBusy(true);
        try
        {
            var response = await _api.CreateCompanyAsync(new CreateCompanyRequest(
                NameEntry.Text.Trim(),
                string.IsNullOrWhiteSpace(DescriptionEntry.Text) ? null : DescriptionEntry.Text.Trim(),
                string.IsNullOrWhiteSpace(CurrencyEntry.Text) ? "XAF" : CurrencyEntry.Text.Trim(),
                AdminNameEntry.Text.Trim(),
                AdminPhoneEntry.Text.Trim(),
                AdminPasswordEntry.Text));

            _session.Save(response.Admin);
            await Shell.Current.GoToAsync($"//{nameof(DashboardPage)}");
        }
        catch (PharmaStockApiException ex)
        {
            ShowError(ex.Message);
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
