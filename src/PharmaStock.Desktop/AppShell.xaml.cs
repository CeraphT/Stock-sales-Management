using PharmaStock.Desktop.Views;

namespace PharmaStock.Desktop;

public partial class AppShell : Shell
{
	public AppShell()
	{
		InitializeComponent();

		Routing.RegisterRoute(nameof(CreateCompanyPage), typeof(CreateCompanyPage));
		Routing.RegisterRoute(nameof(JoinCompanyPage), typeof(JoinCompanyPage));
		Routing.RegisterRoute(nameof(LoginPage), typeof(LoginPage));
		Routing.RegisterRoute(nameof(DashboardPage), typeof(DashboardPage));
	}
}
