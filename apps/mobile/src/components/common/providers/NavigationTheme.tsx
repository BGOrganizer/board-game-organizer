import { DarkTheme, DefaultTheme, ThemeProvider } from "expo-router/react-navigation";
import { StatusBar } from "expo-status-bar";
import { useThemeColor } from "heroui-native/hooks";
import type { ReactNode } from "react";
import { useUniwind } from "uniwind";
import { navigationColors } from "@/lib/navigationColors";

/** Bridge navigation chrome and native bars to the same HeroUI theme as screen content. */
export function NavigationTheme({ children }: { children: ReactNode }) {
  const { theme } = useUniwind();
  const [background, foreground, surface, separator, accent, danger] = useThemeColor([
    "background",
    "foreground",
    "surface",
    "separator",
    "accent",
    "danger",
  ]);
  const dark = theme === "dark";
  return (
    <ThemeProvider
      value={{
        ...(dark ? DarkTheme : DefaultTheme),
        colors: navigationColors({ background, foreground, surface, separator, accent, danger }),
      }}
    >
      <StatusBar style={dark ? "light" : "dark"} />
      {children}
    </ThemeProvider>
  );
}
