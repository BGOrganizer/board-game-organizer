import { Button, type ButtonVariant } from "heroui-native/button";
import type { ReactNode } from "react";
import { FLOATING_ACTION_SIZE } from "@/lib/floating-actions";
import { useT } from "@/lib/i18n";
import { useFloatingActionLayout } from "@/lib/useFloatingActionLayout";

interface FloatingActionsProps {
  children: ReactNode;
  label: string;
  testID?: string;
  onPress?: () => void;
  isDisabled?: boolean;
  variant?: ButtonVariant;
  left?: boolean;
}

export function FloatingActions({
  children,
  label,
  testID,
  onPress,
  isDisabled = false,
  variant,
  left,
}: FloatingActionsProps) {
  const t = useT();
  const layout = useFloatingActionLayout();

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
        bottom: layout.bottom,
        width: FLOATING_ACTION_SIZE,
        height: FLOATING_ACTION_SIZE,
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
