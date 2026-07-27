using System.Windows.Input;

namespace PharmaStock.Desktop.Controls;

public enum IconButtonVariant { Primary, Secondary }

/// <summary>An icon glyph + translatable text button, used wherever a plain
/// Button needs both — MAUI's native Button renders Text in a single
/// FontFamily, so it can't mix a BootstrapIcons glyph with OpenSans label
/// text. Button isn't templatable either, so this is a ContentView wrapping
/// a Border + two Labels rather than a Style. Primary API is the Clicked
/// event (this codebase has zero MVVM Command bindings — every button uses
/// code-behind Clicked handlers); Command/CommandParameter are exposed too
/// for parity, at no extra cost.</summary>
public partial class IconButton : ContentView
{
    public static readonly BindableProperty IconProperty =
        BindableProperty.Create(nameof(Icon), typeof(string), typeof(IconButton), string.Empty);

    public static readonly BindableProperty TextProperty =
        BindableProperty.Create(nameof(Text), typeof(string), typeof(IconButton), string.Empty);

    public static readonly BindableProperty CommandProperty =
        BindableProperty.Create(nameof(Command), typeof(ICommand), typeof(IconButton));

    public static readonly BindableProperty CommandParameterProperty =
        BindableProperty.Create(nameof(CommandParameter), typeof(object), typeof(IconButton));

    public static readonly BindableProperty VariantProperty =
        BindableProperty.Create(nameof(Variant), typeof(IconButtonVariant), typeof(IconButton),
            IconButtonVariant.Primary, propertyChanged: OnVariantChanged);

    // Optional override for the rare case a call site needs a non-standard
    // color (e.g. a destructive/cancel action in ErrorColor) — mirrors
    // native Button.TextColor. Null (the default) means "use the Variant's
    // usual color", not "transparent".
    public static readonly BindableProperty TextColorOverrideProperty =
        BindableProperty.Create(nameof(TextColorOverride), typeof(Color), typeof(IconButton),
            null, propertyChanged: OnVariantChanged);

    public string Icon
    {
        get => (string)GetValue(IconProperty);
        set => SetValue(IconProperty, value);
    }

    public string Text
    {
        get => (string)GetValue(TextProperty);
        set => SetValue(TextProperty, value);
    }

    public ICommand? Command
    {
        get => (ICommand?)GetValue(CommandProperty);
        set => SetValue(CommandProperty, value);
    }

    public object? CommandParameter
    {
        get => GetValue(CommandParameterProperty);
        set => SetValue(CommandParameterProperty, value);
    }

    public IconButtonVariant Variant
    {
        get => (IconButtonVariant)GetValue(VariantProperty);
        set => SetValue(VariantProperty, value);
    }

    public Color? TextColorOverride
    {
        get => (Color?)GetValue(TextColorOverrideProperty);
        set => SetValue(TextColorOverrideProperty, value);
    }

    public event EventHandler? Clicked;

    public IconButton()
    {
        InitializeComponent();
        ApplyVariant();
    }

    private static void OnVariantChanged(BindableObject bindable, object oldValue, object newValue) =>
        ((IconButton)bindable).ApplyVariant();

    private void ApplyVariant()
    {
        var isPrimary = Variant == IconButtonVariant.Primary;
        // Same resource-lookup pattern used elsewhere in this codebase
        // (ThemeService/PageHeaderExtensions) rather than duplicating the
        // Border styling inline — looks up the app-level merged
        // ResourceDictionary entries added in Styles.xaml.
        if (Application.Current!.Resources.TryGetValue(
                isPrimary ? "IconButtonPrimaryBorder" : "IconButtonSecondaryBorder", out var style))
            ButtonBorder.Style = (Style)style;

        if (TextColorOverride is Color overrideColor)
        {
            IconLabel.TextColor = overrideColor;
            TextLabel.TextColor = overrideColor;
            return;
        }

        var textColorLight = (Color)Application.Current!.Resources[isPrimary ? "White" : "Primary"];
        var textColorDark = (Color)Application.Current!.Resources[isPrimary ? "PrimaryDarkText" : "PrimaryDark"];
        IconLabel.SetAppThemeColor(Label.TextColorProperty, textColorLight, textColorDark);
        TextLabel.SetAppThemeColor(Label.TextColorProperty, textColorLight, textColorDark);
    }

    // ContentView doesn't get the native Button style's Disabled VisualState
    // for free, so dim it manually to match.
    protected override void OnPropertyChanged(string? propertyName = null)
    {
        base.OnPropertyChanged(propertyName);
        if (propertyName == nameof(IsEnabled))
            ButtonBorder.Opacity = IsEnabled ? 1.0 : 0.5;
    }

    private void OnTapped(object? sender, TappedEventArgs e)
    {
        if (!IsEnabled) return;

        if (Command?.CanExecute(CommandParameter) == true)
            Command.Execute(CommandParameter);

        Clicked?.Invoke(this, EventArgs.Empty);
    }
}
