import type { Theme } from "expo-router/react-navigation";

/** React Navigation consumes HeroUI's resolved tokens; it owns no separate palette. */
export function navigationColors(colors: {
  background: string;
  foreground: string;
  surface: string;
  separator: string;
  accent: string;
  danger: string;
}): Theme["colors"] {
  return {
    background: colors.background,
    text: colors.foreground,
    card: colors.surface,
    border: colors.separator,
    primary: colors.accent,
    notification: colors.danger,
  };
}
