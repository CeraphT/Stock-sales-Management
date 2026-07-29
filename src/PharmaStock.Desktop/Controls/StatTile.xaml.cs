namespace PharmaStock.Desktop.Controls;

/// <summary>A dashboard stat tile: icon-in-a-soft-tint-circle badge, a big
/// colored number, and a caption — replaces the 8 near-identical hand-rolled
/// Card+Label blocks DashboardPage used to repeat, and gives every metric
/// its own accent color instead of only the negative ones (OutOfStock/
/// Expired) standing out. Tapped mirrors the one existing use case
/// (Archived tile navigates to ArchivedProductsPage) — a no-op if the
/// caller never subscribes.</summary>
public partial class StatTile : ContentView
{
    public static readonly BindableProperty IconGlyphProperty =
        BindableProperty.Create(nameof(IconGlyph), typeof(string), typeof(StatTile), string.Empty);

    public static readonly BindableProperty ValueProperty =
        BindableProperty.Create(nameof(Value), typeof(string), typeof(StatTile), string.Empty);

    public static readonly BindableProperty LabelProperty =
        BindableProperty.Create(nameof(Label), typeof(string), typeof(StatTile), string.Empty);

    public static readonly BindableProperty AccentColorProperty =
        BindableProperty.Create(nameof(AccentColor), typeof(Color), typeof(StatTile),
            Colors.Gray, propertyChanged: OnAccentChanged);

    public static readonly BindableProperty AccentSoftColorProperty =
        BindableProperty.Create(nameof(AccentSoftColor), typeof(Color), typeof(StatTile),
            Colors.LightGray, propertyChanged: OnAccentChanged);

    public string IconGlyph
    {
        get => (string)GetValue(IconGlyphProperty);
        set => SetValue(IconGlyphProperty, value);
    }

    public string Value
    {
        get => (string)GetValue(ValueProperty);
        set => SetValue(ValueProperty, value);
    }

    public string Label
    {
        get => (string)GetValue(LabelProperty);
        set => SetValue(LabelProperty, value);
    }

    public Color AccentColor
    {
        get => (Color)GetValue(AccentColorProperty);
        set => SetValue(AccentColorProperty, value);
    }

    public Color AccentSoftColor
    {
        get => (Color)GetValue(AccentSoftColorProperty);
        set => SetValue(AccentSoftColorProperty, value);
    }

    public event EventHandler? Tapped;

    public StatTile()
    {
        InitializeComponent();
        ApplyAccent();
    }

    private static void OnAccentChanged(BindableObject bindable, object oldValue, object newValue) =>
        ((StatTile)bindable).ApplyAccent();

    private void ApplyAccent()
    {
        IconBadge.BackgroundColor = AccentSoftColor;
        IconLabel.TextColor = AccentColor;
        ValueLabel.TextColor = AccentColor;
    }

    private void OnTapped(object? sender, TappedEventArgs e) => Tapped?.Invoke(this, EventArgs.Empty);
}
