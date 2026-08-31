"use client";

import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import * as stylex from "@stylexjs/stylex";
import type { ComponentProps, ReactNode } from "react";
import { styles } from "./styles.stylex";

type RootProps = ComponentProps<typeof BaseCheckbox.Root>;

export type CheckboxProps = Omit<RootProps, "className"> & {
  label: ReactNode;
};

export function Checkbox({ label, ...props }: CheckboxProps) {
  return (
    <label {...stylex.props(styles.controlLabel)}>
      <BaseCheckbox.Root
        {...props}
        className={(state) =>
          stylex.props(styles.checkbox, state.checked && styles.checkboxChecked)
            .className
        }
      >
        <BaseCheckbox.Indicator>✓</BaseCheckbox.Indicator>
      </BaseCheckbox.Root>
      <span>{label}</span>
    </label>
  );
}
