import countries from "i18n-iso-countries";
import en from "i18n-iso-countries/langs/en.json";
import it from "i18n-iso-countries/langs/it.json";
import { type CountryCode, getCountries, getCountryCallingCode } from "libphonenumber-js";

countries.registerLocale(en);
countries.registerLocale(it);

const additionalNames: Record<string, { en: string; it: string }> = {
  AC: { en: "Ascension Island", it: "Isola di Ascensione" },
  TA: { en: "Tristan da Cunha", it: "Tristan da Cunha" },
};

export type PhoneCountryCode = CountryCode;

export function phoneCountries(locale: string) {
  const language = locale.startsWith("it") ? "it" : "en";
  const collator = new Intl.Collator(language);
  return getCountries()
    .map((code) => ({
      code,
      name: countries.getName(code, language) ?? additionalNames[code]?.[language] ?? code,
      callingCode: `+${getCountryCallingCode(code)}`,
      flag: String.fromCodePoint(
        ...[...(code === "AC" || code === "TA" ? "SH" : code)].map(
          (letter) => 0x1f1e6 + letter.charCodeAt(0) - 65,
        ),
      ),
    }))
    .sort((a, b) => collator.compare(a.name, b.name));
}

export function filterPhoneCountries(items: ReturnType<typeof phoneCountries>, query: string) {
  const text = query
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const isCode = /^\+?\d+$/.test(text);
  if (/^[a-z]{2}$/.test(text))
    return items.filter((country) => country.code.toLowerCase() === text);
  if (text.length < 4 && !isCode) return items;
  return items.filter((country) =>
    isCode
      ? country.callingCode.startsWith(text.startsWith("+") ? text : `+${text}`)
      : country.name
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .includes(text),
  );
}

export function defaultPhoneCountry(region?: string | null): PhoneCountryCode {
  return getCountries().find((code) => code === region?.toUpperCase()) ?? "US";
}

export function fullMobileNumber(country: PhoneCountryCode, nationalNumber: string) {
  const value = nationalNumber.trim();
  return /^(?:\+|00)/.test(value) ? value : `+${getCountryCallingCode(country)} ${value}`;
}
