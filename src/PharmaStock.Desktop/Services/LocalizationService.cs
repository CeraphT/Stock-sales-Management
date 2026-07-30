using PharmaStock.Domain.Models;

namespace PharmaStock.Desktop.Services;

/// <summary>Two-language (fr/en) app-wide translation lookup, mirroring
/// ThemeService's pattern: current choice persisted via plain MAUI
/// Preferences (Section 21.5 already anticipated this per-user via
/// User.PreferredLanguage on the server, but wiring that up is future work —
/// this is device-local for now, exactly like the theme toggle).
///
/// Uses WeakEventManager (not a plain C# event) for LanguageChanged so every
/// LocalizedString created by TranslateExtension across every page visit
/// doesn't leak — pages are mostly registered AddTransient in MauiProgram,
/// so a naive event subscription would pin every past page instance in
/// memory for the lifetime of the app.</summary>
public static class LocalizationService
{
    private const string LanguageKey = "app_language";
    private static readonly WeakEventManager EventManager = new();

    public static event EventHandler LanguageChanged
    {
        add => EventManager.AddEventHandler(value);
        remove => EventManager.RemoveEventHandler(value);
    }

    public static string CurrentLanguage
    {
        get => Preferences.Default.Get(LanguageKey, "fr");
        set
        {
            if (value == CurrentLanguage) return;
            Preferences.Default.Set(LanguageKey, value);
            EventManager.HandleEvent(null!, EventArgs.Empty, nameof(LanguageChanged));
        }
    }

    public static bool IsEnglish => CurrentLanguage == "en";

    public static void Toggle() => CurrentLanguage = IsEnglish ? "fr" : "en";

    // Missing keys resolve to the key itself (loudly visible in the UI)
    // rather than an empty string, so a forgotten translation is obvious
    // during development instead of silently blank.
    public static string Translate(string key)
    {
        if (!AppStrings.Map.TryGetValue(key, out var pair))
            return key;
        return IsEnglish ? pair.En : pair.Fr;
    }

    // For code-behind strings that need a runtime value spliced in (e.g.
    // "Archiver « {0} » ?") — string.Format over the translated template.
    public static string Translate(string key, params object[] args) =>
        string.Format(Translate(key), args);

    // Was duplicated across DashboardPage/SalesHistoryPage/PosPage/SaleDetailPage
    // before localization — consolidated here so each payment method is
    // translated in exactly one place instead of four.
    public static string TranslatePaymentMethod(PaymentMethod method) => method switch
    {
        PaymentMethod.Cash => Translate("PaymentMethod_Cash"),
        PaymentMethod.MobileMoney => Translate("PaymentMethod_MobileMoney"),
        PaymentMethod.Credit => Translate("PaymentMethod_Credit"),
        PaymentMethod.StoreCredit => Translate("PaymentMethod_StoreCredit"),
        PaymentMethod.GiftCard => Translate("PaymentMethod_GiftCard"),
        PaymentMethod.Split => Translate("PaymentMethod_Split"),
        _ => method.ToString()
    };

    // A distinct color per payment method — used as a leading accent bar on
    // Sales History rows and a badge on the receipt (SaleDetailPage), so a
    // credit sale (say) is visually scannable without reading the subtitle.
    public static Color PaymentMethodColor(PaymentMethod method) => (Color)Application.Current!.Resources[method switch
    {
        PaymentMethod.Cash => "SuccessColor",
        PaymentMethod.MobileMoney => "AccentBlue",
        PaymentMethod.Credit => "AccentAmber",
        PaymentMethod.StoreCredit => "AccentPurple",
        PaymentMethod.GiftCard => "AccentOrange",
        _ => "Gray400",
    }];

    // UserRole is persisted as its raw enum ToString() (see SessionService.Save).
    public static string TranslateRole(string? role) => role switch
    {
        "Cashier" => Translate("Role_Cashier"),
        "CompanyAdmin" => Translate("Role_CompanyAdmin"),
        "SuperAdmin" => Translate("Role_SuperAdmin"),
        _ => role ?? string.Empty
    };

    public static string TranslatePurchaseOrderStatus(PurchaseOrderStatus status) => status switch
    {
        PurchaseOrderStatus.Pending => Translate("PurchaseOrder_StatusPending"),
        PurchaseOrderStatus.PartiallyReceived => Translate("PurchaseOrder_StatusPartial"),
        PurchaseOrderStatus.Received => Translate("PurchaseOrder_StatusReceived"),
        PurchaseOrderStatus.Cancelled => Translate("PurchaseOrder_StatusCancelled"),
        _ => status.ToString()
    };
}
