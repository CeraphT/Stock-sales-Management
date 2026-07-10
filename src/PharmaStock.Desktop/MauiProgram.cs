using Microsoft.Extensions.Logging;
using PharmaStock.Desktop.Services;
using PharmaStock.Desktop.Views;

namespace PharmaStock.Desktop;

public static class MauiProgram
{
	// Dev-only: the API is assumed to be running locally. This becomes a
	// per-device setting once there's a real deployment to point at.
	private const string ApiBaseAddress = "http://localhost:5080";

	public static MauiApp CreateMauiApp()
	{
		var builder = MauiApp.CreateBuilder();
		builder
			.UseMauiApp<App>()
			.ConfigureFonts(fonts =>
			{
				fonts.AddFont("OpenSans-Regular.ttf", "OpenSansRegular");
				fonts.AddFont("OpenSans-Semibold.ttf", "OpenSansSemibold");
			});

		builder.Services.AddSingleton(_ => new HttpClient { BaseAddress = new Uri(ApiBaseAddress) });
		builder.Services.AddSingleton<PharmaStockApiClient>();
		builder.Services.AddSingleton<SessionService>();

		builder.Services.AddTransient<OnboardingPage>();
		builder.Services.AddTransient<CreateCompanyPage>();
		builder.Services.AddTransient<JoinCompanyPage>();
		builder.Services.AddTransient<LoginPage>();
		builder.Services.AddTransient<DashboardPage>();

#if DEBUG
		builder.Logging.AddDebug();
#endif

		return builder.Build();
	}
}
