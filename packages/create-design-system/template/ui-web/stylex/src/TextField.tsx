"use client";

import { Field } from "@base-ui/react/field";
import * as stylex from "@stylexjs/stylex";
import type { ComponentProps, ReactNode } from "react";
import { styles } from "./styles.stylex";

type ControlProps = ComponentProps<typeof Field.Control>;

export type TextFieldProps = Omit<ControlProps, "className"> & {
  description?: ReactNode;
  error?: ReactNode;
  label: ReactNode;
};

export function TextField({
  description,
  error,
  label,
  ...controlProps
}: TextFieldProps) {
  return (
    <Field.Root invalid={Boolean(error)} {...stylex.props(styles.field)}>
      <Field.Label {...stylex.props(styles.label)}>{label}</Field.Label>
      <Field.Control {...controlProps} {...stylex.props(styles.input)} />
      {description ? (
        <Field.Description {...stylex.props(styles.supportingText)}>
          {description}
        </Field.Description>
      ) : null}
      {error ? (
        <Field.Error match={true} {...stylex.props(styles.errorText)}>
          {error}
        </Field.Error>
      ) : null}
    </Field.Root>
  );
}
