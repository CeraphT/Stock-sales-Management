using Microsoft.Extensions.DependencyInjection;
using PharmaStock.Desktop.Controls;
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
		var appShell = new AppShell();
		var window = new Window(appShell);

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

#if WINDOWS
		// A real Window.TitleBar (not a per-page Shell.TitleView) so the
		// header spans the FULL window width above the docked flyout
		// sidebar (Shell's Locked flyout renders full-height beside the
		// content pane by design — nothing at the per-page level can make it
		// start lower than that). Built once, app-wide, and kept in sync
		// with the current page via AppShell.Navigated below, rather than
		// per-page like PageHeaderExtensions.AttachStandardHeader (Android's
		// approach, which has no equivalent TitleBar concept to hang this
		// off of).
		window.TitleBar = BuildTitleBar(appShell);
#endif

		return window;
	}

#if WINDOWS
	private static TitleBar BuildTitleBar(AppShell appShell)
	{
		var titleBar = new TitleBar
		{
			Title = "PharmaStock",
			HeightRequest = 48,
		};
		// BackgroundColor is inherited from VisualElement (TitleBar doesn't
		// redeclare its own), unlike ForegroundColor below which is genuinely
		// TitleBar-specific — referencing the base class's property here to
		// avoid assuming a static field TitleBar doesn't actually own.
		titleBar.SetAppThemeColor(VisualElement.BackgroundColorProperty,
			(Color)Application.Current!.Resources["White"],
			(Color)Application.Current!.Resources["OffBlack"]);
		titleBar.SetAppThemeColor(TitleBar.ForegroundColorProperty,
			(Color)Application.Current!.Resources["Black"],
			(Color)Application.Current!.Resources["SecondaryDarkText"]);

		var authenticatedActions = BuildAuthenticatedActions(appShell);
		var preAuthActions = BuildPreAuthActions();

		// Docked-but-collapsible: FlyoutBehavior stays Locked (pushes content
		// aside) at all times on authenticated pages — never Flyout, which is
		// what made the sidebar overlay/cover content as a modal drawer
		// before, and never toggled to Disabled either, since that turned
		// out not to reliably collapse the docked pane at runtime (a Shell
		// property mutation WinUI apparently doesn't fully re-layout for).
		// The actual open/closed toggle instead just changes FlyoutWidth
		// between its normal value and 0 — a plain numeric layout property,
		// which does reliably collapse it. Forced shut regardless of this
		// toggle while on a pre-auth page (nothing to navigate to yet).
		var sidebarOpen = true;
		const double SidebarWidth = 260;
		// A Label + TapGestureRecognizer (matching LanguageSwitch's own
		// pattern, which renders correctly in TrailingContent) rather than
		// an ImageButton+FontImageSource: that combination rendered
		// invisible specifically in LeadingContent — set color came through
		// fine in TrailingContent for the theme/sync/logout buttons below,
		// so this looks like Windows applying its own system caption-button
		// coloring to LeadingContent icon buttons specifically, overriding
		// the app's own color. Plain Unicode "☰" (U+2630), not a
		// BootstrapIcons glyph — that curated font has no hamburger/menu
		// icon in it, and guessing an unverified codepoint risks a blank
		// glyph on top of everything else here.
		var toggleLabel = new Label { Text = "☰", FontSize = 18, VerticalOptions = LayoutOptions.Center, HorizontalOptions = LayoutOptions.Center };
		toggleLabel.SetAppThemeColor(Label.TextColorProperty,
			(Color)Application.Current!.Resources["Black"],
			(Color)Application.Current!.Resources["SecondaryDarkText"]);
		var toggleButton = new Border
		{
			Content = toggleLabel,
			HeightRequest = 36,
			WidthRequest = 36,
			StrokeThickness = 0,
			BackgroundColor = Colors.Transparent,
		};
		var toggleTap = new TapGestureRecognizer();
		toggleButton.GestureRecognizers.Add(toggleTap);

		void Refresh()
		{
			var currentPage = appShell.CurrentPage;
			var isPreAuth = AppShell.IsPreAuthPage(currentPage);
			titleBar.Title = string.IsNullOrWhiteSpace(currentPage?.Title) ? "PharmaStock" : currentPage.Title;
			// Onboarding/Login/CreateCompany/JoinCompany get just the
			// language switch + theme toggle (no sync/logout — no session
			// yet); their own former inline on-card LanguageSwitch is gone
			// now that it lives up here instead.
			titleBar.TrailingContent = isPreAuth ? preAuthActions : authenticatedActions;
			// Always kept visible (even pre-auth, where it's inert — Disabled
			// below means there's no sidebar for it to toggle) — hiding
			// LeadingContent left that slot empty, and WinUI filled it back
			// in with its own uncontrollable native back-button chrome
			// instead, rendered in a color that doesn't respect the app's
			// theme. Keeping this claimed at all times is what suppresses
			// that fallback.
			appShell.FlyoutBehavior = isPreAuth ? FlyoutBehavior.Disabled : FlyoutBehavior.Locked;
			appShell.FlyoutWidth = !isPreAuth && sidebarOpen ? SidebarWidth : 0;
		}

		toggleTap.Tapped += (_, _) =>
		{
			sidebarOpen = !sidebarOpen;
			Refresh();
		};
		titleBar.LeadingContent = toggleButton;

		Refresh();
		appShell.Navigated += (_, _) => Refresh();

		return titleBar;
	}

	// Language switch + theme toggle are shared between the pre-auth header
	// (Onboarding/Login/CreateCompany/JoinCompany — no session yet, so no
	// sync/logout) and the authenticated one below, which adds those two on
	// top of this same pair.
	private static HorizontalStackLayout BuildLanguageAndThemeGroup(out ImageButton themeButton)
	{
		var themeService = IPlatformApplication.Current?.Services.GetService<ThemeService>();

		var languageSwitch = new LanguageSwitch { VerticalOptions = LayoutOptions.Center, Margin = new Thickness(0, 0, 12, 0) };

		var button = MakeTitleBarButton(themeService?.IsDark == true ? BootstrapIcons.Sun : BootstrapIcons.MoonStars);
		button.Clicked += (_, _) =>
		{
			themeService?.Toggle();
			button.Source = MakeTitleBarIcon(themeService?.IsDark == true ? BootstrapIcons.Sun : BootstrapIcons.MoonStars);
		};
		themeButton = button;

		return new HorizontalStackLayout
		{
			VerticalOptions = LayoutOptions.Center,
			Spacing = 4,
			Children = { languageSwitch, button },
		};
	}

	// Onboarding/Login/CreateCompany/JoinCompany's TitleBar.TrailingContent:
	// just the language switch + theme toggle from above — these pages
	// already carry their own inline LanguageSwitch on-card today (removed
	// once this lands, per the request to move it up here instead), and
	// have no session to log out of or sync yet.
	private static HorizontalStackLayout BuildPreAuthActions() => BuildLanguageAndThemeGroup(out _);

	// Built once (not per-page like Android's ToolbarItems) since there's
	// only ever one TitleBar for the whole app — simpler than the Android
	// side's "every still-alive page's icon must stay in sync" theme-change
	// handling, since here there's just the one instance to update.
	private static HorizontalStackLayout BuildAuthenticatedActions(AppShell appShell)
	{
		var session = IPlatformApplication.Current?.Services.GetService<SessionService>();
		var group = BuildLanguageAndThemeGroup(out _);

		var syncButton = MakeTitleBarButton(BootstrapIcons.ArrowClockwise);
		syncButton.Clicked += async (_, _) =>
		{
			try
			{
				var syncService = IPlatformApplication.Current?.Services.GetService<SyncService>();
				if (syncService is null) return;
				var result = await syncService.SyncNowAsync();
				// appShell.CurrentPage (the Shell's active content page), not
				// Application.Current.Windows[0].Page (which is the AppShell
				// itself — the window's root, not what's currently displayed).
				if (appShell.CurrentPage is ContentPage page)
				{
					if (result.SalesFailed > 0)
						ToastExtensions.ShowError(page, $"{result.SalesPushed} synchronisé(s), {result.SalesFailed} en échec.");
					else
						ToastExtensions.ShowSuccess(page, result.SalesPushed > 0 || result.RowsPulled > 0
							? $"Synchronisé : {result.SalesPushed} vente(s) envoyée(s), {result.RowsPulled} mise(s) à jour reçue(s)."
							: "Déjà à jour.");
				}
			}
			catch
			{
				// A sync failure here must never crash the title bar's own
				// event handling — same defensive stance as the Android
				// ToolbarItem version.
			}
		};

		var logoutButton = MakeTitleBarButton(BootstrapIcons.BoxArrowRight);
		logoutButton.Clicked += async (_, _) =>
		{
			session?.Clear();
			IPlatformApplication.Current?.Services.GetService<SyncService>()?.StopBackgroundSync();
			try
			{
				await Shell.Current.GoToAsync(AppShell.OnboardingRoute);
			}
			catch
			{
				// Never let a failed navigation crash the title bar itself.
			}
		};

		group.Children.Add(syncButton);
		group.Children.Add(logoutButton);
		return group;
	}

	private static FontImageSource MakeTitleBarIcon(string glyph) => PageHeaderExtensions.MakeToolbarIcon(glyph);

	private static ImageButton MakeTitleBarButton(string glyph) => new()
	{
		Source = MakeTitleBarIcon(glyph),
		HeightRequest = 36,
		WidthRequest = 36,
		BorderWidth = 0,
		Background = Colors.Transparent,
	};
#endif
}