// Minimal, dependency-free Code 128 (subset B) → SVG barcode generator, shared
// by every client's label-printing screen so all three render identical,
// scannable barcodes. Subset B covers ASCII 32–126 (digits, upper/lowercase,
// punctuation) — enough for any product barcode/SKU we generate.

// Bar/space module-width patterns for code values 0–106. Each string is six
// module widths, alternating bar,space,bar,space,bar,space (starts on a bar).
// This is the canonical Code 128 table.
const PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "233111",
];
const START_B = 104;
const STOP = 106;
const STOP_BAR = "2331112"; // 106 pattern + final terminating bar

export interface Code128Options {
  /** Width in px of one narrow module. Default 2. */
  moduleWidth?: number;
  /** Bar height in px. Default 60. */
  height?: number;
}

/** Returns the module-width string for the whole symbol (start, data, checksum,
 * stop), or null if the value contains a character outside Code 128 subset B. */
function encode(value: string): string | null {
  const codes: number[] = [START_B];
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code > 126) return null;
    codes.push(code - 32);
  }
  // Checksum: (start + Σ value_i × position_i) mod 103, positions from 1.
  let sum = START_B;
  for (let i = 1; i < codes.length; i++) sum += codes[i] * i;
  codes.push(sum % 103);
  codes.push(STOP);

  let widths = "";
  for (const code of codes) widths += code === STOP ? STOP_BAR : PATTERNS[code];
  return widths;
}

/** Renders `value` as a self-contained SVG string (a Code 128 barcode). Returns
 * null if the value can't be encoded — callers should fall back to plain text. */
export function code128Svg(value: string, opts: Code128Options = {}): string | null {
  const widths = encode(value);
  if (!widths) return null;
  const mw = opts.moduleWidth ?? 2;
  const height = opts.height ?? 60;

  let x = 0;
  let bar = true; // patterns always start on a bar
  const rects: string[] = [];
  for (const digit of widths) {
    const w = Number(digit) * mw;
    if (bar) rects.push(`<rect x="${x}" y="0" width="${w}" height="${height}" fill="#000"/>`);
    x += w;
    bar = !bar;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${x}" height="${height}" viewBox="0 0 ${x} ${height}">${rects.join("")}</svg>`;
}

/** Total pixel width of the rendered symbol — handy for layout. 0 if unencodable. */
export function code128Width(value: string, moduleWidth = 2): number {
  const widths = encode(value);
  if (!widths) return 0;
  let total = 0;
  for (const digit of widths) total += Number(digit) * moduleWidth;
  return total;
}
