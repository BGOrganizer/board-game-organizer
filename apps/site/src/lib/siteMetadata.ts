import type { Metadata } from "next";
import { type Locale, translations } from "./copy";

export function siteMetadata(locale: Locale): Metadata {
  return {
    title: "Board Game Organizer",
    description: translations[locale].intro,
    metadataBase: new URL("https://board-game-organizer.com"),
    alternates: {
      canonical: locale === "it" ? "/" : "/en",
      languages: { it: "/", en: "/en", "x-default": "/" },
    },
    icons: { icon: "/images/app-icon.webp" },
    robots:
      process.env.VERCEL_ENV === "preview" || process.env.BGO_NETLIFY_STAGE === "development"
        ? { index: false, follow: false }
        : undefined,
  };
}
