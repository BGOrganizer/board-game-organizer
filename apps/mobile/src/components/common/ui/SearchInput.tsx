import { SearchField } from "heroui-native/search-field";
import type { ComponentProps, ReactNode } from "react";
import { useT } from "@/lib/i18n";
import { useInputFocus } from "@/lib/useInputFocus";

export function SearchInput({
  value,
  onChange,
  label,
  placeholder,
  clearLabel,
  testID,
  maxLength,
  inputStyle,
  clearButtonStyle,
  onFocus,
  onBlur,
  isInvalid = false,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
  clearLabel?: string;
  testID?: string;
  maxLength?: number;
  inputStyle?: ComponentProps<typeof SearchField.Input>["style"];
  clearButtonStyle?: ComponentProps<typeof SearchField.ClearButton>["style"];
  onFocus?: ComponentProps<typeof SearchField.Input>["onFocus"];
  onBlur?: ComponentProps<typeof SearchField.Input>["onBlur"];
  children?: ReactNode;
  isInvalid?: boolean;
}) {
  const t = useT();
  const focus = useInputFocus({ onFocus, onBlur, isInvalid });
  return (
    <SearchField value={value} onChange={onChange} isInvalid={isInvalid}>
      <SearchField.Group>
        <SearchField.SearchIcon />
        <SearchField.Input
          testID={testID}
          accessibilityLabel={label}
          autoCorrect={false}
          autoCapitalize="none"
          placeholder={placeholder}
          maxLength={maxLength}
          style={inputStyle}
          {...focus}
        />
        <SearchField.ClearButton
          accessibilityLabel={clearLabel ?? t("Clear search")}
          style={clearButtonStyle}
        />
        {children}
      </SearchField.Group>
    </SearchField>
  );
}
