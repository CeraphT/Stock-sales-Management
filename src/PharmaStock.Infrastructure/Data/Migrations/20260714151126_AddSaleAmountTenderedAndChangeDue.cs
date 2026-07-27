using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PharmaStock.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddSaleAmountTenderedAndChangeDue : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "AmountTendered",
                table: "Sales",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ChangeDue",
                table: "Sales",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AmountTendered",
                table: "Sales");

            migrationBuilder.DropColumn(
                name: "ChangeDue",
                table: "Sales");
        }
    }
}
