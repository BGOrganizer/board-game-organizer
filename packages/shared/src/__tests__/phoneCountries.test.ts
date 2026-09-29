import countries from "i18n-iso-countries";
import { describe, expect, it, vi } from "vitest";
import {
  defaultPhoneCountry,
  filterPhoneCountries,
  fullMobileNumber,
  phoneCountries,
} from "../phoneCountries";

describe("phone country prefixes", () => {
  it("provides flags, names and dialing codes for every supported country in both languages", () => {
    const en = phoneCountries("en-US");
    const it = phoneCountries("it-IT");
    expect(en).toHaveLength(245);
    expect(it).toHaveLength(en.length);
    expect(new Set(en.map((country) => country.code)).size).toBe(en.length);
    expect(
      en.every((country) => country.name && country.callingCode.startsWith("+") && country.flag),
    ).toBe(true);
    expect(en.find((country) => country.code === "US")).toMatchObject({
      name: "United States of America",
      callingCode: "+1",
      flag: "🇺🇸",
    });
    expect(en.find((country) => country.code === "CA")?.callingCode).toBe("+1");
    expect(it.find((country) => country.code === "IT")).toMatchObject({
      name: "Italia",
      callingCode: "+39",
      flag: "🇮🇹",
    });
    expect(en.find((country) => country.code === "AC")).toMatchObject({
      name: "Ascension Island",
      flag: "🇸🇭",
    });
    expect(it.find((country) => country.code === "AC")?.name).toBe("Isola di Ascensione");
    expect(en.find((country) => country.code === "TA")?.name).toBe("Tristan da Cunha");
  });

  it("searches localized country names, country codes and short calling prefixes", () => {
    const items = phoneCountries("it");
    expect(filterPhoneCountries(items, "")).toBe(items);
    expect(filterPhoneCountries(items, "ita")).toBe(items);
    expect(filterPhoneCountries(items, "  IT ").map((item) => item.code)).toEqual(["IT"]);
    expect(filterPhoneCountries(items, "Reun").map((item) => item.code)).toContain("RE");
    expect(filterPhoneCountries(items, "+39").map((item) => item.code)).toContain("IT");
    expect(filterPhoneCountries(items, "39").map((item) => item.code)).toContain("VA");
    expect(filterPhoneCountries(items, "nonsense")).toEqual([]);
  });

  it("falls back to the code when dialing metadata adds an unnamed territory", () => {
    const original = countries.getName;
    const spy = vi
      .spyOn(countries, "getName")
      .mockImplementation((code, locale, options) =>
        code === "US" ? undefined : original(code, locale, options),
      );
    try {
      expect(phoneCountries("en").find((item) => item.code === "US")?.name).toBe("US");
    } finally {
      spy.mockRestore();
    }
  });

  it("defaults to device region when supported", () => {
    expect(defaultPhoneCountry("it")).toBe("IT");
    expect(defaultPhoneCountry("ca")).toBe("CA");
    expect(defaultPhoneCountry("XX")).toBe("US");
    expect(defaultPhoneCountry()).toBe("US");
  });

  it("prefixes national input without duplicating pasted international numbers or validating formats", () => {
    expect(fullMobileNumber("IT", " 333 1234567 ")).toBe("+39 333 1234567");
    expect(fullMobileNumber("CA", "+39 333 1234567")).toBe("+39 333 1234567");
    expect(fullMobileNumber("IT", "0039 333 1234567")).toBe("0039 333 1234567");
    expect(fullMobileNumber("US", "not formatted phone")).toBe("+1 not formatted phone");
  });
});
