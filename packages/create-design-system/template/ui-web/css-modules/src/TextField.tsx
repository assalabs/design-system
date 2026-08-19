"use client";

import { Field } from "@base-ui/react/field";
import type { ComponentProps, ReactNode } from "react";
import styles from "./components.module.css";

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
    <Field.Root className={styles.field} invalid={Boolean(error)}>
      <Field.Label className={styles.label}>{label}</Field.Label>
      <Field.Control {...controlProps} className={styles.input} />
      {description ? (
        <Field.Description className={styles.supportingText}>
          {description}
        </Field.Description>
      ) : null}
      {error ? (
        <Field.Error className={styles.errorText} match={true}>
          {error}
        </Field.Error>
      ) : null}
    </Field.Root>
  );
}
