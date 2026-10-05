import { Image } from 'react-native';

/**
 * The StockFlow product mark (teal box + amber flow arrow) — the same image as
 * the app icon. Source of truth is branding/logo.svg at the repo root;
 * regenerate with `node branding/generate.mjs` rather than editing PNGs by hand.
 */
export function BrandLogo({ size = 48 }: { size?: number }) {
  return (
    <Image
      source={require('../../assets/images/icon.png')}
      accessibilityLabel="StockFlow"
      style={{ width: size, height: size, shadowColor: '#0F766E', shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } }}
    />
  );
}
