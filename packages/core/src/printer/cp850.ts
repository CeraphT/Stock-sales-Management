/**
 * Best-effort CP850 (DOS Latin-1) single-byte encoder — mirrors the MAUI
 * client's `Encoding.GetEncoding(850)` used by `ReceiptFormatter.cs`. Only
 * covers the accented characters realistically seen in French/English
 * pharmacy receipt text; anything else outside ASCII falls back to `?`
 * (matching .NET's default unmappable-character behavior). Cheap 58mm
 * printer clones don't always agree on codepage numbering — if accents
 * print wrong on real hardware, this table (and the `ESC t` selector byte
 * in escpos.ts) is the place to retune, same caveat as the original.
 */
const CP850_ABOVE_ASCII: Record<string, number> = {
  "Ç": 0x80, // Ç
  "ü": 0x81, // ü
  "é": 0x82, // é
  "â": 0x83, // â
  "ä": 0x84, // ä
  "à": 0x85, // à
  "å": 0x86, // å
  "ç": 0x87, // ç
  "ê": 0x88, // ê
  "ë": 0x89, // ë
  "è": 0x8a, // è
  "ï": 0x8b, // ï
  "î": 0x8c, // î
  "ì": 0x8d, // ì
  "Ä": 0x8e, // Ä
  "Å": 0x8f, // Å
  "É": 0x90, // É
  "æ": 0x91, // æ
  "Æ": 0x92, // Æ
  "ô": 0x93, // ô
  "ö": 0x94, // ö
  "ò": 0x95, // ò
  "û": 0x96, // û
  "ù": 0x97, // ù
  "ÿ": 0x98, // ÿ
  "Ö": 0x99, // Ö
  "Ü": 0x9a, // Ü
  "ø": 0x9b, // ø
  "£": 0x9c, // £
  "Ø": 0x9d, // Ø
  "¡": 0xad, // ¡
  "á": 0xa0, // á
  "í": 0xa1, // í
  "ó": 0xa2, // ó
  "ú": 0xa3, // ú
  "ñ": 0xa4, // ñ
  "Ñ": 0xa5, // Ñ
  "¿": 0xa8, // ¿
  "®": 0xa9, // ®
  "«": 0xae, // «
  "»": 0xaf, // »
  "À": 0xb7, // À
  "Â": 0xb6, // Â
  "Ê": 0xd2, // Ê
  "Ë": 0xd3, // Ë
  "È": 0xd4, // È
  "Í": 0xd6, // Í
  "Î": 0xd7, // Î
  "Ï": 0xd8, // Ï
  "Ì": 0xde, // Ì
  "Ó": 0xe0, // Ó
  "ß": 0xe1, // ß
  "Ô": 0xe2, // Ô
  "Ò": 0xe3, // Ò
  "õ": 0xe4, // õ
  "Õ": 0xe5, // Õ
  "µ": 0xe6, // µ
  "Ú": 0xe9, // Ú
  "Û": 0xea, // Û
  "Ù": 0xeb, // Ù
  "ý": 0xec, // ý
  "Ý": 0xed, // Ý
  "°": 0xf8, // °
  "±": 0xf1, // ±
};

const FALLBACK_BYTE = 0x3f; // '?'

/** Encodes text to CP850 bytes, ASCII passthrough + the accented-character
 * table above; anything else maps to '?'. */
export function encodeCp850(text: string): number[] {
  const bytes: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? FALLBACK_BYTE;
    if (code < 0x80) {
      bytes.push(code);
    } else {
      bytes.push(CP850_ABOVE_ASCII[ch] ?? FALLBACK_BYTE);
    }
  }
  return bytes;
}
