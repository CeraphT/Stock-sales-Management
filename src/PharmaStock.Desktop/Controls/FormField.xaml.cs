namespace PharmaStock.Desktop.Controls;

/// <summary>A labeled text input (label above a bordered entry). Pulled out
/// once the same label+border+entry structure started repeating across
/// every onboarding/auth form — not speculative, just de-duplicating what
/// was already identical in 3+ places.</summary>
public partial class FormField : ContentView
{
    public static readonly BindableProperty LabelProperty =
        BindableProperty.Create(nameof(Label), typeof(string), typeof(FormField), string.Empty);

    public static readonly BindableProperty PlaceholderProperty =
        BindableProperty.Create(nameof(Placeholder), typeof(string), typeof(FormField), string.Empty);

    public static readonly BindableProperty IsPasswordProperty =
        BindableProperty.Create(nameof(IsPassword), typeof(bool), typeof(FormField), false);

    public static readonly BindableProperty KeyboardProperty =
        BindableProperty.Create(nameof(Keyboard), typeof(Keyboard), typeof(FormField), Keyboard.Default);

    public static readonly BindableProperty TextProperty =
        BindableProperty.Create(nameof(Text), typeof(string), typeof(FormField), string.Empty, BindingMode.TwoWay);

    public string Label
    {
        get => (string)GetValue(LabelProperty);
        set => SetValue(LabelProperty, value);
    }

    public string Placeholder
    {
        get => (string)GetValue(PlaceholderProperty);
        set => SetValue(PlaceholderProperty, value);
    }

    public bool IsPassword
    {
        get => (bool)GetValue(IsPasswordProperty);
        set => SetValue(IsPasswordProperty, value);
    }

    public Keyboard Keyboard
    {
        get => (Keyboard)GetValue(KeyboardProperty);
        set => SetValue(KeyboardProperty, value);
    }

    public string Text
    {
        get => (string)GetValue(TextProperty);
        set => SetValue(TextProperty, value);
    }

    public FormField()
    {
        InitializeComponent();
    }

    // The 👁/🙈 toggle only ever flips EntryControl.IsPassword directly —
    // it never touches the Root.IsPassword bindable property, which stays
    // fixed as "this field is a password field" (drives the toggle's own
    // visibility) rather than "currently masked".
    private void OnToggleVisibilityTapped(object? sender, TappedEventArgs e)
    {
        EntryControl.IsPassword = !EntryControl.IsPassword;
        ToggleVisibilityLabel.Text = EntryControl.IsPassword ? Services.BootstrapIcons.Eye : Services.BootstrapIcons.EyeSlash;
    }
}
