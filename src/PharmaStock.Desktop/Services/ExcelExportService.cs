using System.Globalization;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Spreadsheet;
using OoxBorder = DocumentFormat.OpenXml.Spreadsheet.Border;
using OoxCell = DocumentFormat.OpenXml.Spreadsheet.Cell;
using OoxColor = DocumentFormat.OpenXml.Spreadsheet.Color;
using OoxFont = DocumentFormat.OpenXml.Spreadsheet.Font;
using OoxFontSize = DocumentFormat.OpenXml.Spreadsheet.FontSize;

namespace PharmaStock.Desktop.Services;

/// <summary>Builds small, single-sheet, brand-styled .xlsx workbooks for the
/// app's export buttons (Rapports, Ventes en attente). Uses the OpenXML SDK
/// directly rather than ClosedXML/EPPlus — it's pure managed with no
/// System.Drawing dependency, so it works on Android as well as Windows.
/// "Border"/"Color"/"Font" are aliased because Microsoft.Maui.Controls and
/// Microsoft.Maui.Graphics are global-usings in this project and collide
/// with the identically-named OpenXML spreadsheet types.</summary>
public static class ExcelExportService
{
    public enum ColumnType { Text, Integer, Currency, Date, DateTime }

    public sealed record ExportColumn(string Header, ColumnType Type, double Width);

    // Custom numbering format IDs — the range 0-163 is reserved by Excel for
    // built-ins, so custom formats must start at 164.
    private const uint IntegerNumFmtId = 164;
    private const uint CurrencyNumFmtId = 165;
    private const uint DateNumFmtId = 166;
    private const uint DateTimeNumFmtId = 167;

    // CellFormat (cellXfs) indices — must match BuildStylesheet's insertion order exactly.
    private const uint TitleStyle = 1;
    private const uint SubtitleStyle = 2;
    private const uint HeaderStyle = 3;
    private const uint TextStyle = 4;
    private const uint IntegerStyle = 5;
    private const uint CurrencyStyle = 6;
    private const uint DateStyle = 7;
    private const uint DateTimeStyle = 8;
    private const uint TotalsTextStyle = 9;
    private const uint TotalsIntegerStyle = 10;
    private const uint TotalsCurrencyStyle = 11;

    /// <summary>Writes the workbook to a fresh file under
    /// FileSystem.CacheDirectory and returns its full path, ready to hand to
    /// Share.Default.RequestAsync.</summary>
    public static string Export(
        string fileNamePrefix, string title, string subtitle,
        IReadOnlyList<ExportColumn> columns, IReadOnlyList<object?[]> rows,
        object?[]? totalsRow, string? currency)
    {
        var fileName = $"{fileNamePrefix}-{DateTime.Now:yyyyMMdd-HHmmss}.xlsx";
        var path = Path.Combine(FileSystem.CacheDirectory, fileName);

        using (var document = SpreadsheetDocument.Create(path, SpreadsheetDocumentType.Workbook))
        {
            var workbookPart = document.AddWorkbookPart();
            workbookPart.Workbook = new Workbook();

            var stylesPart = workbookPart.AddNewPart<WorkbookStylesPart>();
            stylesPart.Stylesheet = BuildStylesheet(currency);
            stylesPart.Stylesheet.Save();

            var worksheetPart = workbookPart.AddNewPart<WorksheetPart>();
            var columnCount = columns.Count;

            var columnsElement = new Columns();
            for (var i = 0; i < columnCount; i++)
            {
                columnsElement.Append(new Column
                {
                    Min = (uint)(i + 1), Max = (uint)(i + 1),
                    Width = columns[i].Width, CustomWidth = true
                });
            }

            var sheetData = new SheetData();
            uint rowIndex = 1;

            sheetData.Append(BuildRow(rowIndex, new object?[] { title }, new[] { TitleStyle }));
            rowIndex++;

            sheetData.Append(BuildRow(rowIndex, new object?[] { subtitle }, new[] { SubtitleStyle }));
            rowIndex++;

            sheetData.Append(new Row { RowIndex = rowIndex });
            rowIndex++;

            sheetData.Append(BuildRow(rowIndex, columns.Select(c => (object?)c.Header).ToArray(),
                Enumerable.Repeat(HeaderStyle, columnCount).ToArray()));
            var headerRowIndex = rowIndex;
            rowIndex++;

            var dataStyles = columns.Select(c => StyleFor(c.Type, isTotals: false)).ToArray();
            foreach (var row in rows)
            {
                sheetData.Append(BuildRow(rowIndex, row, dataStyles));
                rowIndex++;
            }

            if (totalsRow is not null)
            {
                var totalsStyles = columns.Select(c => StyleFor(c.Type, isTotals: true)).ToArray();
                sheetData.Append(BuildRow(rowIndex, totalsRow, totalsStyles));
            }

            var sheetView = new SheetView { WorkbookViewId = 0 };
            sheetView.Append(new Pane
            {
                // Counterintuitively, freezing rows uses VerticalSplit (maps
                // to the OOXML "ySplit" attribute) — HorizontalSplit maps to
                // "xSplit" and freezes columns instead.
                VerticalSplit = headerRowIndex, TopLeftCell = $"A{headerRowIndex + 1}",
                ActivePane = PaneValues.BottomLeft, State = PaneStateValues.Frozen
            });

            var lastColumn = ColumnLetter(Math.Max(columnCount, 1));
            var mergeCells = new MergeCells(
                new MergeCell { Reference = $"A1:{lastColumn}1" },
                new MergeCell { Reference = $"A2:{lastColumn}2" });

            worksheetPart.Worksheet = new Worksheet(new SheetViews(sheetView), columnsElement, sheetData, mergeCells);
            worksheetPart.Worksheet.Save();

            var sheets = workbookPart.Workbook.AppendChild(new Sheets());
            sheets.Append(new Sheet
            {
                Id = workbookPart.GetIdOfPart(worksheetPart), SheetId = 1, Name = "Feuil1"
            });

            workbookPart.Workbook.Save();
        }

