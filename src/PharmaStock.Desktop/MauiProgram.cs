using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using PharmaStock.Desktop.Services;
using PharmaStock.Desktop.Views;
using PharmaStock.Infrastructure.Data;
using ZXing.Net.Maui.Controls;

namespace PharmaStock.Desktop;

public static class MauiProgram
{
	// Dev-only: the API is assumed to be running locally. This becomes a
	// per-device setting once there's a real deployment to point at.
	private const string ApiBaseAddress = "http://localhost:5080";

	public static MauiApp CreateMauiApp()
	{
		// Registers CP850 etc. for ReceiptFormatter — .NET doesn't ship legacy
		// codepages by default, but ESC/POS thermal printers speak them, not UTF-8.
		Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);

		var builder = MauiApp.CreateBuilder();
		builder
			.UseMauiApp<App>()
			.UseBarcodeReader()
			.ConfigureFonts(fonts =>
			{
				fonts.AddFont("OpenSans-Regular.ttf", "OpenSansRegular");
				fonts.AddFont("OpenSans-Semibold.ttf", "OpenSansSemibold");
				fonts.AddFont("bootstrap-icons.ttf", "BootstrapIcons");
			});

		builder.Services.AddSingleton(_ => new HttpClient { BaseAddress = new Uri(ApiBaseAddress) });
		builder.Services.AddSingleton<PharmaStockApiClient>();
		builder.Services.AddSingleton<SessionService>();
		builder.Services.AddSingleton<ThemeService>();

		// Local offline-first database (Section 6) — same PharmaStockDbContext
		// as the server, pointed at a file on-device instead of Postgres, so
		// StockDeductionService's business logic runs unmodified. A factory
		// (not AddDbContext/scoped) because MAUI has no per-request scope —
		// checkout and background sync could otherwise race on one shared
		// context instance.
		var localDbPath = Path.Combine(FileSystem.AppDataDirectory, "pharmastock_local.db");
		builder.Services.AddDbContextFactory<PharmaStockDbContext>(options =>
			options.UseSqlite($"Data Source={localDbPath}",
				x => x.MigrationsAssembly("PharmaStock.Desktop")));
		builder.Services.AddSingleton<LocalDbWriteLock>();
		builder.Services.AddSingleton<LocalCatalogQueryService>();
		builder.Services.AddSingleton<LocalSalesService>();
		builder.Services.AddSingleton<LocalShiftService>();
		builder.Services.AddSingleton<SyncService>();

		// Receipt printer transports: Android-only (see IPrinterTransport) — a
		// 58mm thermal printer is an Android-primary POS accessory, not a
		// Windows one. ReceiptPrintingService still resolves cleanly on
		// Windows with zero transports registered; printing there just
		// reports "no printer found" instead of crashing.
#if ANDROID
		builder.Services.AddSingleton<IPrinterTransport, PharmaStock.Desktop.Platforms.Android.Services.BluetoothPrinterTransport>();
		builder.Services.AddSingleton<IPrinterTransport, PharmaStock.Desktop.Platforms.Android.Services.UsbPrinterTransport>();
#endif
		builder.Services.AddSingleton<ReceiptPrintingService>();

		builder.Services.AddTransient<OnboardingPage>();
		builder.Services.AddTransient<CreateCompanyPage>();
		builder.Services.AddTransient<JoinCompanyPage>();
		builder.Services.AddTransient<LoginPage>();
		builder.Services.AddTransient<DashboardPage>();
		builder.Services.AddTransient<PosPage>();
		builder.Services.AddTransient<BarcodeScannerPage>();
		builder.Services.AddTransient<ProductCatalogPage>();
		builder.Services.AddTransient<ProductEditPage>();
		builder.Services.AddTransient<StockReceivePage>();
		builder.Services.AddTransient<StockAdjustPage>();
		builder.Services.AddTransient<CategoryPickerPage>();
		builder.Services.AddTransient<CategoryManagementPage>();
		builder.Services.AddTransient<PackagingUnitPickerPage>();
		builder.Services.AddTransient<ProductFilterPage>();
		builder.Services.AddTransient<ArchivedProductsPage>();
		builder.Services.AddTransient<SalesHistoryPage>();
		builder.Services.AddTransient<SaleDetailPage>();
		builder.Services.AddTransient<PrinterSettingsPage>();
		builder.Services.AddTransient<CashRegisterPage>();
		builder.Services.AddTransient<HeldSalesPage>();
		builder.Services.AddTransient<HeldSalesHistoryPage>();
		builder.Services.AddTransient<ReportsPage>();
		builder.Services.AddTransient<SupplierPickerPage>();
		builder.Services.AddTransient<PurchaseOrdersListPage>();
		builder.Services.AddTransient<PurchaseOrderCreatePage>();
		builder.Services.AddTransient<PurchaseOrderDetailPage>();
		builder.Services.AddTransient<ReceivePurchaseOrderLinePage>();
		builder.Services.AddTransient<SupplierEditPage>();
		builder.Services.AddTransient<SupplierManagementPage>();
		builder.Services.AddTransient<CompanySettingsPage>();

#if DEBUG
		builder.Logging.AddDebug();
#endif

		var mauiApp = builder.Build();

		// Apply local SQLite migrations before the app is shown — idempotent,
		// safe on every launch (Database.Migrate() is a no-op once current).
		using (var db = mauiApp.Services.GetRequiredService<IDbContextFactory<PharmaStockDbContext>>().CreateDbContext())
		{
			db.Database.Migrate();
			// WAL reduces "database is locked" contention between the UI
			// thread and background sync writes; belt-and-suspenders
			// alongside LocalDbWriteLock's same-process serialization.
			db.Database.ExecuteSqlRaw("PRAGMA journal_mode=WAL;");
		}

		return mauiApp;
	}
}
