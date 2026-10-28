import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, space } from '../lib/theme';

/** Large tap targets for picking one (radio) or several (checkbox) options. */
export function Choices<T extends string>({
  options,
  selected,
  onToggle,
  multiple,
  label,
}: {
  options: readonly { value: T; label: string }[];
  selected: readonly T[];
  onToggle: (value: T) => void;
  multiple?: boolean;
  label: string;
}) {
  return (
    <View style={styles.wrap} accessibilityRole={multiple ? undefined : 'radiogroup'} accessibilityLabel={label}>
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <Pressable
            key={o.value}
            accessibilityRole={multiple ? 'checkbox' : 'radio'}
            aria-checked={on}
            onPress={() => onToggle(o.value)}
            style={[styles.choice, on && styles.choiceOn]}
          >
            <Text style={[styles.text, on && styles.textOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  choice: {
    minHeight: 48,
    paddingHorizontal: space.md,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceOn: { borderColor: colors.primary, backgroundColor: colors.primary },
  text: { fontSize: font.body, fontWeight: '600', color: colors.text },
  textOn: { color: colors.primaryText },
});
