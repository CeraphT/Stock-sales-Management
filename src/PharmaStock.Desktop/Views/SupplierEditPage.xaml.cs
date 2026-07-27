using PharmaStock.Desktop.Services;

namespace PharmaStock.Desktop.Views;

/// <summary>Modal create/edit form for a supplier — pushed by instance via
/// Navigation.PushModalAsync, same pattern as ReceivePurchaseOrderLinePage.
/// Handles both create (existing == null) and edit in one form so a supplier
/// can be given phone/email at creation time too, unlike the quick-add
/// name-only prompt on SupplierPickerPage.</summary>
public partial class SupplierEditPage : ContentPage
{
    private readonly PharmaStockApiClient _api;
    private readonly SessionService _session;

    private Guid? _supplierId;
    private TaskCompletionSource<bool>? _completionSource;

    public SupplierEditPage(PharmaStockApiClient api, SessionService session)
    {
        InitializeComponent();
        _api = api;
        _session = session;
    }

    public Task<bool> EditAsync(SupplierResponse? existing)
    {
        _supplierId = existing?.Id;
        HeaderLabel.Text = LocalizationService.Translate(existing is null ? "SupplierEdit_TitleNew" : "SupplierEdit_TitleEdit");
        NameField.Text = existing?.Name ?? string.Empty;
        PhoneField.Text = existing?.ContactPhone ?? string.Empty;
        EmailField.Text = existing?.ContactEmail ?? string.Empty;

        _completionSource = new TaskCompletionSource<bool>();
        return _completionSource.Task;
    }

    private async void OnSaveClicked(object? sender, EventArgs e)
    {
        if (string.IsNullOrWhiteSpace(NameField.Text))
        {
            this.ShowError(LocalizationService.Translate("SupplierEdit_NameRequired"));
            return;
        }

        SetBusy(true);
        try
        {
            var companyId = _session.CompanyId!.Value;
            var name = NameField.Text.Trim();
            var phone = string.IsNullOrWhiteSpace(PhoneField.Text) ? null : PhoneField.Text.Trim();
            var email = string.IsNullOrWhiteSpace(EmailField.Text) ? null : EmailField.Text.Trim();

            if (_supplierId.HasValue)
                await _api.UpdateSupplierAsync(companyId, _supplierId.Value, name, phone, email);
            else
                await _api.CreateSupplierAsync(companyId, name, phone, email);

            await CloseAsync(true);
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

    private async void OnCancelClicked(object? sender, EventArgs e) => await CloseAsync(false);

    private async Task CloseAsync(bool saved)
    {
        try
        {
            await Navigation.PopModalAsync();
        }
        finally
        {
            _completionSource?.TrySetResult(saved);
        }
    }

    private void SetBusy(bool busy)
    {
        SaveButton.IsEnabled = !busy;
        Spinner.IsRunning = busy;
        Spinner.IsVisible = busy;
    }
}
