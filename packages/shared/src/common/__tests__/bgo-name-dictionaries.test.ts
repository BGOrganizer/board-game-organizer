import { expect, it } from "vitest";
import { generateName, nameDictionaries } from "../bgo-name-dictionaries";

it.each(["en", "it"] as const)(
  "generates complete supplied %s names for every draft category",
  (language) => {
    for (const category of ["gruppo", "evento", "tavolo"] as const) {
      expect(nameDictionaries[language][category]).toContain(generateName(category, language));
    }
  },
);
it("retains the supplied Italian default without inventing global uniqueness", () => {
  expect(nameDictionaries.it.gruppo).toContain(generateName("gruppo"));
});
it("keeps all 300 supplied suggestions valid for the strictest shared name length", () => {
  for (const dictionaries of Object.values(nameDictionaries)) {
    for (const names of Object.values(dictionaries)) {
      expect(names).toHaveLength(50);
      for (const name of names) {
        expect(name).toBe(name.trim());
        expect(name.length).toBeGreaterThanOrEqual(5);
        expect(name.length).toBeLessThanOrEqual(120);
      }
    }
  }
});
