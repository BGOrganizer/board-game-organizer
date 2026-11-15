"use client";

import { useAppStore } from "@board-game-organizer/store";
import Script from "next/script";
import { useEffect } from "react";

// Static, user-input-free bootstrap runs before hydration: no light flash on a dark device.
const initializeTheme = `try{var d=window.matchMedia('(prefers-color-scheme: dark)').matches;var r=document.documentElement;r.classList.toggle('dark',d);r.dataset.theme=d?'dark':'light'}catch{}`;

/**
 * Follows the OS color scheme and toggles the `.dark` class on <html>
 * (HeroUI v3 uses a class-based dark variant).
 */
export function ThemeScript() {
  const preference = useAppStore((state) => state.themePreference);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = preference === "dark" || (preference === "system" && media.matches);
      document.documentElement.classList.toggle("dark", dark);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preference]);
  return (
    <Script id="bgo-theme" strategy="beforeInteractive">
      {initializeTheme}
    </Script>
  );
}
