// Generates the StockFlow brand SVGs from one geometry.
// Run: node branding/generate.mjs   (then rasterize — see branding/README.md)
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const out = dirname(fileURLToPath(import.meta.url));
const TEAL_A = "#2DD4BF", TEAL_B = "#0F766E", AMBER = "#FBBF24";

// Isometric cube on a 1024 canvas, centered on (cx, cy) with "radius" r.
function cube(cx, cy, r, gap) {
  const h = r * Math.sqrt(3) / 2;
  const T = [cx, cy - r], UR = [cx + h, cy - r / 2], LR = [cx + h, cy + r / 2];
  const B = [cx, cy + r], LL = [cx - h, cy + r / 2], UL = [cx - h, cy - r / 2], C = [cx, cy];
  const faces = { top: [T, UR, C, UL], left: [UL, C, B, LL], right: [C, UR, LR, B] };
  // Inset each face by gap/2 (offset every edge inward, re-intersect).
  const inset = (poly, d) => {
    const n = poly.length, lines = [];
    // signed area → orientation
    let a = 0; for (let i = 0; i < n; i++) { const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % n]; a += x1 * y2 - x2 * y1; }
    const s = a > 0 ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % n];
      const len = Math.hypot(x2 - x1, y2 - y1), nx = (-(y2 - y1) / len) * s, ny = ((x2 - x1) / len) * s;
      lines.push([[x1 + nx * d, y1 + ny * d], [x2 + nx * d, y2 + ny * d]]);
    }
    return lines.map((l, i) => {
      const [[x1, y1], [x2, y2]] = lines[(i + n - 1) % n], [[x3, y3], [x4, y4]] = l;
      const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
      const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
      return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
    });
  };
  const pts = (p) => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const out = {};
  for (const [k, p] of Object.entries(faces)) out[k] = pts(inset(p, gap / 2));
  return out;
}

// Rounded corners: stroke each face in its own colour with round joins; the
// polygon is pre-shrunk by half the stroke so the outer size is unchanged.
function mark({ cx = 512, cy = 512, r = 300, gap = 34, round = 40, mono = false, arc = true }) {
  const f = cube(cx, cy, r - round / 2, gap + round);
  const face = (p, fill) =>
    `<polygon points="${p}" fill="${fill}" stroke="${fill}" stroke-width="${round}" stroke-linejoin="round"/>`;
  const top = "#FFFFFF", left = mono ? "#FFFFFF" : "#E6FFFB", right = mono ? "#FFFFFF" : "#99F6E4";
  let s = face(f.top, top) + face(f.left, left) + face(f.right, right);
  if (arc) {
    // "Flow" arc sweeping under the box from lower-left round to the right, arrow head up.
    const R = r * 1.24, a0 = 152, a1 = 18;
    const p = (deg) => [cx + R * Math.cos((deg * Math.PI) / 180), cy + R * Math.sin((deg * Math.PI) / 180)];
    const [x0, y0] = p(a0), [x1, y1] = p(a1);
    const col = mono ? "#FFFFFF" : AMBER, w = r * 0.155;
    s += `<path d="M${x0.toFixed(1)} ${y0.toFixed(1)} A${R} ${R} 0 0 0 ${x1.toFixed(1)} ${y1.toFixed(1)}" fill="none" stroke="${col}" stroke-width="${w.toFixed(1)}" stroke-linecap="round"/>`;
    // arrow head at the end, pointing along the tangent (counter-clockwise → upward-ish)
    const t = ((a1 - 90) * Math.PI) / 180, hl = w * 2.1, hw = w * 1.55;
    const tx = Math.cos(t), ty = Math.sin(t), nx = -ty, ny = tx;
    const tip = [x1 + tx * hl * 0.75, y1 + ty * hl * 0.75];
    const b1 = [x1 - tx * hl * 0.25 + nx * hw, y1 - ty * hl * 0.25 + ny * hw];
    const b2 = [x1 - tx * hl * 0.25 - nx * hw, y1 - ty * hl * 0.25 - ny * hw];
    s += `<polygon points="${[tip, b1, b2].map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}" fill="${col}" stroke="${col}" stroke-width="${(w * 0.35).toFixed(1)}" stroke-linejoin="round"/>`;
  }
  return s;
}

const grad = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${TEAL_A}"/><stop offset="1" stop-color="${TEAL_B}"/></linearGradient></defs>`;
const svg = (body, defs = "") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${defs}${body}</svg>\n`;

const files = {
  // Rounded-square app icon (desktop, web favicon, mobile legacy icon + splash).
  "logo.svg": svg(`<rect width="1024" height="1024" rx="230" fill="url(#g)"/>` + mark({ cy: 462, r: 300 }), grad),
  // Full-bleed square (OS applies its own mask).
  "logo-square.svg": svg(`<rect width="1024" height="1024" fill="url(#g)"/>` + mark({ cy: 462, r: 300 }), grad),
  // Android adaptive icon layers — mark kept inside the ~61% safe zone.
  "android-foreground.svg": svg(mark({ cy: 488, r: 196 })),
  "android-background.svg": svg(`<rect width="1024" height="1024" fill="url(#g)"/>`, grad),
  "android-monochrome.svg": svg(mark({ cy: 488, r: 196, mono: true })),
};
for (const [name, content] of Object.entries(files)) writeFileSync(join(out, name), content);
console.log("wrote", Object.keys(files).join(", "));
