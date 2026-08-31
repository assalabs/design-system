"use client";

import { Button as BaseButton } from "@base-ui/react/button";
import * as stylex from "@stylexjs/stylex";
import type { ComponentProps } from "react";
import { classNames } from "./classNames";
import { styles } from "./styles.stylex";

type BaseButtonProps = ComponentProps<typeof BaseButton>;

export type ButtonProps = Omit<BaseButtonProps, "className"> & {
  className?: string;
  variant?: "primary" | "secondary";
};

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonProps) {
  const generated = stylex.props(
    styles.button,
    variant === "primary" ? styles.buttonPrimary : styles.buttonSecondary,
  );

  return (
    <BaseButton
      {...props}
      {...generated}
      className={classNames(generated.className, className)}
    />
  );
}
