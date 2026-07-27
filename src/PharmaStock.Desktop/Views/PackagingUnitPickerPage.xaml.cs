using PharmaStock.Desktop.Services;

namespace PharmaStock.Desktop.Views;

/// <summary>Full-screen modal packaging-unit-name picker — same
/// modal/TaskCompletionSource/PickAsync() pattern as CategoryPickerPage, but
/// over plain strings: unit names ("Boîte", "Carton") aren't a managed
/// entity like Category (no rename/delete use case), so "+ Nouveau" just
/// resolves with the typed name directly rather than round-tripping to the
/// API — it only becomes real once saved as part of a product's packaging
/// levels.</summary>
public partial class PackagingUnitPickerPage : ContentPage
{
    private readonly PharmaStockApiClient _api;
    private readonly SessionService _session;
    private List<string> _allNames = new();
    private TaskCompletionSource<string?>? _completionSource;

    public PackagingUnitPickerPage(PharmaStockApiClient api, SessionService session)
    {
        InitializeComponent();
        _api = api;
        _session = session;
    }

    public Task<string?> PickAsync()
    {
        _completionSource = new TaskCompletionSource<string?>();
        return _completionSource.Task;
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        SearchBarControl.Text = string.Empty;
        try
        {
            await LoadNamesAsync();
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    private async Task LoadNamesAsync()
    {
        // Same reasoning as CategoryPickerPage: this page is reused across
        // every PickAsync() open, so the previous list must be cleared before
        // the spinner starts, not left visible underneath it.
        NamesView.ItemsSource = null;
        EmptyLabel.IsVisible = false;
        SetBusy(true);
        try
        {
            var companyId = _session.CompanyId!.Value;
            _allNames = await _api.GetPackagingUnitNamesAsync(companyId);
            ApplyFilter(SearchBarControl.Text);
        }
        finally
        {
            SetBusy(false);
        }
    }

    private void ApplyFilter(string? search)
    {
        var filtered = string.IsNullOrWhiteSpace(search)
            ? _allNames
            : _allNames.Where(n => n.Contains(search, StringComparison.OrdinalIgnoreCase)).ToList();

        NamesView.ItemsSource = filtered;
        EmptyLabel.IsVisible = filtered.Count == 0;
    }

    private void OnSearchTextChanged(object? sender, TextChangedEventArgs e) => ApplyFilter(e.NewTextValue);

    private async void OnNameSelected(object? sender, SelectionChangedEventArgs e)
    {
        var name = e.CurrentSelection.FirstOrDefault() as string;
        NamesView.SelectedItem = null;
        if (name is null) return;

        await CloseAsync(name);
    }

    private async void OnAddUnitNameClicked(object? sender, EventArgs e)
    {
        var name = await this.DisplayPromptAsync(LocalizationService.Translate("UnitPicker_NewTitle"), LocalizationService.Translate("UnitPicker_NamePrompt"));
        if (string.IsNullOrWhiteSpace(name)) return;

        await CloseAsync(name.Trim());
    }

    private async void OnCancelClicked(object? sender, EventArgs e) => await CloseAsync(null);

    private async Task CloseAsync(string? name)
    {
        try
        {
            await Navigation.PopModalAsync();
        }
        finally
        {
            _completionSource?.TrySetResult(name);
        }
    }

    private void SetBusy(bool busy)
    {
        Spinner.IsRunning = busy;
        Spinner.IsVisible = busy;
    }
}
