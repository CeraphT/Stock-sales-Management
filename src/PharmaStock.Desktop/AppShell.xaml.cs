using PharmaStock.Desktop.Views;

namespace PharmaStock.Desktop;

public partial class AppShell : Shell
{
	// Fully-qualified so every caller matches the FlyoutItem/ShellContent
	// hierarchy declared in AppShell.xaml exactly — avoids relying on Shell's
	// leaf-route fallback matching, which isn't worth trusting blindly.
	public const string OnboardingRoute = "//OnboardingSection/OnboardingPage";
	public const string DashboardRoute = "//DashboardSection/DashboardPage";

	public AppShell()
	{
		InitializeComponent();

		// OnboardingPage and DashboardPage are declared in the XAML above (each
		// in its own FlyoutItem) since they're absolute-navigation targets;
		// only the pages pushed relatively on top of them need registering here.
		Routing.RegisterRoute(nameof(CreateCompanyPage), typeof(CreateCompanyPage));
		Routing.RegisterRoute(nameof(JoinCompanyPage), typeof(JoinCompanyPage));
		Routing.RegisterRoute(nameof(LoginPage), typeof(LoginPage));
	}
}
