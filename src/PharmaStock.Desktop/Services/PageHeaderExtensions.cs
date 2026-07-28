using PharmaStock.Desktop.Controls;
using PharmaStock.Desktop.Views;

namespace PharmaStock.Desktop.Services;

/// <summary>Attaches the standard authenticated-app header — page title +
/// language switch in the title area, theme toggle + logout in the toolbar
/// — to a page in code rather than duplicating the same XAML block across
/// every top-level page reachable from the flyout menu (see AppShell.xaml).
/// Pre-auth pages (Onboarding/Login/CreateCompany/JoinCompany) don't call
/// this — they have no "log out" concept and keep their own inline
/// LanguageSwitch instead.</summary>
public static class PageHeaderExtensions
{
    // ToolbarItem has no FontFamily/Text-styling of its own (unlike Button/
    // Label/ToolbarItem's sibling MenuItem types) — an icon-font glyph has
    // to be rendered as a FontImageSource and assigned to IconImageSource
    // instead of set as Text.
    private static FontImageSource MakeToolbarIcon(string glyph)
    {
        var icon = new FontImageSource { FontFamily = "BootstrapIcons", Glyph = glyph, Size = 20 };
        icon.SetAppThemeColor(FontImageSource.ColorProperty,
            (Color)Application.Current!.Resources["Black"],
            (Color)Application.Current!.Resources["SecondaryDarkText"]);
        return icon;
    }

    public static void AttachStandardHeader(this ContentPage page, ThemeService themeService, SessionService session)
    {
        var titleLabel = new Label
        {
            FontSize = 18,
            FontAttributes = FontAttributes.Bold,
            VerticalOptions = LayoutOptions.Center,
            LineBreakMode = LineBreakMode.TailTruncation,
        };
        titleLabel.SetAppThemeColor(Label.TextColorProperty,
            (Color)Application.Current!.Resources["Black"],
            (Color)Application.Current!.Resources["SecondaryDarkText"]);
        // Page.Title is itself a live binding (set via {loc:Translate ...} in
        // each page's XAML, backed by TranslateExtension's LocalizedString),
        // so binding to it here keeps this label in sync on language change
        // for free — no separate LanguageChanged subscription needed.
        titleLabel.SetBinding(Label.TextProperty, new Binding(nameof(Page.Title), source: page));

        var grid = new Grid { Padding = new Thickness(0, 0, 4, 0), ColumnSpacing = 10 };
        var titleColumn = 0;

        // Windows' WinUI Shell chrome renders its own flyout hamburger far
        // less reliably than Android's (thin, low-contrast, occasionally
        // squeezed out once a custom TitleView is set at all) — rather than
        // trust that per-platform default, Desktop gets its own explicit,
        // always-there, always-clickable toggle button matching the rest of
        // the app's icon styling. Android already has a reliable native one
        // (confirmed on-device), so it isn't duplicated there.
        if (DeviceInfo.Current.Platform == DevicePlatform.WinUI)
        {
            grid.ColumnDefinitions.Add(new ColumnDefinition(GridLength.Auto));
            // Plain Unicode (U+2630 TRIGRAM FOR HEAVEN, the standard "hamburger"
            // glyph) rather than a BootstrapIcons codepoint — confirmed
            // rendering correctly via the default font on this platform
            // already (it's what WinUI's own native Shell chrome falls back
            // to), so there's no risk of an unverified glyph rendering blank.
            var flyoutToggle = new Label
            {
                Text = "☰", FontSize = 20,
                VerticalOptions = LayoutOptions.Center, Padding = new Thickness(4, 4, 12, 4),
            };
            flyoutToggle.SetAppThemeColor(Label.TextColorProperty,
                (Color)Application.Current!.Resources["Black"],
                (Color)Application.Current!.Resources["SecondaryDarkText"]);
            flyoutToggle.GestureRecognizers.Add(new TapGestureRecognizer
            {
                Command = new Command(() => Shell.Current.FlyoutIsPresented = !Shell.Current.FlyoutIsPresented),
            });
            grid.Children.Add(flyoutToggle);
            Grid.SetColumn(flyoutToggle, 0);
            titleColumn = 1;
        }

        grid.ColumnDefinitions.Add(new ColumnDefinition(GridLength.Star));
        grid.ColumnDefinitions.Add(new ColumnDefinition(GridLength.Auto));
        grid.Children.Add(titleLabel);
        Grid.SetColumn(titleLabel, titleColumn);
        var languageSwitch = new LanguageSwitch { VerticalOptions = LayoutOptions.Center };
        grid.Children.Add(languageSwitch);
        Grid.SetColumn(languageSwitch, titleColumn + 1);
        Shell.SetTitleView(page, grid);

        var themeToggleItem = new ToolbarItem { IconImageSource = MakeToolbarIcon(themeService.IsDark ? BootstrapIcons.Sun : BootstrapIcons.MoonStars) };
        themeToggleItem.Clicked += (_, _) =>
        {
            themeService.Toggle();
            themeToggleItem.IconImageSource = MakeToolbarIcon(themeService.IsDark ? BootstrapIcons.Sun : BootstrapIcons.MoonStars);
        };
        // Subscribed at the Application level, not the page level: every
        // flyout-menu page stays alive for the app's lifetime (see AppShell.
        // xaml's FlyoutItem-wrapping comment), so a theme change triggered by
        // a DIFFERENT still-alive page's own toggle needs to reach this one
        // too, not just the page that was actually tapped.
        Application.Current!.RequestedThemeChanged += (_, _) =>
            themeToggleItem.IconImageSource = MakeToolbarIcon(themeService.IsDark ? BootstrapIcons.Sun : BootstrapIcons.MoonStars);
        page.ToolbarItems.Add(themeToggleItem);

        var syncItem = new ToolbarItem { IconImageSource = MakeToolbarIcon(BootstrapIcons.ArrowClockwise) };
        syncItem.Clicked += async (_, _) =>
        {
            // async void event handler: any exception that escapes here
            // crashes the whole app on Android (confirmed — there's no
            // platform-level catch-all like the WinUI one Windows has), so
            // this must never let one through, sync bugs included.
            try
            {
                var syncService = IPlatformApplication.Current?.Services.GetService<SyncService>();
                if (syncService is null) return;
                var result = await syncService.SyncNowAsync();
                if (result.SalesFailed > 0)
                    ToastExtensions.ShowError(page, $"{result.SalesPushed} synchronisé(s), {result.SalesFailed} en échec.");
                else
                    ToastExtensions.ShowSuccess(page, result.SalesPushed > 0 || result.RowsPulled > 0
                        ? $"Synchronisé : {result.SalesPushed} vente(s) envoyée(s), {result.RowsPulled} mise(s) à jour reçue(s)."
                        : "Déjà à jour.");
            }
            catch (Exception ex)
            {
                ToastExtensions.ShowError(page, ex.Message);
            }
        };
        page.ToolbarItems.Add(syncItem);

        var logoutItem = new ToolbarItem { IconImageSource = MakeToolbarIcon(BootstrapIcons.BoxArrowRight) };
        logoutItem.Clicked += async (_, _) =>
        {
            session.Clear();
            // Resolved via the app's DI container rather than threading a
            // SyncService dependency through all 16 call sites of this
            // method just for this one logout-only call.
            IPlatformApplication.Current?.Services.GetService<SyncService>()?.StopBackgroundSync();
            try
            {
                await Shell.Current.GoToAsync(AppShell.OnboardingRoute);
            }
            catch (Exception ex)
            {
                ToastExtensions.ShowError(page, ex.Message);
            }
        };
        page.ToolbarItems.Add(logoutItem);
    }
}
