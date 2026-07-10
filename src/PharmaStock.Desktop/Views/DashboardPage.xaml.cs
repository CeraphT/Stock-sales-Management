using PharmaStock.Desktop.Services;

namespace PharmaStock.Desktop.Views;

public partial class DashboardPage : ContentPage
{
    private readonly SessionService _session;

    public DashboardPage(SessionService session)
    {
        InitializeComponent();
        _session = session;
    }

    protected override void OnAppearing()
    {
        base.OnAppearing();
        WelcomeLabel.Text = $"Welcome, {_session.UserName}";
        RoleLabel.Text = $"Role: {_session.UserRole}";
        CompanyLabel.Text = $"Company ID: {_session.CompanyId}";
    }

    private async void OnLogOutClicked(object? sender, EventArgs e)
    {
        _session.Clear();
        await Shell.Current.GoToAsync($"//{nameof(Views.OnboardingPage)}");
    }
}
