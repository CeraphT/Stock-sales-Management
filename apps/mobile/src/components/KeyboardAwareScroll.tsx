import { cssInterop } from "nativewind";
import type { ScrollViewProps } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

// Let NativeWind's className / contentContainerClassName work on the library's
// scroll view (it isn't a core RN component, so the mappings aren't automatic).
cssInterop(KeyboardAwareScrollView, {
  className: { target: "style" },
  contentContainerClassName: { target: "contentContainerStyle" },
});

/**
 * Backwards-compat no-op. Fields used to call this on focus to ask a custom
 * scroll view to reveal them; the keyboard-controller library now handles that
 * natively for every input inside <KeyboardAwareScroll>, so it does nothing.
 */
export function useKeyboardScroll(): null {
  return null;
}

type Props = ScrollViewProps & { extraOffset?: number };

/**
 * A ScrollView that keeps the focused text field (and the buttons below it)
 * visible above the on-screen keyboard. Backed by react-native-keyboard-controller,
 * which works correctly under the New Architecture and Android edge-to-edge —
 * where the OS no longer resizes the window for the keyboard. Drop-in for a
 * ScrollView; every <Field> inside is handled automatically.
 */
export function KeyboardAwareScroll({
  extraOffset = 28,
  keyboardShouldPersistTaps = "handled",
  children,
  ...rest
}: Props) {
  return (
    <KeyboardAwareScrollView
      bottomOffset={extraOffset}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      {...rest}
    >
      {children}
    </KeyboardAwareScrollView>
  );
}

/**
 * For a FlatList whose screen has text fields (search, inline forms): pass as
 * `renderScrollComponent` so the list, too, can scroll its rows out from under
 * the keyboard instead of leaving them hidden behind it.
 */
export function renderKeyboardAwareScroll(props: ScrollViewProps) {
  return <KeyboardAwareScroll {...props} />;
}
