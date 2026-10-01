import { Button, type ButtonVariant } from "heroui-native/button";
import type { ReactNode } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "@/lib/i18n";

interface FloatingActionsProps {
  children: ReactNode;
  label: string;
  testID?: string;
  onPress?: () => void;
  extraBottom: number;
  isDisabled?: boolean;
  variant?: ButtonVariant;
  left?: boolean;
}

export function FloatingActions({
  children,
  label,
  testID,
  extraBottom,
  onPress,
  isDisabled = false,
  variant,
  left,
}: FloatingActionsProps) {
  const t = useT();
  const insets = useSafeAreaInsets();

  return (
    <Button
      isIconOnly
      variant={variant}
      accessibilityLabel={t(label)}
      testID={testID}
      onPress={onPress}
      isDisabled={isDisabled}
      style={{
        position: "absolute",
        right: left ? undefined : 20,
        left: left ? 20 : undefined,
        bottom: Math.max(24, insets.bottom + extraBottom),
        width: 56,
        height: 56,
        borderRadius: 28,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#000",
        shadowOpacity: 0.2,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 3 },
        elevation: 6,
      }}
    >
      {children}
    </Button>
  );
}
