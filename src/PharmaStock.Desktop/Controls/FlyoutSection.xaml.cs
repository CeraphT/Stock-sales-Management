using PharmaStock.Desktop.Services;

namespace PharmaStock.Desktop.Controls;

/// <summary>A collapsible flyout-menu group: a tappable icon+title header
/// row that expands/collapses a body of nav rows. Follows
/// CollapsibleSearchBar's plain-IsVisible-toggle idiom (no
/// VisualStateManager, no animation APIs) rather than introducing a new
/// interaction pattern for this one control.</summary>
public partial class FlyoutSection : ContentView
{
    public static readonly BindableProperty IconProperty =
        BindableProperty.Create(nameof(Icon), typeof(string), typeof(FlyoutSection), string.Empty);

    public static readonly BindableProperty TitleProperty =
        BindableProperty.Create(nameof(Title), typeof(string), typeof(FlyoutSection), string.Empty);

    public static readonly BindableProperty IsExpandedProperty =
        BindableProperty.Create(nameof(IsExpanded), typeof(bool), typeof(FlyoutSection), false,
            propertyChanged: OnIsExpandedChanged);

    public string Icon
    {
        get => (string)GetValue(IconProperty);
        set => SetValue(IconProperty, value);
    }

    public string Title
    {
        get => (string)GetValue(TitleProperty);
        set => SetValue(TitleProperty, value);
    }

    public bool IsExpanded
    {
        get => (bool)GetValue(IsExpandedProperty);
        set => SetValue(IsExpandedProperty, value);
    }

    public FlyoutSection()
    {
        InitializeComponent();
        UpdateExpandedVisual();
    }

    /// <summary>Appends one nav row to this section's collapsible body —
    /// called from AppShell.xaml.cs while it builds the flyout content in
    /// code-behind, rather than exposing the internal Body field directly.</summary>
    public void AddRow(View row) => Body.Children.Add(row);

    private static void OnIsExpandedChanged(BindableObject bindable, object oldValue, object newValue) =>
        ((FlyoutSection)bindable).UpdateExpandedVisual();

    private void UpdateExpandedVisual()
    {
        Body.IsVisible = IsExpanded;
        ChevronLabel.Text = IsExpanded ? BootstrapIcons.ChevronDown : BootstrapIcons.ChevronRight;
    }

    private void OnHeaderTapped(object? sender, TappedEventArgs e) => IsExpanded = !IsExpanded;
}
