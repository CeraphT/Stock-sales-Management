using PharmaStock.Desktop.Controls;

namespace PharmaStock.Desktop.Services;

/// <summary>Shows a bottom toast on any page without requiring the page to
/// declare a Toast control in its own XAML. On first use, wraps the page's
/// existing Content in a plain Grid (no RowDefinitions/ColumnDefinitions —
/// children simply stack in z-order in the single implicit cell) and
/// overlays a Toast as the last child; later calls on the same page reuse
/// that same Toast instance instead of re-wrapping.</summary>
public static class ToastExtensions
{
    public static void ShowError(this ContentPage page, string message) => Show(page, message, isError: true);

    public static void ShowSuccess(this ContentPage page, string message) => Show(page, message, isError: false);

    private static void Show(ContentPage page, string message, bool isError)
    {
        var toast = EnsureToastOverlay(page);
        toast.Show(message, isError);
    }

    private static Toast EnsureToastOverlay(ContentPage page)
    {
        if (page.Content is Grid grid)
        {
            var existing = grid.Children.OfType<Toast>().FirstOrDefault();
            if (existing is not null) return existing;

            var toast = new Toast();
            grid.Children.Add(toast);
            return toast;
        }

        var original = page.Content;
        var newGrid = new Grid();
        newGrid.Children.Add(original);
        var newToast = new Toast();
        newGrid.Children.Add(newToast);
        page.Content = newGrid;
        return newToast;
    }
}
