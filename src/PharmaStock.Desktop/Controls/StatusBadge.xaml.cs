namespace PharmaStock.Desktop.Controls;

/// <summary>A small colored pill showing a status label (e.g. "En stock",
/// "Rupture") — the badge shape previously duplicated inline as a Border +
/// Label in PosPage's search results and ProductCatalogPage's product
/// cards. Color is caller-supplied (usually SuccessColor/AccentAmber/
/// ErrorColor via a StatusColor property on the bound row) rather than an
/// enum here, since the exact status vocabulary differs per screen.</summary>
public partial class StatusBadge : ContentView
{
    public static readonly BindableProperty TextProperty =
        BindableProperty.Create(nameof(Text), typeof(string), typeof(StatusBadge), string.Empty);

    public static readonly BindableProperty ColorProperty =
        BindableProperty.Create(nameof(Color), typeof(Color), typeof(StatusBadge),
            Colors.Gray, propertyChanged: OnColorChanged);

    public string Text
    {
        get => (string)GetValue(TextProperty);
        set => SetValue(TextProperty, value);
    }

    public Color Color
    {
        get => (Color)GetValue(ColorProperty);
        set => SetValue(ColorProperty, value);
    }

    public StatusBadge()
    {
        InitializeComponent();
        ApplyColor();
    }

    private static void OnColorChanged(BindableObject bindable, object oldValue, object newValue) =>
        ((StatusBadge)bindable).ApplyColor();

    private void ApplyColor() => PillBorder.BackgroundColor = Color;
}
