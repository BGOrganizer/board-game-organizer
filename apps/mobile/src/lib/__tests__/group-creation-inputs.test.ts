import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

const script = readFileSync(
  new URL("../../../.maestro/helpers/group-creation-inputs.js", import.meta.url),
  "utf8",
);
const fixture = {
  friendName: "Owned friend",
  friendQuery: "owned",
  imagePickerLabel: "Photo (owned) [1].png",
};
function load(patch: Record<string, unknown> = {}, input = fixture) {
  const output: { groupCreate?: { image: string; query: string; change: string; upload: string } } =
    {};
  runInNewContext(script, {
    output,
    GROUP_CREATE_FIXTURE_ACK: "owned-friends-and-photo",
    GROUP_CREATE_BUILD_ACK: "owned-preview-build",
    GROUP_CREATE_WRITE_ACK: "stage-owned-logo-only",
    GROUP_CREATE_API_URL: "https://owned.vercel.app",
    GROUP_CREATE_LOCALE: "en",
    GROUP_CREATE_THEME: "light",
    GROUP_CREATE_INPUT: JSON.stringify(input),
    ...patch,
  });
  return output.groupCreate!;
}
it.each(["en", "it"])(
  "validates owned inputs and escapes actual photo-picker selectors for %s",
  (lang) => {
    const output = load({ GROUP_CREATE_LOCALE: lang });
    expect(new RegExp(output.image).test(fixture.imagePickerLabel)).toBe(true);
    expect(new RegExp(output.image).test("Photo owned 1png")).toBe(false);
    expect(output.query).toBe("owned");
    expect(output.change).toBe(lang === "it" ? "^Cambia logo$" : "^Change logo$");
    expect(output.upload).toBe(
      lang === "it" ? "^Carica il logo del gruppo$" : "^Upload group logo$",
    );
    expect(
      load({ GROUP_CREATE_THEME: "dark", GROUP_CREATE_API_URL: "http://localhost:4000" }),
    ).toBeDefined();
  },
);
it.each([
  { GROUP_CREATE_FIXTURE_ACK: "" },
  { GROUP_CREATE_BUILD_ACK: "" },
  { GROUP_CREATE_WRITE_ACK: "" },
  { GROUP_CREATE_API_URL: "https://api.board-game-organizer.com" },
  { GROUP_CREATE_API_URL: "https://owned.vercel.app.evil.example" },
  { GROUP_CREATE_API_URL: "http://owned.vercel.app" },
  { GROUP_CREATE_API_URL: "https://user:secret@owned.vercel.app" },
  { GROUP_CREATE_LOCALE: "fr" },
  { GROUP_CREATE_THEME: "unknown" },
])("fails closed for unowned or ambiguous setup %j", (patch) => {
  expect(() => load(patch)).toThrow();
});
it.each([
  { ...fixture, friendName: "" },
  { ...fixture, friendQuery: "abc" },
  { ...fixture, imagePickerLabel: "" },
])("rejects incomplete friend/photo fixture %j", (input) => {
  expect(() => load({}, input)).toThrow();
});
