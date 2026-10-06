using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PharmaStock.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCompanyMemberships : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Users_CompanyId_Phone",
                table: "Users");

            migrationBuilder.CreateTable(
                name: "CompanyMemberships",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    Role = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    RestrictCatalog = table.Column<bool>(type: "boolean", nullable: false),
                    RestrictPurchasing = table.Column<bool>(type: "boolean", nullable: false),
                    RestrictCustomers = table.Column<bool>(type: "boolean", nullable: false),
                    RestrictReportsAndFullSales = table.Column<bool>(type: "boolean", nullable: false),
                    RestrictCashRegister = table.Column<bool>(type: "boolean", nullable: false),
                    RestrictGiftCards = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    DecidedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DecidedByUserId = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CompanyMemberships", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CompanyMemberships_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_CompanyMemberships_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            // 1. Every existing shop account gets a membership in its business, carrying
            //    its role (Cashier/CompanyAdmin) and restrictions; inactive → Disabled.
            migrationBuilder.Sql(@"
INSERT INTO ""CompanyMemberships"" (""Id"", ""UserId"", ""CompanyId"", ""Role"", ""Status"",
    ""RestrictCatalog"", ""RestrictPurchasing"", ""RestrictCustomers"", ""RestrictReportsAndFullSales"",
    ""RestrictCashRegister"", ""RestrictGiftCards"", ""CreatedAt"")
SELECT gen_random_uuid(), u.""Id"", u.""CompanyId"",
    CASE WHEN u.""Role"" = 1 THEN 1 ELSE 0 END,
    CASE WHEN u.""Active"" THEN 0 ELSE 3 END,
    u.""RestrictCatalog"", u.""RestrictPurchasing"", u.""RestrictCustomers"", u.""RestrictReportsAndFullSales"",
    u.""RestrictCashRegister"", u.""RestrictGiftCards"", now()
FROM ""Users"" u
WHERE u.""CompanyId"" IS NOT NULL AND u.""Role"" <> 2;");

            // 2. One account per phone: accounts sharing a phone (one per business
            //    before) merge into the active, most recently used one. Its password
            //    is kept; the others' memberships and devices move over (open sessions
            //    keep working) and they are retired with a freed-up phone. Past sales,
            //    shifts and movements still point at the retired rows for history.
            migrationBuilder.Sql(@"
CREATE TEMP TABLE merge_map ON COMMIT DROP AS
WITH ranked AS (
    SELECT u.""Id"", u.""Phone"",
        ROW_NUMBER() OVER (PARTITION BY u.""Phone"" ORDER BY u.""Active"" DESC,
            (SELECT max(d.""LastActiveAt"") FROM ""Devices"" d WHERE d.""UserId"" = u.""Id"") DESC NULLS LAST,
            u.""Id"") AS rn
    FROM ""Users"" u WHERE u.""Role"" <> 2
)
SELECT r.""Id"" AS old_id, k.""Id"" AS keep_id
FROM ranked r JOIN ranked k ON k.""Phone"" = r.""Phone"" AND k.rn = 1
WHERE r.rn > 1;

UPDATE ""CompanyMemberships"" m SET ""UserId"" = mm.keep_id
FROM merge_map mm
WHERE m.""UserId"" = mm.old_id
  AND NOT EXISTS (SELECT 1 FROM ""CompanyMemberships"" x WHERE x.""UserId"" = mm.keep_id AND x.""CompanyId"" = m.""CompanyId"");

UPDATE ""CompanyMemberships"" k SET ""Role"" = 1
FROM ""CompanyMemberships"" o JOIN merge_map mm ON o.""UserId"" = mm.old_id
WHERE k.""UserId"" = mm.keep_id AND k.""CompanyId"" = o.""CompanyId"" AND o.""Role"" = 1;

DELETE FROM ""CompanyMemberships"" o USING merge_map mm WHERE o.""UserId"" = mm.old_id;

UPDATE ""Devices"" d SET ""UserId"" = mm.keep_id FROM merge_map mm WHERE d.""UserId"" = mm.old_id;

UPDATE ""Users"" u SET ""Active"" = false, ""Phone"" = u.""Phone"" || '#merged-' || left(u.""Id""::text, 8)
FROM merge_map mm WHERE u.""Id"" = mm.old_id;");

            migrationBuilder.CreateIndex(
                name: "IX_Users_CompanyId",
                table: "Users",
                column: "CompanyId");

            migrationBuilder.CreateIndex(
                name: "IX_Users_Phone",
                table: "Users",
                column: "Phone",
                unique: true,
                filter: "\"Role\" <> 2");

            migrationBuilder.CreateIndex(
                name: "IX_CompanyMemberships_CompanyId_Status",
                table: "CompanyMemberships",
                columns: new[] { "CompanyId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_CompanyMemberships_UserId_CompanyId",
                table: "CompanyMemberships",
                columns: new[] { "UserId", "CompanyId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CompanyMemberships");

            migrationBuilder.DropIndex(
                name: "IX_Users_CompanyId",
                table: "Users");

            migrationBuilder.DropIndex(
                name: "IX_Users_Phone",
                table: "Users");

            migrationBuilder.CreateIndex(
                name: "IX_Users_CompanyId_Phone",
                table: "Users",
                columns: new[] { "CompanyId", "Phone" },
                unique: true);
        }
    }
}
