using PharmaStock.Desktop.Services;

namespace PharmaStock.Desktop.Views;

public partial class JoinCompanyPage : ContentPage
{
    private readonly PharmaStockApiClient _api;

    public JoinCompanyPage(PharmaStockApiClient api)
    {
        InitializeComponent();
        _api = api;
    }

    private async void OnFindClicked(object? sender, EventArgs e)
    {
        ErrorLabel.IsVisible = false;
        ResultCard.IsVisible = false;
        ContinueButton.IsVisible = false;

        if (string.IsNullOrWhiteSpace(CodeField.Text))
        {
            ShowError("Enter the company code first.");
            return;
        }

        SetBusy(true);
        try
        {
            var company = await _api.JoinCompanyAsync(CodeField.Text.Trim());
            ResultLabel.Text = $"Found: {company.Name}";
            ResultCard.IsVisible = true;
            ContinueButton.IsVisible = true;
        }
        catch (PharmaStockApiException ex)
        {
            ShowError(ex.Message);
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

    private async void OnContinueClicked(object? sender, EventArgs e)
        => await Shell.Current.GoToAsync(nameof(LoginPage));

    private void ShowError(string message)
    {
        ErrorLabel.Text = message;
        ErrorLabel.IsVisible = true;
    }

    private void SetBusy(bool busy)
    {
        FindButton.IsEnabled = !busy;
        Spinner.IsRunning = busy;
        Spinner.IsVisible = busy;
    }
}
