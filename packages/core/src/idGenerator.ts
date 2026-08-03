// Injected rather than calling the bare `crypto.randomUUID()` global
// directly — its availability/ABI is inconsistent across Hermes builds on
// React Native (crashed the app at boot in Expo Go 57.0.2 on-device), so
// mobile must keep supplying expo-crypto's wrapper. A real browser engine
// (desktop's Tauri webview) can use the standard Web Crypto API directly.
// Same pattern/reasoning as `auth/store.ts`'s `generateDeviceId` parameter.
let generator: (() => string) | null = null;

export function setIdGenerator(fn: () => string) {
  generator = fn;
}

export function generateId(): string {
  if (!generator) {
    throw new Error("ID generator not initialized — call setIdGenerator() at app startup.");
  }
  return generator();
}