        return path;
    }

    private static Row BuildRow(uint rowIndex, IReadOnlyList<object?> values, IReadOnlyList<uint> styles)
    {
        var row = new Row { RowIndex = rowIndex };
        for (var i = 0; i < values.Count; i++)
            row.Append(BuildCell(i, rowIndex, values[i], styles[i]));
        return row;
    }

    private static OoxCell BuildCell(int columnIndex, uint rowIndex, object? value, uint styleIndex)
    {
        var reference = $"{ColumnLetter(columnIndex + 1)}{rowIndex}";
        return value switch
        {
            null => new OoxCell { CellReference = reference, StyleIndex = styleIndex },
            string s => new OoxCell
            {
                CellReference = reference, StyleIndex = styleIndex,
                DataType = CellValues.InlineString, InlineString = new InlineString(new Text(s))
            },
            DateTime dt => new OoxCell
            {
                CellReference = reference, StyleIndex = styleIndex,
                CellValue = new CellValue(dt.ToOADate().ToString(CultureInfo.InvariantCulture))
            },
            _ => new OoxCell
            {
                CellReference = reference, StyleIndex = styleIndex,
                CellValue = new CellValue(Convert.ToDecimal(value, CultureInfo.InvariantCulture).ToString(CultureInfo.InvariantCulture))
            }
        };
    }

    private static uint StyleFor(ColumnType type, bool isTotals) => type switch
    {
        ColumnType.Integer => isTotals ? TotalsIntegerStyle : IntegerStyle,
        ColumnType.Currency => isTotals ? TotalsCurrencyStyle : CurrencyStyle,
        ColumnType.Date => isTotals ? TotalsTextStyle : DateStyle,
        ColumnType.DateTime => isTotals ? TotalsTextStyle : DateTimeStyle,
        _ => isTotals ? TotalsTextStyle : TextStyle
    };

    private static string ColumnLetter(int columnNumber)
    {
        var dividend = columnNumber;
        var name = string.Empty;
        while (dividend > 0)
        {
            var modulo = (dividend - 1) % 26;
            name = Convert.ToChar('A' + modulo) + name;
            dividend = (dividend - modulo - 1) / 26;
        }
        return name;
    }

