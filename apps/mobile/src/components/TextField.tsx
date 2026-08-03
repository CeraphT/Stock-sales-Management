import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, TextInput, View, type TextInputProps } from 'react-native';

import { useThemeColors } from '@/lib/theme/colors';

interface TextFieldProps extends TextInputProps {
  label: string;
}

/** Mirrors the MAUI client's FormField control: a caption label above a
 * bordered input, same visual language on both clients during the
 * transition. When `secureTextEntry` is passed, shows a show/hide toggle
 * inside the field instead of a bare masked input. */
export function TextField({ label, secureTextEntry, ...inputProps }: TextFieldProps) {
  const [visible, setVisible] = useState(false);
  const isPassword = !!secureTextEntry;
  const colors = useThemeColors();

  return (
    <View className="gap-1.5">
      <Text className="text-xs font-bold uppercase tracking-wide text-text-secondary">{label}</Text>
      <View className="justify-center">
        <TextInput
          className={`rounded-xl border border-border bg-background px-3.5 py-3 text-base text-text-primary ${isPassword ? 'pr-11' : ''}`}
          placeholderTextColor={colors.placeholder}
          secureTextEntry={isPassword && !visible}
          {...inputProps}
        />
        {isPassword ? (
          <Pressable
            onPress={() => setVisible((v) => !v)}
            hitSlop={8}
            accessibilityLabel={visible ? 'Hide password' : 'Show password'}
            className="absolute right-3 h-6 w-6 items-center justify-center">
            <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.iconMuted} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
