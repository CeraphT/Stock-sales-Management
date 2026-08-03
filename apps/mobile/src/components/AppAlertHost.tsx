import { Modal, Pressable, Text, View } from 'react-native';

import { useAlertStore, type AlertButton } from '@/lib/ui/alertStore';
import { useThemeColors } from '@/lib/theme/colors';

/** Renders whatever alert `showAlert()` most recently set, as a themed
 * card modal instead of the OS's native (always-dark) Alert dialog.
 * Mounted once at the root layout.
 *
 * Colors are resolved via `useThemeColors()` and applied as inline
 * `style`/`color` props rather than `dark:`-variant classNames — RN's
 * `Modal` renders its children into a separate native surface, and
 * NativeWind's className-driven color resolution doesn't reliably reach
 * across that boundary, which was leaving title/message/button text
 * unreadable (e.g. dark text on a dark surface) regardless of theme. */
export function AppAlertHost() {
  const visible = useAlertStore((s) => s.visible);
  const title = useAlertStore((s) => s.title);
  const message = useAlertStore((s) => s.message);
  const buttons = useAlertStore((s) => s.buttons);
  const hide = useAlertStore((s) => s.hide);
  const colors = useThemeColors();

  const onPress = (button: AlertButton) => {
    hide();
    button.onPress?.();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={hide} statusBarTranslucent>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 32 }}>
        <View
          style={{ width: '100%', maxWidth: 384, borderRadius: 16, padding: 20, backgroundColor: colors.surface }}
          className="shadow-lg shadow-black/20">
          <Text style={{ fontSize: 16, fontWeight: 'bold', color: colors.textPrimary }}>{title}</Text>
          {message ? (
            <Text style={{ marginTop: 8, fontSize: 14, lineHeight: 20, color: colors.textSecondary }}>{message}</Text>
          ) : null}
          <View style={{ marginTop: 20, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
            {buttons.map((button, index) => {
              const textColor =
                button.style === 'destructive' ? colors.error : button.style === 'cancel' ? colors.textSecondary : colors.primary;
              return (
                <Pressable
                  key={`${button.text}-${index}`}
                  onPress={() => onPress(button)}
                  style={{ borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: textColor }}>{button.text}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}
