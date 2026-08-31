import type { ReactNode } from "react";
import { Pressable, Text, type PressableProps } from "react-native";
import { styles } from "./styles";

export type ButtonProps = Omit<PressableProps, "children" | "style"> & {
  children: ReactNode;
  variant?: "primary" | "secondary";
};

export function Button({
  children,
  disabled,
  variant = "primary",
  ...props
}: ButtonProps) {
  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        variant === "primary" ? styles.buttonPrimary : styles.buttonSecondary,
        pressed && styles.buttonPressed,
        disabled && styles.buttonDisabled,
      ]}
    >
      <Text
        style={[
          styles.buttonLabel,
          variant === "secondary" && styles.buttonSecondaryLabel,
        ]}
      >
        {children}
      </Text>
    </Pressable>
  );
}
