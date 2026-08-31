"use client";

import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import type { ComponentProps, ReactNode } from "react";
import styles from "./components.module.css";

type RootProps = ComponentProps<typeof BaseCheckbox.Root>;

export type CheckboxProps = Omit<RootProps, "className"> & {
  label: ReactNode;
};

export function Checkbox({ label, ...props }: CheckboxProps) {
  return (
    <label className={styles.controlLabel}>
      <BaseCheckbox.Root {...props} className={styles.checkbox}>
        <BaseCheckbox.Indicator>✓</BaseCheckbox.Indicator>
      </BaseCheckbox.Root>
      <span>{label}</span>
    </label>
  );
}
