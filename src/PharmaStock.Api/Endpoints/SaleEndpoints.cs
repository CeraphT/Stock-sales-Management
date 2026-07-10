using Microsoft.EntityFrameworkCore;
using PharmaStock.Api.Auth;
using PharmaStock.Domain.Entities;
using PharmaStock.Domain.Enums;
using PharmaStock.Infrastructure.Data;
using PharmaStock.Infrastructure.Stock;

namespace PharmaStock.Api.Endpoints;

public record SaleLineRequest(Guid ProductId, int Quantity, Guid? PackagingLevelId);
public record ServiceLineRequest(Guid ServiceId, int Quantity);
public record PaymentSplitRequest(PaymentMethod Method, decimal Amount);

public record CreateSaleRequest(
    Guid? CustomerId,
    PaymentMethod PaymentMethod,
    List<SaleLineRequest>? ProductLines,
    List<ServiceLineRequest>? ServiceLines,
    List<PaymentSplitRequest>? PaymentSplits);

public record SaleLineResponse(
    Guid ProductId, string ProductName, Guid? BatchId, string? BatchNumber,
    int QuantityInBaseUnits, string? PackagingLevelName, decimal UnitPrice, decimal LineTotal);
public record ServiceLineResponse(Guid ServiceId, string ServiceName, int Quantity, decimal BilledPrice, decimal LineTotal);
public record PaymentSplitResponse(PaymentMethod Method, decimal Amount);

public record SaleResponse(
    Guid Id, decimal Total, PaymentMethod PaymentMethod, SaleStatus Status, DateTime Timestamp,
    IEnumerable<SaleLineResponse> ProductLines,
    IEnumerable<ServiceLineResponse> ServiceLines,
    IEnumerable<PaymentSplitResponse> PaymentSplits);

public static class SaleEndpoints
{
    // Payment methods that settle immediately at sale time. Credit is handled
    // separately (adds to Customer.CreditBalance); GiftCard/StoreCredit need
    // balance-redemption logic this endpoint does not implement yet — rejected
    // explicitly rather than silently accepted, since silently accepting would
    // record revenue that was never actually collected.
    private static readonly HashSet<PaymentMethod> UnsupportedPaymentMethods = new()
    {
        PaymentMethod.GiftCard, PaymentMethod.StoreCredit
    };

