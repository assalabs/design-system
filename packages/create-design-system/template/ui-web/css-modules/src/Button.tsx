"use client";

import { Button as BaseButton } from "@base-ui/react/button";
import type { ComponentProps } from "react";
import { classNames } from "./classNames";
import styles from "./components.module.css";

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
  return (
    <BaseButton
      {...props}
      className={classNames(
        styles.button,
        variant === "primary" ? styles.buttonPrimary : styles.buttonSecondary,
        className,
      )}
    />
  );
}
