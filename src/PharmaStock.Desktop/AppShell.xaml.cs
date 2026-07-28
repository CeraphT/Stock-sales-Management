using PharmaStock.Desktop.Controls;
using PharmaStock.Desktop.Services;
using PharmaStock.Desktop.Views;

namespace PharmaStock.Desktop;

public partial class AppShell : Shell
{
	// Fully-qualified so every caller matches the FlyoutItem/ShellContent
	// hierarchy declared in AppShell.xaml exactly — avoids relying on Shell's
	// leaf-route fallback matching, which isn't worth trusting blindly.
	public const string OnboardingRoute = "//OnboardingSection/OnboardingPage";
	public const string DashboardRoute = "//DashboardSection/DashboardPage";
	public const string PosRoute = "//PosSection/PosPage";
	public const string ProductCatalogRoute = "//ProductCatalogSection/ProductCatalogPage";
	public const string CategoryManagementRoute = "//CategoryManagementSection/CategoryManagementPage";
	public const string ArchivedProductsRoute = "//ArchivedProductsSection/ArchivedProductsPage";
	public const string SalesHistoryRoute = "//SalesHistorySection/SalesHistoryPage";
	public const string HeldSalesHistoryRoute = "//HeldSalesHistorySection/HeldSalesHistoryPage";
	public const string ReportsRoute = "//ReportsSection/ReportsPage";
	public const string PurchaseOrdersRoute = "//PurchaseOrdersSection/PurchaseOrdersListPage";
	public const string SupplierManagementRoute = "//SupplierManagementSection/SupplierManagementPage";
	public const string CustomerManagementRoute = "//CustomerManagementSection/CustomerManagementPage";
	public const string GiftCardManagementRoute = "//GiftCardManagementSection/GiftCardManagementPage";
	public const string CompanySettingsRoute = "//CompanySettingsSection/CompanySettingsPage";
	public const string PrinterSettingsRoute = "//PrinterSettingsSection/PrinterSettingsPage";
	public const string CashRegisterRoute = "//CashRegisterSection/CashRegisterPage";

	public AppShell()
	{
		InitializeComponent();

		// OnboardingPage, DashboardPage, PosPage, ProductCatalogPage, and
		// CategoryManagementPage are declared in the XAML above (each in its
		// own FlyoutItem) since they're absolute-navigation targets; only the
		// pages pushed relatively on top of them need registering here.
		// BarcodeScannerPage and CategoryPickerPage are pushed modally by
		// instance (Navigation.PushModalAsync), so they need no route at all.
		Routing.RegisterRoute(nameof(CreateCompanyPage), typeof(CreateCompanyPage));
		Routing.RegisterRoute(nameof(JoinCompanyPage), typeof(JoinCompanyPage));
		Routing.RegisterRoute(nameof(LoginPage), typeof(LoginPage));
		Routing.RegisterRoute(nameof(ProductEditPage), typeof(ProductEditPage));
		Routing.RegisterRoute(nameof(StockReceivePage), typeof(StockReceivePage));
		Routing.RegisterRoute(nameof(StockAdjustPage), typeof(StockAdjustPage));
		Routing.RegisterRoute(nameof(SaleDetailPage), typeof(SaleDetailPage));
		Routing.RegisterRoute(nameof(PurchaseOrderCreatePage), typeof(PurchaseOrderCreatePage));
		Routing.RegisterRoute(nameof(PurchaseOrderDetailPage), typeof(PurchaseOrderDetailPage));

		// The FlyoutItems declared in the XAML above stay in place (each is
		// still a legitimate GoToAsync target — Shell.FlyoutItemIsVisible
		// only hides an item from the auto-rendered flyout list, it doesn't
		// remove it from the route table, exactly like the pre-existing
		// OnboardingSection item). The visible flyout UI is instead this
		// custom header + grouped/collapsible content, built here rather
		// than in XAML so the nav rows can share one translation-binding
		// helper instead of repeating {loc:Translate ...} by hand 13 times.
		FlyoutHeader = BuildFlyoutHeader();
		FlyoutContent = BuildFlyoutContent();
	}

