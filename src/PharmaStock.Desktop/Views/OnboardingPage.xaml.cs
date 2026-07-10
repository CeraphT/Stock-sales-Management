namespace PharmaStock.Desktop.Views;

public partial class OnboardingPage : ContentPage
{
    public OnboardingPage()
    {
        InitializeComponent();
    }

    private async void OnCreateCompanyClicked(object? sender, EventArgs e)
        => await Shell.Current.GoToAsync(nameof(CreateCompanyPage));

    private async void OnJoinCompanyClicked(object? sender, EventArgs e)
        => await Shell.Current.GoToAsync(nameof(JoinCompanyPage));

    private async void OnLoginClicked(object? sender, EventArgs e)
        => await Shell.Current.GoToAsync(nameof(LoginPage));
}
