import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

const script = readFileSync(
  new URL("../../../.maestro/helpers/event-participant-inputs.js", import.meta.url),
  "utf8",
);
const input = {
  eventId: "11111111-1111-4111-8111-111111111111",
  groupId: "22222222-2222-4222-8222-222222222222",
  eventName: "Owned event",
  groupName: "Owned group",
  targetName: "@target [name]",
  firstTableName: "First table",
  targetOffset: 30,
  mode: "remove",
};
function run(change = {}, env = {}) {
  const output: {
    eventPeople?: {
      manage: string;
      eventManage: string;
      removedOnly: boolean;
      title: string;
      revoke: string;
    };
  } = {};
  runInNewContext(script, {
    EVENT_PEOPLE_FIXTURE_ACK: "owned-disposable-event-participants",
    EVENT_PEOPLE_BUILD_ACK: "owned-preview-build",
    EVENT_PEOPLE_LOCALE: "en",
    EVENT_PEOPLE_INPUT: JSON.stringify({ ...input, ...change }),
    ...env,
    output,
  });
  if (!output.eventPeople) throw new Error("Missing selectors");
  return output.eventPeople;
}
it.each(["en", "it"])(
  "escapes real names and distinguishes explicitly selected Event-remove/Group-ban mode: %s",
  (locale) => {
    const a = run({}, { EVENT_PEOPLE_LOCALE: locale });
    expect(a.removedOnly).toBe(true);
    expect(
      new RegExp(a.manage).test(
        (locale === "it" ? "Gestisci partecipante" : "Manage participant") + ": @target [name]",
      ),
    ).toBe(true);
    const b = run({ mode: "ban" }, { EVENT_PEOPLE_LOCALE: locale });
    expect(b.removedOnly).toBe(false);
    expect(b.eventManage).toBe(a.manage);
    expect(
      new RegExp(b.manage).test(
        (locale === "it" ? "Gestisci membro" : "Manage member") + ": target [name]",
      ),
    ).toBe(true);
    expect(
      new RegExp(b.manage).test(
        (locale === "it" ? "Gestisci partecipante" : "Manage participant") + ": @target [name]",
      ),
    ).toBe(false);
    expect(
      new RegExp(b.revoke).test(
        (locale === "it" ? "Revoca l'esclusione dal gruppo" : "Revoke group exclusion") +
          ": @target [name]",
      ),
    ).toBe(true);
    expect(
      new RegExp(b.title).test(
        (locale === "it" ? "Banna dal gruppo" : "Ban from group") + ": @target [name]",
      ),
    ).toBe(true);
  },
);
it.each([
  { EVENT_PEOPLE_FIXTURE_ACK: "" },
  { EVENT_PEOPLE_BUILD_ACK: "" },
  { EVENT_PEOPLE_LOCALE: "fr" },
])("requires explicit owned fixture/build/locale: %j", (env) =>
  expect(() => run({}, env)).toThrow(),
);
it.each([{ eventId: "bad" }, { targetOffset: 19 }, { mode: "optional" }, { targetName: "" }])(
  "rejects incomplete destructive fixture inputs: %j",
  (change) => expect(() => run(change)).toThrow(),
);
