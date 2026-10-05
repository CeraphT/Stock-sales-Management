using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PharmaStock.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddSupportProcess : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AssignedToName",
                table: "SupportTickets",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "AssignedToUserId",
                table: "SupportTickets",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "AwaitingSupport",
                table: "SupportTickets",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "LastReporterMessageAt",
                table: "SupportTickets",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Priority",
                table: "SupportTickets",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<bool>(
                name: "UnreadByReporter",
                table: "SupportTickets",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "SupportMessages",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TicketId = table.Column<Guid>(type: "uuid", nullable: false),
                    AuthorUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    AuthorName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    FromSupport = table.Column<bool>(type: "boolean", nullable: false),
                    IsInternal = table.Column<bool>(type: "boolean", nullable: false),
                    Body = table.Column<string>(type: "character varying(8000)", maxLength: 8000, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SupportMessages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SupportMessages_SupportTickets_TicketId",
                        column: x => x.TicketId,
                        principalTable: "SupportTickets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SupportTickets_Priority_CreatedAt",
                table: "SupportTickets",
                columns: new[] { "Priority", "CreatedAt" });

            // Backfill tickets filed before the triage process existed:
            // priority from the category ("I'm blocked" = High, else Normal),
            // "awaiting support" while open/in progress with no reply yet, and
            // any existing single reply carried into the new conversation thread.
            migrationBuilder.Sql(@"
UPDATE ""SupportTickets"" SET ""Priority"" = CASE WHEN ""Category"" = 1 THEN 2 ELSE 1 END;
UPDATE ""SupportTickets"" SET ""AwaitingSupport"" = (""AdminReply"" IS NULL AND ""Status"" IN (0, 1));
UPDATE ""SupportTickets"" SET ""LastReporterMessageAt"" = ""CreatedAt"";
INSERT INTO ""SupportMessages"" (""Id"", ""TicketId"", ""AuthorUserId"", ""AuthorName"", ""FromSupport"", ""IsInternal"", ""Body"", ""CreatedAt"")
SELECT gen_random_uuid(), ""Id"", '00000000-0000-0000-0000-000000000000', 'Support', TRUE, FALSE, ""AdminReply"", COALESCE(""RepliedAt"", ""UpdatedAt"")
FROM ""SupportTickets"" WHERE ""AdminReply"" IS NOT NULL;");

            migrationBuilder.CreateIndex(
                name: "IX_SupportMessages_TicketId_CreatedAt",
                table: "SupportMessages",
                columns: new[] { "TicketId", "CreatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SupportMessages");

            migrationBuilder.DropIndex(
                name: "IX_SupportTickets_Priority_CreatedAt",
                table: "SupportTickets");

            migrationBuilder.DropColumn(
                name: "AssignedToName",
                table: "SupportTickets");

            migrationBuilder.DropColumn(
                name: "AssignedToUserId",
                table: "SupportTickets");

            migrationBuilder.DropColumn(
                name: "AwaitingSupport",
                table: "SupportTickets");

            migrationBuilder.DropColumn(
                name: "LastReporterMessageAt",
                table: "SupportTickets");

            migrationBuilder.DropColumn(
                name: "Priority",
                table: "SupportTickets");

            migrationBuilder.DropColumn(
                name: "UnreadByReporter",
                table: "SupportTickets");
        }
    }
}
