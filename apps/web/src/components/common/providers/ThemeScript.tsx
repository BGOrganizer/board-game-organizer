"use client";

import { useEffect } from "react";

/**
 * Follows the OS color scheme and toggles the `.dark` class on <html>
 * (HeroUI v3 uses a class-based dark variant).
 */
export function ThemeScript() {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => document.documentElement.classList.toggle("dark", media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
  return null;
}
