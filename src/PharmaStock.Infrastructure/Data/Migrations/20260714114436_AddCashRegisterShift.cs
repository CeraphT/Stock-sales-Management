using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PharmaStock.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCashRegisterShift : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "ShiftId",
                table: "Sales",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "CashRegisterShifts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    LocationId = table.Column<Guid>(type: "uuid", nullable: false),
                    OpenedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ClosedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    OpenedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ClosedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    OpeningCashAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    ClosingCashAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: true),
                    ExpectedCashAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: true),
                    Discrepancy = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: true),
                    ClosingNotes = table.Column<string>(type: "text", nullable: true)
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

            migrationBuilder.CreateIndex(
                name: "IX_Sales_ShiftId",
                table: "Sales",
                column: "ShiftId");

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

            migrationBuilder.AddForeignKey(
                name: "FK_Sales_CashRegisterShifts_ShiftId",
                table: "Sales",
                column: "ShiftId",
                principalTable: "CashRegisterShifts",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Sales_CashRegisterShifts_ShiftId",
                table: "Sales");

            migrationBuilder.DropTable(
                name: "CashRegisterShifts");

            migrationBuilder.DropIndex(
                name: "IX_Sales_ShiftId",
                table: "Sales");

            migrationBuilder.DropColumn(
                name: "ShiftId",
                table: "Sales");
        }
    }
}
