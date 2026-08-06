using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PharmaStock.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddInventoryCapabilities : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "AssemblyEnabled",
                table: "Companies",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            // defaultValue true backfills EXISTING companies to expiry-on, so
            // shops already using batch/expiry (FEFO) keep that behaviour.
            migrationBuilder.AddColumn<bool>(
                name: "ExpiryTrackingEnabled",
                table: "Companies",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "SellByMeasureEnabled",
                table: "Companies",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "SerialTrackingEnabled",
                table: "Companies",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "VariantsEnabled",
                table: "Companies",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AssemblyEnabled",
                table: "Companies");

            migrationBuilder.DropColumn(
                name: "ExpiryTrackingEnabled",
                table: "Companies");

            migrationBuilder.DropColumn(
                name: "SellByMeasureEnabled",
                table: "Companies");

            migrationBuilder.DropColumn(
                name: "SerialTrackingEnabled",
                table: "Companies");

            migrationBuilder.DropColumn(
                name: "VariantsEnabled",
                table: "Companies");
        }
    }
}
