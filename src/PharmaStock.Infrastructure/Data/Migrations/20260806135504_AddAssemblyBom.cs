using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PharmaStock.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddAssemblyBom : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsAssembly",
                table: "Products",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "Manufacturer",
                table: "Products",
                type: "text",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "BillOfMaterialLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    AssemblyProductId = table.Column<Guid>(type: "uuid", nullable: false),
                    ComponentProductId = table.Column<Guid>(type: "uuid", nullable: false),
                    QuantityInBaseUnits = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BillOfMaterialLines", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BillOfMaterialLines_Products_AssemblyProductId",
                        column: x => x.AssemblyProductId,
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_BillOfMaterialLines_Products_ComponentProductId",
                        column: x => x.ComponentProductId,
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BillOfMaterialLines_AssemblyProductId",
                table: "BillOfMaterialLines",
                column: "AssemblyProductId");

            migrationBuilder.CreateIndex(
                name: "IX_BillOfMaterialLines_ComponentProductId",
                table: "BillOfMaterialLines",
                column: "ComponentProductId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BillOfMaterialLines");

            migrationBuilder.DropColumn(
                name: "IsAssembly",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "Manufacturer",
                table: "Products");
        }
    }
}
