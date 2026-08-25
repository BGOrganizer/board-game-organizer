import { describe, expect, it } from "vitest";
import { detectLocaleFromHeaders, normalizeLocale } from "../i18n";

describe("normalizeLocale", () => {
  it("maps supported tags to the app locale", () => {
    expect(normalizeLocale("en")).toBe("en");
    expect(normalizeLocale("en-US")).toBe("en");
    expect(normalizeLocale("it")).toBe("it");
    expect(normalizeLocale("it-IT")).toBe("it");
  });

  it("falls back to en for unsupported or missing values", () => {
    expect(normalizeLocale("de")).toBe("en");
    expect(normalizeLocale("fr-FR")).toBe("en");
    expect(normalizeLocale(null)).toBe("en");
    expect(normalizeLocale(undefined)).toBe("en");
    expect(normalizeLocale("")).toBe("en");
  });

  it("is case-insensitive", () => {
    expect(normalizeLocale("IT")).toBe("it");
    expect(normalizeLocale("En-GB")).toBe("en");
  });
});

describe("detectLocaleFromHeaders", () => {
  it("prefers a supported language in q-value order", () => {
    expect(detectLocaleFromHeaders("de-DE,de;q=0.9,it;q=0.8,en;q=0.7")).toBe("it");
    expect(detectLocaleFromHeaders("en-US,en;q=0.9")).toBe("en");
    expect(detectLocaleFromHeaders("it-IT,it;q=0.9,en;q=0.8")).toBe("it");
  });

  it("respects q=0 exclusions", () => {
    expect(detectLocaleFromHeaders("it;q=0.9,en;q=0")).toBe("it");
    expect(detectLocaleFromHeaders("it;q=0,en-US;q=0.8")).toBe("en");
  });

  it("falls back to en for missing or unsupported headers", () => {
    expect(detectLocaleFromHeaders(null)).toBe("en");
    expect(detectLocaleFromHeaders(undefined)).toBe("en");
    expect(detectLocaleFromHeaders("")).toBe("en");
    expect(detectLocaleFromHeaders("fr-FR,fr;q=0.9")).toBe("en");
  });

  it("ignores malformed q-values", () => {
    expect(detectLocaleFromHeaders("it;q=abc,en;q=0.9")).toBe("en");
  });
});
