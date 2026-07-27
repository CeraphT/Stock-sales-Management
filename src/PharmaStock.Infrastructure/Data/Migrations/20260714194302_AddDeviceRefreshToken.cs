using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PharmaStock.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddDeviceRefreshToken : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "RefreshTokenExpiresAt",
                table: "Devices",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RefreshTokenHash",
                table: "Devices",
                type: "text",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Devices_RefreshTokenHash",
                table: "Devices",
                column: "RefreshTokenHash",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Devices_RefreshTokenHash",
                table: "Devices");

            migrationBuilder.DropColumn(
                name: "RefreshTokenExpiresAt",
                table: "Devices");

            migrationBuilder.DropColumn(
                name: "RefreshTokenHash",
                table: "Devices");
        }
    }
}
