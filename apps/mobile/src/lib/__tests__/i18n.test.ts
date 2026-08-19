import { describe, expect, it, vi } from "vitest";
import { createAppI18n, getDeviceLocale, normalizeLocale, translate } from "../i18n";

vi.mock("expo-localization", () => ({
  getLocales: () => [{ languageCode: "it-IT" }],
}));

describe("normalizeLocale", () => {
  it("maps supported tags and falls back to en", () => {
    expect(normalizeLocale("en")).toBe("en");
    expect(normalizeLocale("en-US")).toBe("en");
    expect(normalizeLocale("it")).toBe("it");
    expect(normalizeLocale("it-IT")).toBe("it");
    expect(normalizeLocale("de")).toBe("en");
    expect(normalizeLocale(null)).toBe("en");
    expect(normalizeLocale(undefined)).toBe("en");
  });
});

describe("getDeviceLocale", () => {
  it("returns the device language code normalized", () => {
    expect(getDeviceLocale()).toBe("it");
  });
});

describe("createAppI18n", () => {
  it("creates an instance preloaded with the requested locale", () => {
    const i18n = createAppI18n("it");
    expect(i18n.locale).toBe("it");
    // Compiled catalogs use hashed ids, so assert on the translated VALUES.
    const italian = Object.values(i18n.messages as Record<string, string[]>)
      .flat()
      .join("\n");
    expect(italian).toContain("Esci");
    expect(italian).toContain("Benvenuto in Board Game Organizer");
  });

  it("loads different catalogs per locale", () => {
    const en = createAppI18n("en");
    const it = createAppI18n("it");
    const flat = (i: ReturnType<typeof createAppI18n>) =>
      Object.values(i.messages as Record<string, string[]>)
        .flat()
        .join("\n");
    expect(flat(en)).toContain("Logout");
    expect(flat(it)).not.toContain("Logout");
  });

  it("defaults to the device locale", () => {
    const i18n = createAppI18n();
    expect(i18n.locale).toBe("it");
  });
});

describe("translate (runtime)", () => {
  it("resolves the shared catalog id from the English source", () => {
    const it = createAppI18n("it");
    expect(translate(it, "Sign in")).toBe("Accedi");
    expect(translate(it, "Logout")).toBe("Esci");
    expect(translate(it, "Profile")).toBe("Profilo");
  });

  it("falls back to the English source when the catalog has no entry", () => {
    const en = createAppI18n("en");
    expect(translate(en, "Some untranslated string")).toBe("Some untranslated string");
  });
});
