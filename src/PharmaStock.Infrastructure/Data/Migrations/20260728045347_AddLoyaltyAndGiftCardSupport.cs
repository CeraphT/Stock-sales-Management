using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PharmaStock.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddLoyaltyAndGiftCardSupport : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "GiftCardCode",
                table: "Sales",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "CreatedAt",
                table: "GiftCards",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<decimal>(
                name: "LoyaltyEarnRateAmount",
                table: "Companies",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: false,
                defaultValue: 100m);

            migrationBuilder.AddColumn<bool>(
                name: "LoyaltyEnabled",
                table: "Companies",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<decimal>(
                name: "LoyaltyPointValue",
                table: "Companies",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: false,
                defaultValue: 10m);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "GiftCardCode",
                table: "Sales");

            migrationBuilder.DropColumn(
                name: "CreatedAt",
                table: "GiftCards");

            migrationBuilder.DropColumn(
                name: "LoyaltyEarnRateAmount",
                table: "Companies");

            migrationBuilder.DropColumn(
                name: "LoyaltyEnabled",
                table: "Companies");

            migrationBuilder.DropColumn(
                name: "LoyaltyPointValue",
                table: "Companies");
        }
    }
}
