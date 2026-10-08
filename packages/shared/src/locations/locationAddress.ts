import countries from "i18n-iso-countries";
import en from "i18n-iso-countries/langs/en.json";
import it from "i18n-iso-countries/langs/it.json";

countries.registerLocale(en);
countries.registerLocale(it);

/** Display only: never change the address used for storage or favorite identity. */
export function formatLocationAddress(address: string) {
  const separator = address.lastIndexOf(",");
  if (separator < 0) return address;
  const suffix = address.slice(separator + 1).trim();
  // ponytail: EN/IT country names; add locales when address localization expands.
  return countries.getAlpha2Code(suffix, "en") || countries.getAlpha2Code(suffix, "it")
    ? address.slice(0, separator).trimEnd()
    : address;
}
