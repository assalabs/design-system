"use client";

import { Switch as BaseSwitch } from "@base-ui/react/switch";
import type { ComponentProps, ReactNode } from "react";
import styles from "./components.module.css";

type RootProps = ComponentProps<typeof BaseSwitch.Root>;

export type SwitchProps = Omit<RootProps, "className"> & {
  label: ReactNode;
};

export function Switch({ label, ...props }: SwitchProps) {
  return (
    <label className={styles.controlLabel}>
      <BaseSwitch.Root {...props} className={styles.switch}>
        <BaseSwitch.Thumb className={styles.switchThumb} />
      </BaseSwitch.Root>
      <span>{label}</span>
    </label>
  );
}
