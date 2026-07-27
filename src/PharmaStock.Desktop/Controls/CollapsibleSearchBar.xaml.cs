namespace PharmaStock.Desktop.Controls;

/// <summary>Wraps a native SearchBar so pages default to a small search icon
/// instead of a persistent full-width bar, while keeping their existing
/// live-filter-as-you-type wiring unchanged: Text and TextChanged mirror
/// SearchBar's own API exactly, so callers don't need any code-behind changes.</summary>
public partial class CollapsibleSearchBar : ContentView
{
    public static readonly BindableProperty PlaceholderProperty =
        BindableProperty.Create(nameof(Placeholder), typeof(string), typeof(CollapsibleSearchBar), string.Empty);

    public static readonly BindableProperty TextProperty =
        BindableProperty.Create(nameof(Text), typeof(string), typeof(CollapsibleSearchBar), string.Empty, BindingMode.TwoWay);

    public string Placeholder
    {
        get => (string)GetValue(PlaceholderProperty);
        set => SetValue(PlaceholderProperty, value);
    }

    public string Text
    {
        get => (string)GetValue(TextProperty);
        set => SetValue(TextProperty, value);
    }

    public event EventHandler<TextChangedEventArgs>? TextChanged;

    public CollapsibleSearchBar()
    {
        InitializeComponent();
    }

    private void OnExpandClicked(object? sender, EventArgs e)
    {
        IconButton.IsVisible = false;
        ExpandedRow.IsVisible = true;
        InnerSearchBar.Focus();
    }

    private void OnCollapseClicked(object? sender, EventArgs e)
    {
        InnerSearchBar.Text = string.Empty;
        ExpandedRow.IsVisible = false;
        IconButton.IsVisible = true;
    }

    private void OnInnerTextChanged(object? sender, TextChangedEventArgs e) => TextChanged?.Invoke(this, e);
}
