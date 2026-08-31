import { Switch as NativeSwitch, Text, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";
import { styles } from "./styles";

export type SwitchProps = {
  disabled?: boolean;
  label: string;
  onValueChange: (value: boolean) => void;
  value: boolean;
};

export function Switch({ disabled, label, onValueChange, value }: SwitchProps) {
  const { theme } = useUnistyles();

  return (
    <View style={styles.controlRow}>
      <NativeSwitch
        accessibilityLabel={label}
        disabled={disabled}
        onValueChange={onValueChange}
        thumbColor={theme.color.surface.card}
        trackColor={{
          false: theme.color.border.default,
          true: theme.color.action.primary.background,
        }}
        value={value}
      />
      <Text style={styles.controlLabel}>{label}</Text>
    </View>
  );
}
