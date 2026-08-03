import { ActivityIndicator, Pressable, Text, type PressableProps } from 'react-native';

import { useThemeColors } from '@/lib/theme/colors';

interface ButtonProps extends Omit<PressableProps, 'children'> {
  title: string;
  variant?: 'primary' | 'secondary';
  loading?: boolean;
}

/** Mirrors the MAUI client's Button/SecondaryButton styles. */
export function Button({ title, variant = 'primary', loading = false, disabled, ...pressableProps }: ButtonProps) {
  const isPrimary = variant === 'primary';
  const colors = useThemeColors();
  return (
    <Pressable
      disabled={disabled || loading}
      className={
        isPrimary
          ? 'flex-row items-center justify-center rounded-xl bg-primary py-4 active:opacity-90 disabled:opacity-50'
          : 'flex-row items-center justify-center rounded-xl border border-primary py-4 active:opacity-80 disabled:opacity-50'
      }
      {...pressableProps}>
      {loading ? (
        <ActivityIndicator color={isPrimary ? '#FFFFFF' : colors.primary} />
      ) : (
        <Text className={isPrimary ? 'text-base font-semibold text-white' : 'text-base font-semibold text-primary'}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}
