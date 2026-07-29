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

		// Desktop (wide window, mouse+keyboard) gets a permanently-docked,
		// collapsible sidebar instead of phone/tablet's toggleable overlay
		// drawer (Flyout, the XAML default — screen space is too precious
		// there for a permanent column). Ownership of FlyoutBehavior/
		// FlyoutWidth for Windows lives entirely in App.xaml.cs's
		// Window.TitleBar setup now (both the pre-auth-page check and the
		// user's manual collapse toggle) — not here, to avoid two competing
		// places mutating the same Shell properties on every navigation.

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

		// One single flyout icon, in the one place it's ever shown (the
		// Shell's own nav bar) — swaps to a close "X" while the flyout is
		// open instead of leaving the hamburger showing (which read as "tap
		// to open" even when it was already open) or requiring a second,
		// separately-drawn icon just to close it. FlyoutIsPresented is a
		// bindable property, so any change to it (this icon, tapping
		// outside the flyout, a swipe) raises PropertyChanged here.
		UpdateFlyoutIcon();
		PropertyChanged += (_, e) =>
		{
			if (e.PropertyName == nameof(FlyoutIsPresented)) UpdateFlyoutIcon();
		};
	}

	// Leaving FlyoutIcon null restores each platform's own default hamburger
	// rendering (confirmed reliable on both Android and Windows) — only the
	// "open" state needs an explicit override, using the same verified
	// XLg glyph every Cancel button in the app already uses, so there's no
	// risk of an unverified codepoint rendering blank here.
	private void UpdateFlyoutIcon()
	{
		// Locked (Desktop) has no open/closed state to toggle — the sidebar
		// is just always there, so there's nothing for this icon to do.
		if (FlyoutBehavior == FlyoutBehavior.Locked) { FlyoutIcon = null; return; }
		if (!FlyoutIsPresented) { FlyoutIcon = null; return; }

		var icon = new FontImageSource { FontFamily = "BootstrapIcons", Glyph = BootstrapIcons.XLg, Size = 18 };
		icon.SetAppThemeColor(FontImageSource.ColorProperty,
			(Color)Application.Current!.Resources["Black"],
			(Color)Application.Current!.Resources["SecondaryDarkText"]);
		FlyoutIcon = icon;
	}

	// AppShell is constructed once and lives for the app's whole process
	// lifetime (same reasoning as every FlyoutItem page never being torn
	// down — see the comment above), so these subscriptions are never
	// unsubscribed; there's nothing to leak since there's only ever one
	// AppShell instance.
	private View BuildFlyoutHeader()
	{
		var session = IPlatformApplication.Current?.Services.GetService<SessionService>();

		// Plain White (not theme-bound) — the flyout background is now a
		// deliberately theme-invariant colored gradient (see Shell style in
		// Styles.xaml), so its text stays white regardless of light/dark mode.
		var appNameLabel = new Label { Text = "PharmaStock", FontAttributes = FontAttributes.Bold, FontSize = 18, TextColor = Colors.White };

		var userLabel = new Label { FontSize = 12, TextColor = Colors.White, Opacity = 0.85 };

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
			Children = { appNameLabel, userLabel },
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

#if WINDOWS
	// CurrentPage is null for the brief moment before Shell finishes
	// navigating to its initial content — treated as pre-auth (Disabled),
	// which is correct anyway since the app always starts on OnboardingPage.
	// Internal (not private): App.xaml.cs's Window.TitleBar also needs this,
	// to know when to show/hide the same logout/sync/theme actions this
	// page's own flyout-lock state depends on.
	internal static bool IsPreAuthPage(Page? page) =>
		page is null or OnboardingPage or LoginPage or CreateCompanyPage or JoinCompanyPage;
#endif

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

		// Plain White for the same reason as the flyout header labels above —
		// this sits on the theme-invariant colored sidebar, not page content.
		var iconLabel = new Label { Text = icon, FontFamily = "BootstrapIcons", FontSize = 14, VerticalOptions = LayoutOptions.Center, TextColor = Colors.White };
		Grid.SetColumn(iconLabel, 0);

		var textLabel = new Label { FontSize = 14, VerticalOptions = LayoutOptions.Center, TextColor = Colors.White };
		textLabel.SetBinding(Label.TextProperty, new Binding(nameof(LocalizedString.Value), source: new LocalizedString(titleKey)));
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
#if ANDROID
				// Built-in FlyoutItem selection auto-closes the flyout; a
				// fully custom Shell.FlyoutContent doesn't get that for
				// free, so it has to be done explicitly here. Windows must
				// NOT do this: the sidebar there is Locked (always
				// "presented" by design — App.xaml.cs's Window.TitleBar
				// toggle instead collapses it via FlyoutWidth), and forcing
				// FlyoutIsPresented false on a Locked shell left it in a
				// state neither that toggle nor anything else could undo —
				// the sidebar vanished on the very first navigation and
				// never came back.
				Shell.Current.FlyoutIsPresented = false;
#endif
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
