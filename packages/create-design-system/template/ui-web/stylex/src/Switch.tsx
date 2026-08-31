"use client";

import { Switch as BaseSwitch } from "@base-ui/react/switch";
import * as stylex from "@stylexjs/stylex";
import type { ComponentProps, ReactNode } from "react";
import { styles } from "./styles.stylex";

type RootProps = ComponentProps<typeof BaseSwitch.Root>;

export type SwitchProps = Omit<RootProps, "className"> & {
  label: ReactNode;
};

export function Switch({ label, ...props }: SwitchProps) {
  return (
    <label {...stylex.props(styles.controlLabel)}>
      <BaseSwitch.Root
        {...props}
        className={(state) =>
          stylex.props(styles.switch, state.checked && styles.switchChecked)
            .className
        }
      >
        <BaseSwitch.Thumb
          className={(state) =>
            stylex.props(
              styles.switchThumb,
              state.checked && styles.switchThumbChecked,
            ).className
          }
        />
      </BaseSwitch.Root>
      <span>{label}</span>
    </label>
  );
}
