import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/ScreenBackground';
import { ApiError } from '@/lib/api/client';
import { useAuthStore } from '@/lib/auth/store';
import { useCartStore } from '@/lib/cart/store';
import { localCatalogQueryService } from '@/lib/local/catalogQueryService';
import { useScanCaptureStore } from '@/lib/scan/captureStore';
import { useThemeColors } from '@/lib/theme/colors';

const RESCAN_COOLDOWN_MS = 2000;
// A single misread camera frame (blur, glare, an odd angle) can report a
// checksum-valid but wrong code, especially on weaker-checksum formats.
// Requiring the same value on two consecutive detection frames before
// acting on it — standard practice for camera-based scanners — filters
// almost all of those out at the cost of a barely-perceptible delay.
const CONFIRM_READS = 2;

// Broad on purpose — real-world test items can be any format. The actual
// fix for "matched the wrong product" is findByBarcode()'s exact-only
// lookup below (no fuzzy name fallback), not narrowing formats: an
// occasional false-positive read off a weaker-checksum format (Code39/
// Codabar/ITF-14) now just misses (no product has that exact code) rather
// than silently matching an unrelated product by name substring.
const BARCODE_TYPES = [
  'ean13',
  'ean8',
  'upc_a',
  'upc_e',
  'code128',
  'code39',
  'code93',
  'itf14',
  'codabar',
  'qr',
] as const;

export default function ScannerScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const isCapture = mode === 'capture';

  const companyId = useAuthStore((s) => s.companyId);
  const addLine = useCartStore((s) => s.addLine);
  const setCapturedCode = useScanCaptureStore((s) => s.setCode);
  const colors = useThemeColors();

  const [permission, requestPermission] = useCameraPermissions();
  const [banner, setBanner] = useState<{ text: string; tone: 'success' | 'error' } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const lastScan = useRef<{ code: string; at: number } | null>(null);
  const pending = useRef<{ code: string; count: number } | null>(null);
  const busy = useRef(false);

  const onScanned = async (result: BarcodeScanningResult) => {
    const code = result.data;
    if (busy.current) return;

    // Require the same code on two consecutive frames before acting on it
    // — see CONFIRM_READS above.
    if (pending.current?.code === code) {
      pending.current.count += 1;
    } else {
      pending.current = { code, count: 1 };
    }
    if (pending.current.count < CONFIRM_READS) {
      setConfirming(true);
      return;
    }
    pending.current = null;
    setConfirming(false);

    // Capture mode: hand the raw code straight back to whichever form
    // opened the scanner (e.g. Add product's barcode field) — no product
    // lookup, no cart interaction.
    if (isCapture) {
      busy.current = true;
      setCapturedCode(code);
      router.back();
      return;
    }

    const now = Date.now();
    if (lastScan.current && lastScan.current.code === code && now - lastScan.current.at < RESCAN_COOLDOWN_MS) return;
    lastScan.current = { code, at: now };

    if (!companyId) return;
    busy.current = true;
    try {
      const product = await localCatalogQueryService.findByBarcode(companyId, code);
      addLine(
        {
          key: `${product.productId}:base`,
          productId: product.productId,
          productName: product.name,
          packagingLevelId: null,
          packagingLevelName: null,
          unitPrice: product.salePrice,
        },
        1,
      );
      setBanner({ text: `Added: ${product.name}`, tone: 'success' });
    } catch (err) {
      const message = err instanceof ApiError && err.status === 404 ? `No product for "${code}"` : 'Lookup failed.';
      setBanner({ text: message, tone: 'error' });
    } finally {
      busy.current = false;
      setTimeout(() => setBanner(null), 1800);
    }
  };

  if (!permission) {
    return <View className="flex-1 bg-black" />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center gap-4 bg-background px-8">
        <ScreenBackground />
        <Ionicons name="camera-outline" size={40} color={colors.iconMuted} />
        <Text className="text-center text-base font-semibold text-text-primary">Camera access needed</Text>
        <Text className="text-center text-sm text-text-secondary">
          StockFlow needs camera access to scan product barcodes.
        </Text>
        <Pressable onPress={requestPermission} className="rounded-xl bg-primary px-6 py-3">
          <Text className="text-sm font-semibold text-white">Grant permission</Text>
        </Pressable>
        <Pressable onPress={() => router.back()}>
          <Text className="text-sm font-semibold text-text-secondary">Cancel</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        autofocus="on"
        enableTorch={torchOn}
        barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
        onBarcodeScanned={onScanned}
      />

      <SafeAreaView className="absolute inset-x-0 top-0" edges={['top']}>
        <View className="flex-row items-center justify-between px-4 py-3">
          <Pressable
            onPress={() => router.back()}
            className="h-10 w-10 items-center justify-center rounded-full bg-black/50">
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </Pressable>
          <Text className="text-sm font-semibold text-white">{isCapture ? 'Scan barcode / QR' : 'Scan to add'}</Text>
          <Pressable
            onPress={() => setTorchOn((v) => !v)}
            accessibilityLabel="Toggle flashlight"
            className="h-10 w-10 items-center justify-center rounded-full bg-black/50">
            <Ionicons name={torchOn ? 'flash' : 'flash-outline'} size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      </SafeAreaView>

      <View pointerEvents="none" className="absolute inset-0 items-center justify-center gap-3">
        <View className={`h-56 w-72 rounded-2xl border-2 ${confirming ? 'border-accent-amber' : 'border-white/80'}`} />
        {confirming ? <Text className="text-sm font-semibold text-white">Hold steady…</Text> : null}
      </View>

      {banner ? (
        <View className="absolute inset-x-6 bottom-10">
          <View className={`rounded-xl px-4 py-3 ${banner.tone === 'success' ? 'bg-success' : 'bg-error'}`}>
            <Text className="text-center text-sm font-semibold text-white">{banner.text}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}
