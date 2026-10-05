# StockFlow brand mark

Teal box (stock) + amber "flow" arrow. Deliberately distinct from HouseBudget's
indigo house mark — don't reuse indigo `#6366F1` for the StockFlow logo.

- Teal gradient `#2DD4BF` → `#0F766E`, faces white / `#E6FFFB` / `#99F6E4`, arrow `#FBBF24`.
- `generate.mjs` is the single source of truth; it writes every SVG here.

## Regenerate everything

```bash
node branding/generate.mjs
cd apps/desktop
npx tauri icon ../../branding/logo.svg                     # all desktop icons (src-tauri/icons)
npx tauri icon ../../branding/logo.svg -o ../../tmp/logo -p 1024 -p 180 -p 48
npx tauri icon ../../branding/android-foreground.svg -o ../../tmp/fg -p 1024
npx tauri icon ../../branding/android-background.svg -o ../../tmp/bg -p 1024
npx tauri icon ../../branding/android-monochrome.svg -o ../../tmp/mono -p 1024
```

Then copy:
- `logo.svg` → `apps/web/public/favicon.svg`, `apps/desktop/public/favicon.svg`; 180px → `apple-touch-icon.png` in both
- 1024 logo → `apps/mobile/assets/images/icon.png` + `splash-icon.png`; 48px → `favicon.png`
- fg/bg/mono 1024 → `apps/mobile/assets/images/android-icon-{foreground,background,monochrome}.png`

Mobile's `android/` folder is generated (gitignored): run `npx expo prebuild --clean`
before the next native build so the launcher icons are regenerated.
