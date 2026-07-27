using System.ComponentModel;

namespace PharmaStock.Desktop.Services;

/// <summary>XAML markup extension: {loc:Translate Key=Dashboard_Title}.
/// Returns a Binding to a LocalizedString proxy rather than a plain string,
/// so every label using it re-renders instantly when LocalizationService's
/// language changes — no page reload/navigation needed.</summary>
[ContentProperty(nameof(Key))]
public class TranslateExtension : IMarkupExtension<BindingBase>
{
    public string Key { get; set; } = string.Empty;

    public BindingBase ProvideValue(IServiceProvider serviceProvider) =>
        new Binding(nameof(LocalizedString.Value), source: new LocalizedString(Key));

    object IMarkupExtension.ProvideValue(IServiceProvider serviceProvider) => ProvideValue(serviceProvider);
}

public sealed class LocalizedString : INotifyPropertyChanged
{
    private readonly string _key;

    public LocalizedString(string key)
    {
        _key = key;
        LocalizationService.LanguageChanged += OnLanguageChanged;
    }

    public string Value => LocalizationService.Translate(_key);

    public event PropertyChangedEventHandler? PropertyChanged;

    private void OnLanguageChanged(object? sender, EventArgs e) =>
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(Value)));
}
