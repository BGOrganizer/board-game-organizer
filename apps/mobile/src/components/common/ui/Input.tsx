import { Input as HeroInput } from "heroui-native/input";
import type { ComponentProps } from "react";
import { useInputFocus } from "@/lib/useInputFocus";

/** HeroUI input with the same focus/validation behavior as search and name fields. */
export function Input({ ref, onFocus, onBlur, ...props }: ComponentProps<typeof HeroInput>) {
  const focus = useInputFocus({ ref, onFocus, onBlur, isInvalid: props.isInvalid });
  return <HeroInput {...props} {...focus} />;
}
