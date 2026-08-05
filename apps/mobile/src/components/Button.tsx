import { ActivityIndicator, Pressable, Text, type PressableProps } from 'react-native';

import { useThemeColors } from '@/lib/theme/colors';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends Omit<PressableProps, 'children'> {
  title: string;
  variant?: Variant;
  loading?: boolean;
}

// Mirrors desktop's four Button variants (apps/desktop/src/components/Button.tsx)
// so primary/secondary/ghost/danger read the same across clients — keeping the
// larger touch padding for mobile.
const VARIANT: Record<Variant, { container: string; text: string }> = {
  primary: { container: 'bg-primary active:opacity-90', text: 'text-white' },
  secondary: { container: 'border border-primary active:opacity-80', text: 'text-primary' },
  ghost: { container: 'active:opacity-70', text: 'text-text-secondary' },
  danger: { container: 'bg-error active:opacity-90', text: 'text-white' },
};

export function Button({ title, variant = 'primary', loading = false, disabled, ...pressableProps }: ButtonProps) {
  const colors = useThemeColors();
  const v = VARIANT[variant];
  const spinner =
    variant === 'primary' || variant === 'danger' ? '#FFFFFF' : variant === 'secondary' ? colors.primary : colors.textSecondary;
  return (
    <Pressable
      disabled={disabled || loading}
      className={`flex-row items-center justify-center rounded-xl py-4 disabled:opacity-50 ${v.container}`}
      {...pressableProps}>
      {loading ? (
        <ActivityIndicator color={spinner} />
      ) : (
        <Text className={`text-base font-semibold ${v.text}`}>{title}</Text>
      )}
    </Pressable>
  );
}
