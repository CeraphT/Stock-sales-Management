using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PharmaStock.Desktop.Data.SqliteMigrations
{
    /// <inheritdoc />
    public partial class InitialCreateSqlite : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Companies",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", nullable: false),
                    Description = table.Column<string>(type: "TEXT", nullable: true),
                    LogoUrl = table.Column<string>(type: "TEXT", nullable: true),
                    UniqueCode = table.Column<string>(type: "TEXT", nullable: false),
                    Currency = table.Column<string>(type: "TEXT", nullable: false),
                    DefaultTaxRatePercent = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: false),
                    ThemeConfigJson = table.Column<string>(type: "TEXT", nullable: true),
                    ServicesModuleEnabled = table.Column<bool>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Companies", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Categories",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    CompanyId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Categories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Categories_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Customers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    CompanyId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", nullable: false),
                    Phone = table.Column<string>(type: "TEXT", nullable: true),
                    CreditBalance = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Customers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Customers_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CustomFieldDefinitions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    CompanyId = table.Column<Guid>(type: "TEXT", nullable: false),
                    EntityType = table.Column<int>(type: "INTEGER", nullable: false),
                    FieldName = table.Column<string>(type: "TEXT", nullable: false),
                    FieldType = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CustomFieldDefinitions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CustomFieldDefinitions_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "GiftCards",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    CompanyId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Code = table.Column<string>(type: "TEXT", nullable: false),
                    InitialValue = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: false),
                    RemainingValue = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: false),
                    Active = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GiftCards", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GiftCards_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Locations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    CompanyId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", nullable: false),
                    Address = table.Column<string>(type: "TEXT", nullable: true),
                    Active = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Locations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Locations_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Services",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    CompanyId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", nullable: false),
                    FixedPrice = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: false),
                    Category = table.Column<string>(type: "TEXT", nullable: true),
                    Active = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Services", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Services_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Suppliers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    CompanyId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", nullable: false),
                    ContactPhone = table.Column<string>(type: "TEXT", nullable: true),
                    ContactEmail = table.Column<string>(type: "TEXT", nullable: true),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Suppliers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Suppliers_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Users",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    CompanyId = table.Column<Guid>(type: "TEXT", nullable: true),
                    Name = table.Column<string>(type: "TEXT", nullable: false),
                    Phone = table.Column<string>(type: "TEXT", nullable: false),
                    Role = table.Column<int>(type: "INTEGER", nullable: false),
                    PasswordHash = table.Column<string>(type: "TEXT", nullable: false),
                    PreferredLanguage = table.Column<string>(type: "TEXT", nullable: false),
                    TwoFactorTotpSecret = table.Column<string>(type: "TEXT", nullable: true),
                    TwoFactorEnabled = table.Column<bool>(type: "INTEGER", nullable: false),
                    Active = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Users", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Users_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "LoyaltyAccounts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    CustomerId = table.Column<Guid>(type: "TEXT", nullable: false),
                    PointsBalance = table.Column<int>(type: "INTEGER", nullable: false),
                    StoreCreditBalance = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LoyaltyAccounts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_LoyaltyAccounts_Customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "Customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CustomFieldValues",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    CustomFieldDefinitionId = table.Column<Guid>(type: "TEXT", nullable: false),
                    EntityId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Value = table.Column<string>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CustomFieldValues", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CustomFieldValues_CustomFieldDefinitions_CustomFieldDefinitionId",
                        column: x => x.CustomFieldDefinitionId,
                        principalTable: "CustomFieldDefinitions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Products",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    CompanyId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", nullable: false),
                    Barcode = table.Column<string>(type: "TEXT", nullable: true),
                    CategoryId = table.Column<Guid>(type: "TEXT", nullable: true),
                    PurchasePrice = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: false),
                    SalePrice = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: false),
                    SupplierId = table.Column<Guid>(type: "TEXT", nullable: true),
                    IsFavorite = table.Column<bool>(type: "INTEGER", nullable: false),
                    IsActive = table.Column<bool>(type: "INTEGER", nullable: false),
                    LowStockThreshold = table.Column<int>(type: "INTEGER", nullable: false),
                    TaxRateOverridePercent = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: true),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Products", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Products_Categories_CategoryId",
                        column: x => x.CategoryId,
                        principalTable: "Categories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_Products_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Products_Suppliers_SupplierId",
                        column: x => x.SupplierId,
                        principalTable: "Suppliers",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "CashRegisterShifts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    CompanyId = table.Column<Guid>(type: "TEXT", nullable: false),
                    LocationId = table.Column<Guid>(type: "TEXT", nullable: false),
                    OpenedByUserId = table.Column<Guid>(type: "TEXT", nullable: false),
                    ClosedByUserId = table.Column<Guid>(type: "TEXT", nullable: true),
                    Status = table.Column<int>(type: "INTEGER", nullable: false),
                    OpenedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    ClosedAt = table.Column<DateTime>(type: "TEXT", nullable: true),
                    OpeningCashAmount = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: false),
                    ClosingCashAmount = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: true),
                    ExpectedCashAmount = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: true),
                    Discrepancy = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: true),
                    ClosingNotes = table.Column<string>(type: "TEXT", nullable: true),
                    SyncStatus = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CashRegisterShifts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CashRegisterShifts_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_CashRegisterShifts_Locations_LocationId",
                        column: x => x.LocationId,
                        principalTable: "Locations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CashRegisterShifts_Users_ClosedByUserId",
                        column: x => x.ClosedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CashRegisterShifts_Users_OpenedByUserId",
                        column: x => x.OpenedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Devices",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    UserId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CompanyId = table.Column<Guid>(type: "TEXT", nullable: true),
                    Platform = table.Column<int>(type: "INTEGER", nullable: false),
                    DeviceName = table.Column<string>(type: "TEXT", nullable: false),
                    LastActiveAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    IsRevoked = table.Column<bool>(type: "INTEGER", nullable: false),
                    RemoteWipeRequested = table.Column<bool>(type: "INTEGER", nullable: false),
                    RefreshTokenHash = table.Column<string>(type: "TEXT", nullable: true),
                    RefreshTokenExpiresAt = table.Column<DateTime>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Devices", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Devices_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PurchaseOrders",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    CompanyId = table.Column<Guid>(type: "TEXT", nullable: false),
                    LocationId = table.Column<Guid>(type: "TEXT", nullable: false),
                    SupplierId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Status = table.Column<int>(type: "INTEGER", nullable: false),
                    Notes = table.Column<string>(type: "TEXT", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PurchaseOrders", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PurchaseOrders_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PurchaseOrders_Locations_LocationId",
                        column: x => x.LocationId,
                        principalTable: "Locations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseOrders_Suppliers_SupplierId",
                        column: x => x.SupplierId,
                        principalTable: "Suppliers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseOrders_Users_CreatedByUserId",
                        column: x => x.CreatedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Batches",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    ProductId = table.Column<Guid>(type: "TEXT", nullable: false),
                    LocationId = table.Column<Guid>(type: "TEXT", nullable: false),
                    BatchNumber = table.Column<string>(type: "TEXT", nullable: false),
                    ExpiryDate = table.Column<DateTime>(type: "TEXT", nullable: true),
                    QuantityInBaseUnits = table.Column<int>(type: "INTEGER", nullable: false),
                    PurchasePricePerBaseUnit = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: false),
                    ReceivedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Batches", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Batches_Locations_LocationId",
                        column: x => x.LocationId,
                        principalTable: "Locations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Batches_Products_ProductId",
                        column: x => x.ProductId,
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ProductPackagingLevels",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    ProductId = table.Column<Guid>(type: "TEXT", nullable: false),
                    UnitName = table.Column<string>(type: "TEXT", nullable: false),
                    QuantityInBaseUnits = table.Column<int>(type: "INTEGER", nullable: false),
                    SalePriceOverride = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProductPackagingLevels", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProductPackagingLevels_Products_ProductId",
                        column: x => x.ProductId,
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ServiceStockLinks",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    ServiceId = table.Column<Guid>(type: "TEXT", nullable: false),
                    ProductId = table.Column<Guid>(type: "TEXT", nullable: false),
                    QuantityConsumedInBaseUnits = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ServiceStockLinks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ServiceStockLinks_Products_ProductId",
                        column: x => x.ProductId,
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ServiceStockLinks_Services_ServiceId",
                        column: x => x.ServiceId,
                        principalTable: "Services",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Sales",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    CompanyId = table.Column<Guid>(type: "TEXT", nullable: false),
                    LocationId = table.Column<Guid>(type: "TEXT", nullable: false),
                    UserId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CustomerId = table.Column<Guid>(type: "TEXT", nullable: true),
                    ShiftId = table.Column<Guid>(type: "TEXT", nullable: true),
                    Total = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: false),
                    PaymentMethod = table.Column<int>(type: "INTEGER", nullable: false),
                    Status = table.Column<int>(type: "INTEGER", nullable: false),
                    AmountTendered = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: true),
                    ChangeDue = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: true),
                    Timestamp = table.Column<DateTime>(type: "TEXT", nullable: false),
                    SyncStatus = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Sales", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Sales_CashRegisterShifts_ShiftId",
                        column: x => x.ShiftId,
                        principalTable: "CashRegisterShifts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Sales_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Sales_Customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "Customers",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_Sales_Locations_LocationId",
                        column: x => x.LocationId,
                        principalTable: "Locations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Sales_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PurchaseOrderLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    PurchaseOrderId = table.Column<Guid>(type: "TEXT", nullable: false),
                    ProductId = table.Column<Guid>(type: "TEXT", nullable: false),
                    QuantityOrderedInBaseUnits = table.Column<int>(type: "INTEGER", nullable: false),
                    QuantityReceivedInBaseUnits = table.Column<int>(type: "INTEGER", nullable: false),
                    UnitCost = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PurchaseOrderLines", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PurchaseOrderLines_Products_ProductId",
                        column: x => x.ProductId,
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseOrderLines_PurchaseOrders_PurchaseOrderId",
                        column: x => x.PurchaseOrderId,
                        principalTable: "PurchaseOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "StockMovements",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    ProductId = table.Column<Guid>(type: "TEXT", nullable: false),
                    BatchId = table.Column<Guid>(type: "TEXT", nullable: true),
                    LocationId = table.Column<Guid>(type: "TEXT", nullable: false),
                    DestinationLocationId = table.Column<Guid>(type: "TEXT", nullable: true),
                    Type = table.Column<int>(type: "INTEGER", nullable: false),
                    QuantityInBaseUnits = table.Column<int>(type: "INTEGER", nullable: false),
                    Reason = table.Column<string>(type: "TEXT", nullable: true),
                    UserId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Timestamp = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StockMovements", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StockMovements_Batches_BatchId",
                        column: x => x.BatchId,
                        principalTable: "Batches",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_StockMovements_Locations_DestinationLocationId",
                        column: x => x.DestinationLocationId,
                        principalTable: "Locations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StockMovements_Locations_LocationId",
                        column: x => x.LocationId,
                        principalTable: "Locations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StockMovements_Products_ProductId",
                        column: x => x.ProductId,
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_StockMovements_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "InstallmentPlans",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    SaleId = table.Column<Guid>(type: "TEXT", nullable: false),
                    TotalAmount = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: false),
                    NumberOfInstallments = table.Column<int>(type: "INTEGER", nullable: false),
                    Mode = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InstallmentPlans", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InstallmentPlans_Sales_SaleId",
                        column: x => x.SaleId,
                        principalTable: "Sales",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PaymentSplits",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    SaleId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Method = table.Column<int>(type: "INTEGER", nullable: false),
                    Amount = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PaymentSplits", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PaymentSplits_Sales_SaleId",
                        column: x => x.SaleId,
                        principalTable: "Sales",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SaleLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    SaleId = table.Column<Guid>(type: "TEXT", nullable: false),
                    ProductId = table.Column<Guid>(type: "TEXT", nullable: false),
                    BatchId = table.Column<Guid>(type: "TEXT", nullable: true),
                    QuantityInBaseUnits = table.Column<int>(type: "INTEGER", nullable: false),
                    PackagingLevelId = table.Column<Guid>(type: "TEXT", nullable: true),
                    UnitPrice = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: false),
                    TaxRatePercent = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SaleLines", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SaleLines_Batches_BatchId",
                        column: x => x.BatchId,
                        principalTable: "Batches",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_SaleLines_ProductPackagingLevels_PackagingLevelId",
                        column: x => x.PackagingLevelId,
                        principalTable: "ProductPackagingLevels",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_SaleLines_Products_ProductId",
                        column: x => x.ProductId,
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SaleLines_Sales_SaleId",
                        column: x => x.SaleId,
                        principalTable: "Sales",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ServiceLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    SaleId = table.Column<Guid>(type: "TEXT", nullable: false),
                    ServiceId = table.Column<Guid>(type: "TEXT", nullable: false),
                    BilledPrice = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: false),
                    Quantity = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ServiceLines", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ServiceLines_Sales_SaleId",
                        column: x => x.SaleId,
                        principalTable: "Sales",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ServiceLines_Services_ServiceId",
                        column: x => x.ServiceId,
                        principalTable: "Services",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "InstallmentPayments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    InstallmentPlanId = table.Column<Guid>(type: "TEXT", nullable: false),
                    AmountPaid = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: false),
                    DatePaid = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InstallmentPayments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InstallmentPayments_InstallmentPlans_InstallmentPlanId",
                        column: x => x.InstallmentPlanId,
                        principalTable: "InstallmentPlans",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Batches_LocationId",
                table: "Batches",
                column: "LocationId");

            migrationBuilder.CreateIndex(
                name: "IX_Batches_ProductId",
                table: "Batches",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_CashRegisterShifts_ClosedByUserId",
                table: "CashRegisterShifts",
                column: "ClosedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_CashRegisterShifts_CompanyId",
                table: "CashRegisterShifts",
                column: "CompanyId");

            migrationBuilder.CreateIndex(
                name: "IX_CashRegisterShifts_LocationId",
                table: "CashRegisterShifts",
                column: "LocationId",
                unique: true,
                filter: "\"Status\" = 0");

            migrationBuilder.CreateIndex(
                name: "IX_CashRegisterShifts_OpenedByUserId",
                table: "CashRegisterShifts",
                column: "OpenedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_Categories_CompanyId_Name",
                table: "Categories",
                columns: new[] { "CompanyId", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Companies_UniqueCode",
                table: "Companies",
                column: "UniqueCode",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Customers_CompanyId",
                table: "Customers",
                column: "CompanyId");

            migrationBuilder.CreateIndex(
                name: "IX_CustomFieldDefinitions_CompanyId",
                table: "CustomFieldDefinitions",
                column: "CompanyId");

            migrationBuilder.CreateIndex(
                name: "IX_CustomFieldValues_CustomFieldDefinitionId",
                table: "CustomFieldValues",
                column: "CustomFieldDefinitionId");

            migrationBuilder.CreateIndex(
                name: "IX_Devices_RefreshTokenHash",
                table: "Devices",
                column: "RefreshTokenHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Devices_UserId",
                table: "Devices",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_GiftCards_CompanyId_Code",
                table: "GiftCards",
                columns: new[] { "CompanyId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_InstallmentPayments_InstallmentPlanId",
                table: "InstallmentPayments",
                column: "InstallmentPlanId");

            migrationBuilder.CreateIndex(
                name: "IX_InstallmentPlans_SaleId",
                table: "InstallmentPlans",
                column: "SaleId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Locations_CompanyId",
                table: "Locations",
                column: "CompanyId");

            migrationBuilder.CreateIndex(
                name: "IX_LoyaltyAccounts_CustomerId",
                table: "LoyaltyAccounts",
                column: "CustomerId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PaymentSplits_SaleId",
                table: "PaymentSplits",
                column: "SaleId");

            migrationBuilder.CreateIndex(
                name: "IX_ProductPackagingLevels_ProductId",
                table: "ProductPackagingLevels",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_Products_CategoryId",
                table: "Products",
                column: "CategoryId");

            migrationBuilder.CreateIndex(
                name: "IX_Products_CompanyId_Barcode",
                table: "Products",
                columns: new[] { "CompanyId", "Barcode" });

            migrationBuilder.CreateIndex(
                name: "IX_Products_SupplierId",
                table: "Products",
                column: "SupplierId");

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseOrderLines_ProductId",
                table: "PurchaseOrderLines",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseOrderLines_PurchaseOrderId",
                table: "PurchaseOrderLines",
                column: "PurchaseOrderId");

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseOrders_CompanyId",
                table: "PurchaseOrders",
                column: "CompanyId");

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseOrders_CreatedByUserId",
                table: "PurchaseOrders",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseOrders_LocationId",
                table: "PurchaseOrders",
                column: "LocationId");

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseOrders_SupplierId",
                table: "PurchaseOrders",
                column: "SupplierId");

            migrationBuilder.CreateIndex(
                name: "IX_SaleLines_BatchId",
                table: "SaleLines",
                column: "BatchId");

            migrationBuilder.CreateIndex(
                name: "IX_SaleLines_PackagingLevelId",
                table: "SaleLines",
                column: "PackagingLevelId");

            migrationBuilder.CreateIndex(
                name: "IX_SaleLines_ProductId",
                table: "SaleLines",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_SaleLines_SaleId",
                table: "SaleLines",
                column: "SaleId");

            migrationBuilder.CreateIndex(
                name: "IX_Sales_CompanyId",
                table: "Sales",
                column: "CompanyId");

            migrationBuilder.CreateIndex(
                name: "IX_Sales_CustomerId",
                table: "Sales",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_Sales_LocationId",
                table: "Sales",
                column: "LocationId");

            migrationBuilder.CreateIndex(
                name: "IX_Sales_ShiftId",
                table: "Sales",
                column: "ShiftId");

            migrationBuilder.CreateIndex(
                name: "IX_Sales_UserId",
                table: "Sales",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_ServiceLines_SaleId",
                table: "ServiceLines",
                column: "SaleId");

            migrationBuilder.CreateIndex(
                name: "IX_ServiceLines_ServiceId",
                table: "ServiceLines",
                column: "ServiceId");

            migrationBuilder.CreateIndex(
                name: "IX_Services_CompanyId",
                table: "Services",
                column: "CompanyId");

            migrationBuilder.CreateIndex(
                name: "IX_ServiceStockLinks_ProductId",
                table: "ServiceStockLinks",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_ServiceStockLinks_ServiceId",
                table: "ServiceStockLinks",
                column: "ServiceId");

            migrationBuilder.CreateIndex(
                name: "IX_StockMovements_BatchId",
                table: "StockMovements",
                column: "BatchId");

            migrationBuilder.CreateIndex(
                name: "IX_StockMovements_DestinationLocationId",
                table: "StockMovements",
                column: "DestinationLocationId");

            migrationBuilder.CreateIndex(
                name: "IX_StockMovements_LocationId",
                table: "StockMovements",
                column: "LocationId");

            migrationBuilder.CreateIndex(
                name: "IX_StockMovements_ProductId",
                table: "StockMovements",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_StockMovements_UserId",
                table: "StockMovements",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_Suppliers_CompanyId",
                table: "Suppliers",
                column: "CompanyId");

            migrationBuilder.CreateIndex(
                name: "IX_Users_CompanyId_Phone",
                table: "Users",
                columns: new[] { "CompanyId", "Phone" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CustomFieldValues");

            migrationBuilder.DropTable(
                name: "Devices");

            migrationBuilder.DropTable(
                name: "GiftCards");

            migrationBuilder.DropTable(
                name: "InstallmentPayments");

            migrationBuilder.DropTable(
                name: "LoyaltyAccounts");

            migrationBuilder.DropTable(
                name: "PaymentSplits");

            migrationBuilder.DropTable(
                name: "PurchaseOrderLines");

            migrationBuilder.DropTable(
                name: "SaleLines");

            migrationBuilder.DropTable(
                name: "ServiceLines");

            migrationBuilder.DropTable(
                name: "ServiceStockLinks");

            migrationBuilder.DropTable(
                name: "StockMovements");

            migrationBuilder.DropTable(
                name: "CustomFieldDefinitions");

            migrationBuilder.DropTable(
                name: "InstallmentPlans");

            migrationBuilder.DropTable(
                name: "PurchaseOrders");

            migrationBuilder.DropTable(
                name: "ProductPackagingLevels");

            migrationBuilder.DropTable(
                name: "Services");

            migrationBuilder.DropTable(
                name: "Batches");

            migrationBuilder.DropTable(
                name: "Sales");

            migrationBuilder.DropTable(
                name: "Products");

            migrationBuilder.DropTable(
                name: "CashRegisterShifts");

            migrationBuilder.DropTable(
                name: "Customers");

            migrationBuilder.DropTable(
                name: "Categories");

            migrationBuilder.DropTable(
                name: "Suppliers");

            migrationBuilder.DropTable(
                name: "Locations");

            migrationBuilder.DropTable(
                name: "Users");

            migrationBuilder.DropTable(
                name: "Companies");
        }
    }
}
