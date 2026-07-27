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
        ResultCard.IsVisible = false;
        ContinueButton.IsVisible = false;

        if (string.IsNullOrWhiteSpace(CodeField.Text))
        {
            ShowError(LocalizationService.Translate("JoinCompany_MissingCode"));
            return;
        }

        SetBusy(true);
        try
        {
            var company = await _api.JoinCompanyAsync(CodeField.Text.Trim());
            ResultLabel.Text = LocalizationService.Translate("JoinCompany_Found", company.Name);
            ResultCard.IsVisible = true;
            ContinueButton.IsVisible = true;
        }
        catch (PharmaStockApiException ex)
        {
            ShowError(ex.Message);
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

    private async void OnContinueClicked(object? sender, EventArgs e)
        => await Shell.Current.GoToAsync(nameof(LoginPage));

    private void ShowError(string message) => ToastExtensions.ShowError(this, message);

    private void SetBusy(bool busy)
    {
        FindButton.IsEnabled = !busy;
        Spinner.IsRunning = busy;
        Spinner.IsVisible = busy;
    }
}
