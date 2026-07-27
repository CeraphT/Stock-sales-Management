using Microsoft.Extensions.DependencyInjection;
using PharmaStock.Desktop.Services;

namespace PharmaStock.Desktop;

public partial class App : Application
{
	public App(ThemeService themeService)
	{
		InitializeComponent();
		themeService.ApplyPersisted();
	}

	protected override Window CreateWindow(IActivationState? activationState)
	{
		return new Window(new AppShell());
	}
}