	// AppShell is constructed once and lives for the app's whole process
	// lifetime (same reasoning as every FlyoutItem page never being torn
	// down — see the comment above), so these subscriptions are never
	// unsubscribed; there's nothing to leak since there's only ever one
	// AppShell instance.
	private View BuildFlyoutHeader()
	{
		var session = IPlatformApplication.Current?.Services.GetService<SessionService>();

		var appNameLabel = new Label { Text = "PharmaStock", FontAttributes = FontAttributes.Bold, FontSize = 18, VerticalOptions = LayoutOptions.Center };
		appNameLabel.SetAppThemeColor(Label.TextColorProperty,
			(Color)Application.Current!.Resources["Black"],
			(Color)Application.Current!.Resources["SecondaryDarkText"]);

		// Explicit, always-in-the-same-place close affordance for the open
		// flyout — Desktop's own hamburger toggle (see PageHeaderExtensions)
		// sits in the page underneath and can be effectively hidden behind
		// the flyout panel once it's open, so relying on tapping that same
		// button again isn't a reliable way to close it. This is separate
		// from — and in addition to — tapping outside the flyout, which
		// still also dismisses it.
		var closeLabel = new Label
		{
			Text = "✕", FontSize = 16, VerticalOptions = LayoutOptions.Center, HorizontalOptions = LayoutOptions.End,
			Padding = new Thickness(10, 6),
		};
		closeLabel.SetAppThemeColor(Label.TextColorProperty,
			(Color)Application.Current!.Resources["TextSecondary"],
			(Color)Application.Current!.Resources["Gray300"]);
		closeLabel.GestureRecognizers.Add(new TapGestureRecognizer
		{
			Command = new Command(() => Shell.Current.FlyoutIsPresented = false),
		});

		var titleRow = new Grid { ColumnDefinitions = { new ColumnDefinition(GridLength.Star), new ColumnDefinition(GridLength.Auto) } };
		titleRow.Children.Add(appNameLabel);
		Grid.SetColumn(appNameLabel, 0);
		titleRow.Children.Add(closeLabel);
		Grid.SetColumn(closeLabel, 1);

		var userLabel = new Label { FontSize = 12 };
		userLabel.SetAppThemeColor(Label.TextColorProperty,
			(Color)Application.Current!.Resources["TextSecondary"],
			(Color)Application.Current!.Resources["Gray300"]);

		// Built once at app startup, this label used to be permanently stuck
		// on whatever was true at that instant — including a previous user's
		// name still on screen after a different account logged in on the
		// same device (session.Changed didn't exist to begin with). Also
		// needs a live LanguageChanged refresh: the role is displayed
		// translated (TranslateRole), not the raw enum value.
		void UpdateUserLabel(object? sender, EventArgs e) => userLabel.Text = session?.UserName is { Length: > 0 } name
			? (session.UserRole is { Length: > 0 } role ? $"{name} · {LocalizationService.TranslateRole(role)}" : name)
			: string.Empty;
		UpdateUserLabel(this, EventArgs.Empty);
		if (session is not null) session.Changed += UpdateUserLabel;
		LocalizationService.LanguageChanged += UpdateUserLabel;

		return new VerticalStackLayout
		{
			Padding = new Thickness(16, 24, 16, 16),
			Spacing = 2,
			Children = { titleRow, userLabel },
		};
	}