    public static void MapSaleEndpoints(this WebApplication app)
    {
        app.MapPost("/api/companies/{companyId:guid}/sales", async (
            Guid companyId, CreateSaleRequest request, PharmaStockDbContext db,
            StockDeductionService deductor, HttpContext http) =>
        {
            var callerCompanyId = http.User.GetCompanyId();
            var callerUserId = http.User.GetUserId();
            if (callerCompanyId != companyId || callerUserId is null)
                return Results.Forbid();

            var productLines = request.ProductLines ?? new List<SaleLineRequest>();
            var serviceLines = request.ServiceLines ?? new List<ServiceLineRequest>();
            if (productLines.Count == 0 && serviceLines.Count == 0)
                return Results.BadRequest(new { message = "A sale must have at least one product or service line." });
            if (productLines.Any(l => l.Quantity <= 0) || serviceLines.Any(l => l.Quantity <= 0))
                return Results.BadRequest(new { message = "Line quantities must be positive." });

            var company = await db.Companies.FindAsync(companyId);
            if (company is null)
                return Results.NotFound(new { message = "Company not found." });
            if (serviceLines.Count > 0 && !company.ServicesModuleEnabled)
                return Results.BadRequest(new { message = "The services module is not enabled for this company." });

            var requestedMethods = (request.PaymentSplits?.Select(s => s.Method) ?? Enumerable.Empty<PaymentMethod>())
                .Append(request.PaymentMethod);
            if (requestedMethods.Any(UnsupportedPaymentMethods.Contains))
                return Results.BadRequest(new { message = "GiftCard/StoreCredit payment is not supported yet." });

            if (request.CustomerId.HasValue)
            {
                var customerExists = await db.Customers.AnyAsync(c => c.Id == request.CustomerId && c.CompanyId == companyId);
                if (!customerExists)
                    return Results.NotFound(new { message = "Customer not found." });
            }

            await using var transaction = await db.Database.BeginTransactionAsync();

            var sale = new Sale
            {
                CompanyId = companyId,
                UserId = callerUserId.Value,
                CustomerId = request.CustomerId,
                PaymentMethod = request.PaymentMethod,
            };

            var saleLineResponses = new List<SaleLineResponse>();
            var serviceLineResponses = new List<ServiceLineResponse>();

            try
            {
                foreach (var line in productLines)
                {
                    var product = await db.Products
                        .Include(p => p.PackagingLevels)
                        .FirstOrDefaultAsync(p => p.Id == line.ProductId && p.CompanyId == companyId);
                    if (product is null)
                        return Results.NotFound(new { message = $"Product {line.ProductId} not found." });

                    ProductPackagingLevel? level = null;
                    if (line.PackagingLevelId.HasValue)
                    {
                        level = product.PackagingLevels.FirstOrDefault(l => l.Id == line.PackagingLevelId);
                        if (level is null)
                            return Results.BadRequest(new { message = $"Packaging level {line.PackagingLevelId} does not belong to product {product.Id}." });
                    }

                    var unitsPerRequestedQuantity = level?.QuantityInBaseUnits ?? 1;
                    var quantityInBaseUnits = line.Quantity * unitsPerRequestedQuantity;

                    // Price expressed per base unit regardless of packaging level, so
                    // LineTotal is always QuantityInBaseUnits * UnitPrice: a level's
                    // override (or the product's default) is divided across the
                    // base units it contains.
                    var unitPrice = level is null
                        ? product.SalePrice
                        : (level.SalePriceOverride ?? product.SalePrice * level.QuantityInBaseUnits) / level.QuantityInBaseUnits;

                    List<StockDeductionResult> deductions;
                    try
                    {
                        deductions = await deductor.DeductFefoAsync(product.Id, quantityInBaseUnits);
                    }
                    catch (InsufficientStockException ex)
                    {
                        await transaction.RollbackAsync();
                        return Results.Conflict(new
                        {
                            message = $"Insufficient stock for '{product.Name}': requested {ex.Requested} base units, {ex.Available} available."
                        });
                    }

                    foreach (var deduction in deductions)
                    {
                        db.StockMovements.Add(new StockMovement
                        {
                            ProductId = product.Id,
                            BatchId = deduction.BatchId,
                            Type = StockMovementType.Sale,
                            QuantityInBaseUnits = -deduction.QuantityInBaseUnits,
                            UserId = callerUserId.Value,
                        });

                        var batch = await db.Batches.FindAsync(deduction.BatchId);
                        sale.ProductLines.Add(new SaleLine
                        {
                            ProductId = product.Id,
                            BatchId = deduction.BatchId,
                            QuantityInBaseUnits = deduction.QuantityInBaseUnits,
                            PackagingLevelId = level?.Id,
                            UnitPrice = unitPrice,
                        });

                        saleLineResponses.Add(new SaleLineResponse(
                            product.Id, product.Name, deduction.BatchId, batch?.BatchNumber,
                            deduction.QuantityInBaseUnits, level?.UnitName, unitPrice,
                            unitPrice * deduction.QuantityInBaseUnits));
                    }
                }

                foreach (var line in serviceLines)
                {
                    var service = await db.Services
                        .Include(s => s.StockLinks)
                        .FirstOrDefaultAsync(s => s.Id == line.ServiceId && s.CompanyId == companyId && s.Active);
                    if (service is null)
                        return Results.NotFound(new { message = $"Service {line.ServiceId} not found." });

                    foreach (var stockLink in service.StockLinks)
                    {
                        var totalConsumed = stockLink.QuantityConsumedInBaseUnits * line.Quantity;
                        List<StockDeductionResult> deductions;
                        try
                        {
                            deductions = await deductor.DeductFefoAsync(stockLink.ProductId, totalConsumed);
                        }
                        catch (InsufficientStockException ex)
                        {
                            await transaction.RollbackAsync();
                            return Results.Conflict(new
                            {
                                message = $"Insufficient stock to fulfil service '{service.Name}': " +
                                    $"requested {ex.Requested} base units, {ex.Available} available."
                            });
                        }

                        foreach (var deduction in deductions)
                        {
                            db.StockMovements.Add(new StockMovement
                            {
                                ProductId = stockLink.ProductId,
                                BatchId = deduction.BatchId,
                                Type = StockMovementType.ServiceConsumption,
                                QuantityInBaseUnits = -deduction.QuantityInBaseUnits,
                                UserId = callerUserId.Value,
                            });
                        }
                    }

                    sale.ServiceLines.Add(new ServiceLine
                    {
                        ServiceId = service.Id,
                        BilledPrice = service.FixedPrice,
                        Quantity = line.Quantity,
                    });
                    serviceLineResponses.Add(new ServiceLineResponse(
                        service.Id, service.Name, line.Quantity, service.FixedPrice, service.FixedPrice * line.Quantity));
                }

                sale.Total = saleLineResponses.Sum(l => l.LineTotal) + serviceLineResponses.Sum(l => l.LineTotal);

                var paymentSplitResponses = new List<PaymentSplitResponse>();
                if (request.PaymentSplits is { Count: > 0 })
                {
                    var splitTotal = request.PaymentSplits.Sum(s => s.Amount);
                    if (splitTotal != sale.Total)
                    {
                        await transaction.RollbackAsync();
                        return Results.BadRequest(new
                        {
                            message = $"Payment splits total {splitTotal.ToString(System.Globalization.CultureInfo.InvariantCulture)} " +
                                $"does not match sale total {sale.Total.ToString(System.Globalization.CultureInfo.InvariantCulture)}."
                        });
                    }

                    sale.PaymentMethod = PaymentMethod.Split;
                    foreach (var split in request.PaymentSplits)
                    {
                        sale.PaymentSplits.Add(new PaymentSplit { Method = split.Method, Amount = split.Amount });
                        paymentSplitResponses.Add(new PaymentSplitResponse(split.Method, split.Amount));
                    }
                }

                // Section 3.5 — a Credit sale (whole or split) increases the
                // customer's running debt; it is not itself a stock or cash movement.
                var creditAmount = request.PaymentSplits is { Count: > 0 }
                    ? request.PaymentSplits.Where(s => s.Method == PaymentMethod.Credit).Sum(s => s.Amount)
                    : (request.PaymentMethod == PaymentMethod.Credit ? sale.Total : 0m);
                if (creditAmount > 0)
                {
                    if (request.CustomerId is null)
                    {
                        await transaction.RollbackAsync();
                        return Results.BadRequest(new { message = "A credit sale requires a customer." });
                    }
                    var customer = await db.Customers.FindAsync(request.CustomerId.Value);
                    customer!.CreditBalance += creditAmount;
                }

                db.Sales.Add(sale);
                await db.SaveChangesAsync();
                await transaction.CommitAsync();

                return Results.Created($"/api/companies/{companyId}/sales/{sale.Id}", new SaleResponse(
                    sale.Id, sale.Total, sale.PaymentMethod, sale.Status, sale.Timestamp,
                    saleLineResponses, serviceLineResponses, paymentSplitResponses));
            }
            catch
            {
                await transaction.RollbackAsync();
                throw;
            }
        }).RequireAuthorization();
    }
}
