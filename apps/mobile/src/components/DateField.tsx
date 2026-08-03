import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Pressable, Text, View } from 'react-native';

interface DateFieldProps {
  label: string;
  /** ISO date string (YYYY-MM-DD) or null if unset. */
  value: string | null;
  onChange: (value: string) => void;
  minimumDate?: Date;
  placeholder?: string;
}

/** Android's native date-picker dialog (Material calendar), wrapped to
 * work with a plain YYYY-MM-DD string — matches every other date field
 * in the app being stored/sent that way. Android-only for now, same as
 * the rest of the client (see CLAUDE.md). */
export function DateField({ label, value, onChange, minimumDate, placeholder = 'Select a date' }: DateFieldProps) {
  const openPicker = () => {
    DateTimePickerAndroid.open({
      value: value ? new Date(`${value}T00:00:00`) : new Date(),
      mode: 'date',
      minimumDate,
      onChange: (_event, date) => {
        if (date) {
          onChange(date.toISOString().slice(0, 10));
        }
      },
    });
  };

  return (
    <View className="gap-1.5">
      <Text className="text-xs font-bold uppercase tracking-wide text-text-secondary">{label}</Text>
      <Pressable onPress={openPicker} className="rounded-xl border border-border bg-background px-3.5 py-3">
        <Text className={value ? 'text-base text-text-primary' : 'text-base text-text-secondary'}>
          {value ?? placeholder}
        </Text>
      </Pressable>
    </View>
  );
}
