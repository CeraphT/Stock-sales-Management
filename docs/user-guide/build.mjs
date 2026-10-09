// Builds the StockFlow user guide (docs/user-guide/index.html) from:
//   - the HouseBudget guide's design system (CSS + script), recoloured for StockFlow,
//     so both guides on guide.mfspace.lu look like one product family
//   - content.html (this folder): the StockFlow sections, FR/EN
// Usage: node docs/user-guide/build.mjs [path to HouseBudget user-guide.html]
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const hbPath = process.argv[2] ?? "C:/Dev/HouseBudget/docs/user-guide.html";
const hb = readFileSync(hbPath, "utf8");
const styles = [...hb.matchAll(/<style[\s\S]*?<\/style>/g)].map((m) => m[0]);
// 1 = base/layout tokens, 2 = mock-up system (browser/phone frames, UI atoms, pins)
let css = styles[0] + "\n" + styles[1];
const script = [...hb.matchAll(/<script[\s\S]*?<\/script>/g)].pop()[0];

// StockFlow palette: teal primary + amber accent (the logo's box and arrow).
const swaps = [
  ["--indigo:#5B5BF0; --indigo-2:#7C5CFC; --indigo-soft:#EEEEFE;", "--indigo:#0F766E; --indigo-2:#14B8A6; --indigo-soft:#E6F4F1;"],
  ["--coral:#E4572E; --coral-soft:#FBE7DF;", "--coral:#F59E0B; --coral-soft:#FEF3DC;"],
  ["--ui-primary:#5B5BF0; --ui-primary-soft:#ECECFE;", "--ui-primary:#0F766E; --ui-primary-soft:#E2F3EF;"],
  ["--ui-bg:#F4F5FA;", "--ui-bg:#F3F7F6;"],
  [/--indigo:#8E8CFB; --indigo-2:#A98CFF; --indigo-soft:#20223B;/g, "--indigo:#2DD4BF; --indigo-2:#5EEAD4; --indigo-soft:#123330;"],
  [/--coral:#FB8A64; --coral-soft:#3A241C;/g, "--coral:#FBBF24; --coral-soft:#3A2E14;"],
  [/linear-gradient\(135deg,#5B5BF0,#7C5CFC\)/g, "linear-gradient(135deg,#2DD4BF,#0F766E)"],
  ["rgba(91,91,240,.5)", "rgba(15,118,110,.45)"],
];
for (const [a, b] of swaps) {
  const before = css;
  css = typeof a === "string" ? css.split(a).join(b) : css.replace(a, b);
  if (css === before) throw new Error(`palette swap did not apply: ${a}`);
}

// Guide-switcher tabs (same URL: / = HouseBudget, /stockflow/ = StockFlow).
css += `
<style>
  .apptabs{display:flex;gap:4px;padding:3px;border:1px solid var(--line-2);border-radius:11px;margin:0 0 14px;background:var(--paper-2)}
  .apptabs a{flex:1;text-align:center;font:600 12px "IBM Plex Sans";color:var(--ink-2);padding:6px 4px;border-radius:8px;white-space:nowrap}
  .apptabs a.on{background:var(--card);color:var(--indigo);box-shadow:var(--shadow)}
  .brand .logo.svg{background:none;box-shadow:none;padding:0}
  .brand .logo.svg img{width:34px;height:34px;display:block}
  .ulogo.sf{background:none}
  .ulogo.sf img{width:100%;height:100%;display:block}
  .kbd{font:600 11.5px "IBM Plex Mono";border:1px solid var(--line-2);border-bottom-width:2px;border-radius:6px;padding:0 6px;background:var(--card)}
  .footerline{margin-top:46px;padding-top:18px;border-top:1px solid var(--line);color:var(--ink-2);font-size:13px;text-align:center}
  @media print{.apptabs{display:none}}
</style>`;

const logo = readFileSync(join(here, "../../apps/web/public/favicon.svg"), "utf8");
const logoUri = "data:image/svg+xml;base64," + Buffer.from(logo).toString("base64");

// content.html holds the frame (menu, intro, section 1); sec-*.html files hold the
// other sections, inserted in file-name order at the <!-- MORE SECTIONS --> marker.
const sections = readdirSync(here).filter((n) => /^sec-.*\.html$/.test(n)).sort()
  .map((n) => readFileSync(join(here, n), "utf8")).join("\n");
const content = readFileSync(join(here, "content.html"), "utf8")
  .replace("<!-- MORE SECTIONS -->", sections)
  .replaceAll("{{LOGO}}", logoUri);

// Callout pins: any element inside a .frame tagged data-pin="N" gets a numbered pin
// on its edge (data-pin-at = right (default) | left | top | center), computed from
// the real layout so pins always point at the right control.
const pinScript = `<script>
  function placePins(){
    document.querySelectorAll('.frame').forEach(function(frame){
      frame.querySelectorAll('.pin.auto').forEach(function(p){p.remove()});
      var fr=frame.getBoundingClientRect();
      frame.querySelectorAll('[data-pin]').forEach(function(el){
        var r=el.getBoundingClientRect(), at=el.getAttribute('data-pin-at')||'right', x, y;
        if(at==='left'){x=r.left-fr.left;y=r.top-fr.top+r.height/2}
        else if(at==='top'){x=r.left-fr.left+r.width/2;y=r.top-fr.top}
        else if(at==='center'){x=r.left-fr.left+r.width/2;y=r.top-fr.top+r.height/2}
        else {x=r.right-fr.left;y=r.top-fr.top+r.height/2}
        var p=document.createElement('span');p.className='pin auto';p.textContent=el.getAttribute('data-pin');
        p.style.left=x+'px';p.style.top=y+'px';frame.appendChild(p);
      });
    });
  }
  window.addEventListener('load',placePins);window.addEventListener('resize',placePins);
  document.fonts&&document.fonts.ready.then(placePins);
  var _setLang=setLang;setLang=function(l){_setLang(l);placePins()};
</script>`;

const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Guide StockFlow</title>
<meta name="description" content="Guide d'utilisation illustré, bilingue FR/EN, de StockFlow : gestion de stock et de ventes (web, bureau et mobile)." />
<link rel="icon" href="${logoUri}" />
${css}
</head>
<body>
${content}
${script.replace(/hb_lang/g, "sf_lang").replace(/hb_theme/g, "sf_theme")}
${pinScript}
</body>
</html>
`;
if (html.includes("—")) throw new Error("em dash found in the guide: use a period, colon or hyphen");
writeFileSync(join(here, "index.html"), html);
console.log(`index.html written (${(html.length / 1024).toFixed(0)} KB)`);