	private View BuildFlyoutContent()
	{
		var stack = new VerticalStackLayout { Spacing = 4 };

		stack.Children.Add(BuildNavRow(BootstrapIcons.HouseDoor, "Shell_Dashboard", DashboardRoute));

		// Ventes starts expanded — the highest-traffic group on a POS-primary
		// device (see CLAUDE.md's Android-primary priority); the other three
		// start collapsed to keep the initial flyout short.
		var sales = new FlyoutSection { Icon = BootstrapIcons.Cart3, IsExpanded = true };
		BindTranslatedTitle(sales, "Shell_SalesGroup");
		sales.AddRow(BuildNavRow(BootstrapIcons.UpcScan, "Shell_Pos", PosRoute));
		sales.AddRow(BuildNavRow(BootstrapIcons.CashCoin, "Shell_CashRegister", CashRegisterRoute));
		sales.AddRow(BuildNavRow(BootstrapIcons.ClockHistory, "Shell_SalesHistory", SalesHistoryRoute));
		sales.AddRow(BuildNavRow(BootstrapIcons.PauseCircle, "Shell_HeldSales", HeldSalesHistoryRoute));
		stack.Children.Add(sales);

		var catalog = new FlyoutSection { Icon = BootstrapIcons.BoxSeam };
		BindTranslatedTitle(catalog, "Shell_CatalogGroup");
		catalog.AddRow(BuildNavRow(BootstrapIcons.BoxSeam, "Shell_Products", ProductCatalogRoute));
		catalog.AddRow(BuildNavRow(BootstrapIcons.Tags, "Shell_Categories", CategoryManagementRoute));
		catalog.AddRow(BuildNavRow(BootstrapIcons.Archive, "Shell_Archives", ArchivedProductsRoute));
		stack.Children.Add(catalog);

		var purchasing = new FlyoutSection { Icon = BootstrapIcons.Truck };
		BindTranslatedTitle(purchasing, "Shell_PurchasingGroup");
		purchasing.AddRow(BuildNavRow(BootstrapIcons.Truck, "Shell_Suppliers", SupplierManagementRoute));
		purchasing.AddRow(BuildNavRow(BootstrapIcons.ClipboardCheck, "Shell_PurchaseOrders", PurchaseOrdersRoute));
		stack.Children.Add(purchasing);

		var clients = new FlyoutSection { Icon = BootstrapIcons.Phone };
		BindTranslatedTitle(clients, "Shell_ClientsGroup");
		clients.AddRow(BuildNavRow(BootstrapIcons.Phone, "Shell_Customers", CustomerManagementRoute));
		clients.AddRow(BuildNavRow(BootstrapIcons.Wallet2, "Shell_GiftCards", GiftCardManagementRoute));
		stack.Children.Add(clients);

		var management = new FlyoutSection { Icon = BootstrapIcons.Gear };
		BindTranslatedTitle(management, "Shell_ManagementGroup");
		management.AddRow(BuildNavRow(BootstrapIcons.BarChartLine, "Shell_Reports", ReportsRoute));
		management.AddRow(BuildNavRow(BootstrapIcons.Printer, "Shell_PrinterSettings", PrinterSettingsRoute));
		management.AddRow(BuildNavRow(BootstrapIcons.Building, "Shell_CompanySettings", CompanySettingsRoute));
		stack.Children.Add(management);

		return new ScrollView { Content = stack };
	}

	private static void BindTranslatedTitle(FlyoutSection section, string key) =>
		section.SetBinding(FlyoutSection.TitleProperty, new Binding(nameof(LocalizedString.Value), source: new LocalizedString(key)));

	private static Grid BuildNavRow(string icon, string titleKey, string route)
	{
		var grid = new Grid
		{
			ColumnDefinitions = { new ColumnDefinition(GridLength.Auto), new ColumnDefinition(GridLength.Star) },
			ColumnSpacing = 10,
			Padding = new Thickness(16, 10, 0, 10),
		};

		var iconLabel = new Label { Text = icon, FontFamily = "BootstrapIcons", FontSize = 14, VerticalOptions = LayoutOptions.Center };
		iconLabel.SetAppThemeColor(Label.TextColorProperty,
			(Color)Application.Current!.Resources["TextPrimary"],
			(Color)Application.Current!.Resources["White"]);
		Grid.SetColumn(iconLabel, 0);

		var textLabel = new Label { FontSize = 14, VerticalOptions = LayoutOptions.Center };
		textLabel.SetBinding(Label.TextProperty, new Binding(nameof(LocalizedString.Value), source: new LocalizedString(titleKey)));
		textLabel.SetAppThemeColor(Label.TextColorProperty,
			(Color)Application.Current!.Resources["TextPrimary"],
			(Color)Application.Current!.Resources["White"]);
		Grid.SetColumn(textLabel, 1);

		grid.Children.Add(iconLabel);
		grid.Children.Add(textLabel);

		var tap = new TapGestureRecognizer();
		tap.Tapped += async (_, _) =>
		{
			// Same async-void crash risk documented for ToolbarItem.Clicked
			// handlers elsewhere in this project (see PageHeaderExtensions.cs)
			// — there's no platform-level catch-all on Android, so a bad
			// GoToAsync call must not be allowed to escape unhandled here.
			try
			{
				// Built-in FlyoutItem selection auto-closes the flyout; a
				// fully custom Shell.FlyoutContent doesn't get that for
				// free, so it has to be done explicitly here.
				Shell.Current.FlyoutIsPresented = false;
				await Shell.Current.GoToAsync(route);
			}
			catch (Exception ex)
			{
				if (Shell.Current?.CurrentPage is ContentPage page)
					page.ShowError(ex.Message);
			}
		};
		grid.GestureRecognizers.Add(tap);

		return grid;
	}
}
