import { Button } from "heroui-native/button";
import type { ComponentProps } from "react";
import type { GestureResponderEvent } from "react-native";
import { useFormInteraction } from "./FormInteractionScope";

export function FormSubmitButton({
  onPress,
  ...props
}: ComponentProps<typeof Button> & { onPress?: (event: GestureResponderEvent) => void }) {
  const form = useFormInteraction();
  return (
    <Button
      {...props}
      onPress={(event) => {
        onPress?.(event);
        form?.requestFirstError();
      }}
    />
  );
}
