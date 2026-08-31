import { Text, TextInput, View, type TextInputProps } from "react-native";
import { styles } from "./styles";

export type TextFieldProps = Omit<TextInputProps, "style"> & {
  description?: string;
  error?: string;
  label: string;
};

export function TextField({
  description,
  error,
  label,
  ...inputProps
}: TextFieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...inputProps}
        accessibilityLabel={inputProps.accessibilityLabel ?? label}
        style={styles.input}
      />
      {description ? (
        <Text style={styles.supportingText}>{description}</Text>
      ) : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}
