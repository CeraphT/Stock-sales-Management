using System.Globalization;
using System.Text;
using Microsoft.Maui.ApplicationModel.DataTransfer;
using PharmaStock.Desktop.Controls;
using PharmaStock.Desktop.Services;
using PharmaStock.Domain.Models;

namespace PharmaStock.Desktop.Views;

[QueryProperty(nameof(PurchaseOrderId), "purchaseOrderId")]
public partial class PurchaseOrderDetailPage : ContentPage
{
    private readonly PharmaStockApiClient _api;
    private readonly SessionService _session;
    private readonly ReceivePurchaseOrderLinePage _receiveLinePage;

    private Guid? _purchaseOrderId;
    private PurchaseOrderDetailResponse? _lastOrder;
    private string? _currency;

    public string? PurchaseOrderId
    {
        get => _purchaseOrderId?.ToString();
        set => _purchaseOrderId = Guid.TryParse(value, out var id) ? id : null;
    }

    public PurchaseOrderDetailPage(PharmaStockApiClient api, SessionService session, ReceivePurchaseOrderLinePage receiveLinePage, ThemeService themeService)
    {
        InitializeComponent();
        _api = api;
        _session = session;
        _receiveLinePage = receiveLinePage;
        this.AttachStandardHeader(themeService, session);
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        try
        {
            await LoadAsync();
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    private async Task LoadAsync()
    {
        if (_purchaseOrderId is null) return;

        ContentScroll.IsVisible = false;
        LoadingSpinner.IsVisible = true;
        LoadingSpinner.IsRunning = true;
        try
        {
            var companyId = _session.CompanyId!.Value;
            if (_currency is null)
            {
                var company = await _api.GetCompanyAsync(companyId);
                _currency = company.Currency;
            }
            var order = await _api.GetPurchaseOrderDetailAsync(companyId, _purchaseOrderId.Value);
            Render(order);
        }
        finally
        {
            LoadingSpinner.IsRunning = false;
            LoadingSpinner.IsVisible = false;
            ContentScroll.IsVisible = true;
        }
    }

    private void Render(PurchaseOrderDetailResponse order)
    {
        _lastOrder = order;
        SupplierLabel.Text = order.SupplierName;
        HeaderSubtitleLabel.Text = LocalizationService.Translate(
            "PurchaseOrder_HeaderSubtitle", order.CreatedAt.ToLocalTime().ToString("dd/MM/yyyy HH:mm", CultureInfo.InvariantCulture), order.LocationName);
        StatusLabel.Text = LocalizationService.TranslatePurchaseOrderStatus(order.Status);
        StatusLabel.TextColor = order.Status == PurchaseOrderStatus.Cancelled
            ? (Color)Application.Current!.Resources["ErrorColor"]
            : (Color)Application.Current!.Resources["Primary"];

        NotesLabel.IsVisible = !string.IsNullOrWhiteSpace(order.Notes);
        NotesLabel.Text = order.Notes;

        var canReceiveOrder = order.Status is PurchaseOrderStatus.Pending or PurchaseOrderStatus.PartiallyReceived;
        LinesView.ItemsSource = order.Lines.Select(l => new LineRow(order.Id, l, canReceiveOrder, _currency)).ToList();

        CancelOrderButton.IsVisible = order.Status == PurchaseOrderStatus.Pending;
    }

    private async void OnReceiveLineClicked(object? sender, EventArgs e)
    {
        if ((sender as IconButton)?.CommandParameter is not LineRow row) return;

        try
        {
            var receiveTask = _receiveLinePage.ReceiveAsync(row.PurchaseOrderId, row.Line);
            await Navigation.PushModalAsync(_receiveLinePage);
            var received = await receiveTask;
            if (received)
                await LoadAsync();
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    private async void OnShareClicked(object? sender, EventArgs e)
    {
        if (_lastOrder is null) return;

        try
        {
            await Share.Default.RequestAsync(new ShareTextRequest
            {
                Title = LocalizationService.Translate("PurchaseOrder_Share"),
                Text = BuildShareText(_lastOrder, _currency),
            });
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    // Plain text rather than a PDF/CSV attachment — this goes straight into
    // whatever the cashier already uses to reach the supplier (WhatsApp, SMS),
    // via the OS share sheet, at zero cost (no SMS gateway integration).
    private static string BuildShareText(PurchaseOrderDetailResponse order, string? currency)
    {
        var sb = new StringBuilder();
        sb.AppendLine(LocalizationService.Translate("PurchaseOrder_ShareHeader", order.SupplierName));
        sb.AppendLine(LocalizationService.Translate("PurchaseOrder_ShareDate", order.CreatedAt.ToLocalTime().ToString("dd/MM/yyyy HH:mm", CultureInfo.InvariantCulture)));
        sb.AppendLine();

        foreach (var line in order.Lines)
        {
            sb.AppendLine(LocalizationService.Translate(
                "PurchaseOrder_ShareLine", line.ProductName, line.QuantityOrdered, MoneyFormatter.Format(line.UnitCost, currency)));
        }

        sb.AppendLine();
        var total = order.Lines.Sum(l => l.QuantityOrdered * l.UnitCost);
        sb.AppendLine(LocalizationService.Translate("PurchaseOrder_ShareTotal", MoneyFormatter.Format(total, currency)));

        if (!string.IsNullOrWhiteSpace(order.Notes))
        {
            sb.AppendLine();
            sb.AppendLine(LocalizationService.Translate("PurchaseOrder_ShareNotes", order.Notes));
        }

        return sb.ToString();
    }

    private async void OnCancelOrderClicked(object? sender, EventArgs e)
    {
        if (_purchaseOrderId is null) return;

        var confirmed = await this.DisplayAlertAsync(LocalizationService.Translate("PurchaseOrder_CancelTitle"),
            LocalizationService.Translate("PurchaseOrder_CancelMessage"),
            LocalizationService.Translate("PurchaseOrder_CancelConfirm"), LocalizationService.Translate("Common_Cancel"));
        if (!confirmed) return;

        try
        {
            var companyId = _session.CompanyId!.Value;
            await _api.CancelPurchaseOrderAsync(companyId, _purchaseOrderId.Value);
            await LoadAsync();
        }
        catch (PharmaStockApiException ex)
        {
            this.ShowError(ex.Message);
        }
        catch (Exception ex)
        {
            this.ShowError(ex.Message);
        }
    }

    private sealed class LineRow
    {
        public Guid PurchaseOrderId { get; }
        public PurchaseOrderLineResponse Line { get; }
        public string ProductName => Line.ProductName;
        public string SubtitleText { get; }
        public bool CanReceive { get; }

        public LineRow(Guid purchaseOrderId, PurchaseOrderLineResponse line, bool orderReceivable, string? currency)
        {
            PurchaseOrderId = purchaseOrderId;
            Line = line;
            SubtitleText = LocalizationService.Translate(
                "PurchaseOrder_LineSubtitle", line.QuantityReceived, line.QuantityOrdered, MoneyFormatter.Format(line.UnitCost, currency));
            CanReceive = orderReceivable && line.QuantityReceived < line.QuantityOrdered;
        }
    }
}
