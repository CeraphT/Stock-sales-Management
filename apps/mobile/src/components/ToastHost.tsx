import { Pressable, Text, View } from 'react-native';

import { useToast, type ToastKind } from '@/lib/ui/toastStore';

// Left accent bar + leading glyph per kind. Body is always surface + text-primary
// for guaranteed contrast in light AND dark (the readability the plain screens
// lacked).
const ACCENT: Record<ToastKind, string> = { success: 'bg-success', error: 'bg-error', info: 'bg-accent-blue' };
const GLYPH: Record<ToastKind, string> = { success: '✓', error: '⚠', info: 'ℹ' };

/** Bottom-anchored transient toasts. Mounted once at the app root so a message
 * overlays everything, including the tab bar. Each toast auto-dismisses (see
 * toastStore) and can be tapped to dismiss early. */
export function ToastHost() {
  const toasts = useToast((s) => s.toasts);
  const dismiss = useToast((s) => s.dismiss);
  if (toasts.length === 0) return null;

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 96 }}>
      {toasts.map((t) => (
        <Pressable key={t.id} onPress={() => dismiss(t.id)}>
          <View
            className="mx-4 mb-2 flex-row overflow-hidden rounded-card border border-border bg-surface"
            style={{ elevation: 6, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }}>
            <View className={`w-1.5 ${ACCENT[t.kind]}`} />
            <View className="flex-1 flex-row items-center gap-2 px-3.5 py-3">
              <Text className="text-base">{GLYPH[t.kind]}</Text>
              <Text className="flex-1 text-sm font-medium text-text-primary">{t.message}</Text>
            </View>
          </View>
        </Pressable>
      ))}
    </View>
  );
}
