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
		var window = new Window(new AppShell());

		// Desktop/Mac only — these sizing properties are no-ops on phones/
		// tablets. Opens large enough by default for PosPage's wide
		// side-by-side layout (see ApplyResponsiveLayout) to actually be
		// visible without the user resizing/maximizing first, and keeps a
		// floor so the window can't be shrunk down to where that same
		// layout — or any other page — starts looking broken.
		if (DeviceInfo.Current.Idiom == DeviceIdiom.Desktop)
		{
			window.Width = 1280;
			window.Height = 860;
			window.MinimumWidth = 900;
			window.MinimumHeight = 600;
		}

		return window;
	}
}