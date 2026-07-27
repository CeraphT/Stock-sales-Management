using System.Globalization;
using Microsoft.Maui.ApplicationModel.DataTransfer;
using PharmaStock.Desktop.Services;

namespace PharmaStock.Desktop.Views;

/// <summary>"Gérer mon entreprise" — a CompanyAdmin editing their own
/// company's own details post-onboarding. Deliberately scoped to the
/// caller's own company only (enforced server-side too); cross-tenant
/// Super Admin management of every company in the system is a separate,
/// future Blazor web app — see project decision, not this screen.</summary>
public partial class CompanySettingsPage : ContentPage
{
    private readonly PharmaStockApiClient _api;
    private readonly SessionService _session;

    public CompanySettingsPage(PharmaStockApiClient api, SessionService session, ThemeService themeService)
    {
        InitializeComponent();
        _api = api;
        _session = session;
        this.AttachStandardHeader(themeService, session);
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        FormScroll.IsVisible = false;
        LoadingSpinner.IsVisible = true;
        LoadingSpinner.IsRunning = true;
        try
        {
            var companyId = _session.CompanyId!.Value;
            var company = await _api.GetCompanyAsync(companyId);

            NameField.Text = company.Name;
            DescriptionField.Text = company.Description ?? string.Empty;
            CurrencyField.Text = company.Currency;
            TaxRateField.Text = company.DefaultTaxRatePercent.ToString(CultureInfo.InvariantCulture);
            UniqueCodeLabel.Text = company.UniqueCode;
        }
        catch (PharmaStockApiException ex)
        {
            this.ShowError(ex.Message);
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
        finally
        {
            LoadingSpinner.IsRunning = false;
            LoadingSpinner.IsVisible = false;
            FormScroll.IsVisible = true;
        }
    }

    private async void OnSaveClicked(object? sender, EventArgs e)
    {
        if (string.IsNullOrWhiteSpace(NameField.Text))
        {
            this.ShowError(LocalizationService.Translate("CompanySettings_NameRequired"));
            return;
        }

        var taxRate = ParseDecimal(TaxRateField.Text) ?? 0;

        SetBusy(true);
        try
        {
            var companyId = _session.CompanyId!.Value;
            var request = new UpdateCompanyRequest(
                NameField.Text.Trim(),
                string.IsNullOrWhiteSpace(DescriptionField.Text) ? null : DescriptionField.Text.Trim(),
                string.IsNullOrWhiteSpace(CurrencyField.Text) ? "XAF" : CurrencyField.Text.Trim(),
                taxRate);

            await _api.UpdateCompanyAsync(companyId, request);
            this.ShowSuccess(LocalizationService.Translate("CompanySettings_Saved"));
        }
        catch (PharmaStockApiException ex)
        {
            this.ShowError(ex.Message);
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
        finally
        {
            SetBusy(false);
        }
    }

    private async void OnShareInviteClicked(object? sender, EventArgs e)
    {
        if (string.IsNullOrWhiteSpace(UniqueCodeLabel.Text)) return;

        try
        {
            await Share.Default.RequestAsync(new ShareTextRequest
            {
                Title = LocalizationService.Translate("CompanySettings_ShareInviteTitle"),
                Text = LocalizationService.Translate("CompanySettings_ShareInviteText", NameField.Text, UniqueCodeLabel.Text),
            });
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    private void SetBusy(bool busy)
    {
        SaveButton.IsEnabled = !busy;
        Spinner.IsRunning = busy;
        Spinner.IsVisible = busy;
    }

    private static decimal? ParseDecimal(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        var normalized = text.Trim().Replace(',', '.');
        return decimal.TryParse(normalized, NumberStyles.Any, CultureInfo.InvariantCulture, out var value) ? value : null;
    }
}
