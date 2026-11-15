import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { ArrowLeft } from "lucide-react-native";
import { useT } from "@/lib/i18n";
import { HEADER_ICON_SIZE, headerButtonProps } from "./headerStyles";

/** Explicitly reset merged screen options after inline pickers, retaining native goBack guards. */
export function headerBackOptions(onBack: () => void) {
  return {
    headerBackVisible: false,
    headerLeft: ({ canGoBack }: { canGoBack?: boolean }) =>
      canGoBack ? <HeaderBackButton onPress={onBack} /> : null,
  };
}

export function HeaderBackButton({
  onPress,
  label,
  disabled,
}: {
  onPress: () => void;
  label?: string;
  disabled?: boolean;
}) {
  const t = useT();
  const foreground = useThemeColor("foreground");
  return (
    <Button
      {...headerButtonProps}
      variant="ghost"
      accessibilityLabel={label ?? t("Back")}
      isDisabled={disabled}
      onPress={onPress}
    >
      <ArrowLeft size={HEADER_ICON_SIZE} color={foreground} accessible={false} />
    </Button>
  );
}
