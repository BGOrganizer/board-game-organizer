"use client";

import { Label, SearchField } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { ComponentProps, ReactNode } from "react";

export function SearchInput({
  value,
  onChange,
  label,
  placeholder,
  clearLabel,
  name,
  inputProps,
  isInvalid = false,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  label: ReactNode;
  placeholder: string;
  clearLabel?: string;
  name?: string;
  inputProps?: Omit<
    ComponentProps<typeof SearchField.Input>,
    "value" | "defaultValue" | "onChange" | "placeholder"
  >;
  children?: ReactNode;
  isInvalid?: boolean;
}) {
  const { t } = useLingui();
  return (
    <SearchField fullWidth name={name} value={value} onChange={onChange} isInvalid={isInvalid}>
      {typeof label === "string" || typeof label === "number" ? <Label>{label}</Label> : label}
      <SearchField.Group>
        <SearchField.SearchIcon />
        <SearchField.Input {...inputProps} placeholder={placeholder} />
        {value ? <SearchField.ClearButton aria-label={clearLabel ?? t`Clear search`} /> : null}
        {/* Independent HeroUI button actions must set slot={null}, not inherit search clear. */}
        {children}
      </SearchField.Group>
    </SearchField>
  );
}
