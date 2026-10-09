import { SearchField } from "heroui-native/search-field";
import type { ComponentProps, ReactNode } from "react";
import { useT } from "@/lib/i18n";

export function SearchInput({
  value,
  onChange,
  label,
  placeholder,
  testID,
  maxLength,
  inputStyle,
  clearButtonStyle,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
  testID?: string;
  maxLength?: number;
  inputStyle?: ComponentProps<typeof SearchField.Input>["style"];
  clearButtonStyle?: ComponentProps<typeof SearchField.ClearButton>["style"];
  children?: ReactNode;
}) {
  const t = useT();
  return (
    <SearchField value={value} onChange={onChange}>
      <SearchField.Group>
        <SearchField.SearchIcon />
        <SearchField.Input
          testID={testID}
          accessibilityLabel={label}
          placeholder={placeholder}
          maxLength={maxLength}
          style={inputStyle}
        />
        {value ? (
          <SearchField.ClearButton
            accessibilityLabel={t("Clear search")}
            style={clearButtonStyle}
          />
        ) : null}
        {children}
      </SearchField.Group>
    </SearchField>
  );
}
