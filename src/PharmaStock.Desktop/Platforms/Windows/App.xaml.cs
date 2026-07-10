using Microsoft.UI.Xaml;

// To learn more about WinUI, the WinUI project structure,
// and more about our project templates, see: http://aka.ms/winui-project-info.

namespace PharmaStock.Desktop.WinUI;

/// <summary>
/// Provides application-specific behavior to supplement the default Application class.
/// </summary>
public partial class App : MauiWinUIApplication
{
	/// <summary>
	/// Initializes the singleton application object.  This is the first line of authored code
	/// executed, and as such is the logical equivalent of main() or WinMain().
	/// </summary>
	public App()
	{
		this.InitializeComponent();

		// Without this, any unhandled exception on the UI thread (e.g. a bad
		// Shell navigation, a JSON parsing error) silently terminates the
		// whole process with no dialog and no console output — exactly what
		// happened before this was added. Now it's shown to the user instead.
		this.UnhandledException += OnUnhandledException;
	}

	private void OnUnhandledException(object sender, Microsoft.UI.Xaml.UnhandledExceptionEventArgs e)
	{
		e.Handled = true;
		System.Diagnostics.Debug.WriteLine($"[UNHANDLED EXCEPTION] {e.Exception}");

		var page = Microsoft.Maui.Controls.Application.Current?.Windows.FirstOrDefault()?.Page;
		if (page is not null)
			_ = page.DisplayAlertAsync("Unexpected error", e.Exception.Message, "OK");
	}

	protected override MauiApp CreateMauiApp() => MauiProgram.CreateMauiApp();
}