    private static Stylesheet BuildStylesheet(string? currency)
    {
        var currencyFormatCode = string.IsNullOrEmpty(currency) ? "#,##0" : $"#,##0\" {currency}\"";

        var numberingFormats = new NumberingFormats(
            new NumberingFormat { NumberFormatId = IntegerNumFmtId, FormatCode = "#,##0" },
            new NumberingFormat { NumberFormatId = CurrencyNumFmtId, FormatCode = currencyFormatCode },
            new NumberingFormat { NumberFormatId = DateNumFmtId, FormatCode = "dd/mm/yyyy" },
            new NumberingFormat { NumberFormatId = DateTimeNumFmtId, FormatCode = "dd/mm/yyyy hh:mm" })
        { Count = 4 };

        // Brand teal (Resources/Styles/Colors.xaml Primary = #1E8A6E) for the
        // header fill and title text, so exports read as unmistakably "PharmaStock".
        var fonts = new Fonts(
            new OoxFont(new OoxFontSize { Val = 11 }, new FontName { Val = "Calibri" }),
            new OoxFont(new Bold(), new OoxFontSize { Val = 14 }, new OoxColor { Rgb = "FF1E8A6E" }, new FontName { Val = "Calibri" }),
            new OoxFont(new Italic(), new OoxFontSize { Val = 10 }, new OoxColor { Rgb = "FF6B7280" }, new FontName { Val = "Calibri" }),
            new OoxFont(new Bold(), new OoxFontSize { Val = 11 }, new OoxColor { Rgb = "FFFFFFFF" }, new FontName { Val = "Calibri" }),
            new OoxFont(new Bold(), new OoxFontSize { Val = 11 }, new FontName { Val = "Calibri" }))
        { Count = 5 };

        var fills = new Fills(
            new Fill(new PatternFill { PatternType = PatternValues.None }),
            new Fill(new PatternFill { PatternType = PatternValues.Gray125 }),
            new Fill(new PatternFill(new ForegroundColor { Rgb = "FF1E8A6E" }, new BackgroundColor { Indexed = 64 })
            { PatternType = PatternValues.Solid }))
        { Count = 3 };

        var gray = new OoxColor { Rgb = "FFD9D9D9" };
        var borders = new Borders(
            new OoxBorder(new LeftBorder(), new RightBorder(), new TopBorder(), new BottomBorder(), new DiagonalBorder()),
            new OoxBorder(
                new LeftBorder(new OoxColor { Rgb = gray.Rgb }) { Style = BorderStyleValues.Thin },
                new RightBorder(new OoxColor { Rgb = gray.Rgb }) { Style = BorderStyleValues.Thin },
                new TopBorder(new OoxColor { Rgb = gray.Rgb }) { Style = BorderStyleValues.Thin },
                new BottomBorder(new OoxColor { Rgb = gray.Rgb }) { Style = BorderStyleValues.Thin },
                new DiagonalBorder()),
            new OoxBorder(
                new LeftBorder(), new RightBorder(),
                new TopBorder(new OoxColor { Rgb = "FF1E8A6E" }) { Style = BorderStyleValues.Medium },
                new BottomBorder(), new DiagonalBorder()))
        { Count = 3 };

        var cellFormats = new CellFormats(
            Xf(0, 0, 0, 0),
            Xf(1, 0, 0, 0, HorizontalAlignmentValues.Left),
            Xf(2, 0, 0, 0, HorizontalAlignmentValues.Left),
            Xf(3, 2, 1, 0, HorizontalAlignmentValues.Center, wrap: true),
            Xf(0, 0, 1, 0, HorizontalAlignmentValues.Left),
            Xf(0, 0, 1, IntegerNumFmtId, HorizontalAlignmentValues.Right),
            Xf(0, 0, 1, CurrencyNumFmtId, HorizontalAlignmentValues.Right),
            Xf(0, 0, 1, DateNumFmtId, HorizontalAlignmentValues.Center),
            Xf(0, 0, 1, DateTimeNumFmtId, HorizontalAlignmentValues.Center),
            Xf(4, 0, 2, 0, HorizontalAlignmentValues.Left),
            Xf(4, 0, 2, IntegerNumFmtId, HorizontalAlignmentValues.Right),
            Xf(4, 0, 2, CurrencyNumFmtId, HorizontalAlignmentValues.Right))
        { Count = 12 };

        var cellStyleFormats = new CellStyleFormats(new CellFormat()) { Count = 1 };
        var cellStyles = new CellStyles(new CellStyle { Name = "Normal", FormatId = 0, BuiltinId = 0 }) { Count = 1 };

        return new Stylesheet(numberingFormats, fonts, fills, borders, cellStyleFormats, cellFormats, cellStyles);
    }

    private static CellFormat Xf(uint fontId, uint fillId, uint borderId, uint numFmtId,
        HorizontalAlignmentValues? horizontal = null, bool wrap = false)
    {
        var format = new CellFormat
        {
            FontId = fontId, FillId = fillId, BorderId = borderId, NumberFormatId = numFmtId,
            ApplyFont = fontId != 0, ApplyFill = fillId != 0, ApplyBorder = borderId != 0,
            ApplyNumberFormat = numFmtId != 0
        };
        if (horizontal is not null)
        {
            format.Alignment = new Alignment { Horizontal = horizontal, Vertical = VerticalAlignmentValues.Center, WrapText = wrap };
            format.ApplyAlignment = true;
        }
        return format;
    }
}
