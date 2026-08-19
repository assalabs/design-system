import { Pressable, Text, View } from "react-native";
import { styles } from "./styles";

export type CheckboxProps = {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
};

export function Checkbox({
  checked,
  disabled,
  label,
  onCheckedChange,
}: CheckboxProps) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onCheckedChange(!checked)}
      style={styles.controlRow}
    >
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked ? <Text style={styles.checkboxMark}>✓</Text> : null}
      </View>
      <Text style={styles.controlLabel}>{label}</Text>
    </Pressable>
  );
}
