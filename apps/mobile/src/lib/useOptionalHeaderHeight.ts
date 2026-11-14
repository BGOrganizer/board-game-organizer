import { HeaderHeightContext } from "expo-router/react-navigation";
import { useContext } from "react";

export function useOptionalHeaderHeight(): number {
  // Portal-hosted inputs may live outside the screen's header context.
  return useContext(HeaderHeightContext) ?? 0;
}
