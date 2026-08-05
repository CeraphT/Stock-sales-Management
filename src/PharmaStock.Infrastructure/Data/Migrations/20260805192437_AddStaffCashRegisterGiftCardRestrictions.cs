using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PharmaStock.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddStaffCashRegisterGiftCardRestrictions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "RestrictCashRegister",
                table: "Users",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "RestrictGiftCards",
                table: "Users",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "RestrictCashRegister",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "RestrictGiftCards",
                table: "Users");
        }
    }
}
