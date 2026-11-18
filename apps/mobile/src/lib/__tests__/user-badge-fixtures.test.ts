import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

it.each(["en", "it"])(
  "validates real badge acceptance fixture inputs before navigation (%s)",
  (locale) => {
    const source = readFileSync(
      new URL("../../../.maestro/helpers/user-badge-inputs.js", import.meta.url),
      "utf8",
    );
    const inputs = {
      BADGE_LOCALE: locale,
      BADGE_GROUP_ID: "00000000-0000-4000-8000-000000000001",
      BADGE_EVENT_ID: "00000000-0000-4000-8000-000000000002",
      BADGE_TABLE_ID: "00000000-0000-4000-8000-000000000003",
      BADGE_RELATIONSHIP_LABEL: "Friends",
      BADGE_RELATIONSHIP_EXPLANATION: "Friendship accepted.",
      BADGE_GROUP_ROLE_LABEL: "Admin",
      BADGE_ROLE_LABEL: "Admin · Accepted participant",
    };
    const check = (patch: Record<string, string> = {}) => {
      const output: { badges?: { contacts: string; table: string; group: string; roles: string } } =
        {};
      runInNewContext(source, { ...inputs, ...patch, output });
      return output.badges;
    };
    expect(check()?.table).toBe(
      `bgo-dev:///event/table?eventId=${inputs.BADGE_EVENT_ID}&tableId=${inputs.BADGE_TABLE_ID}`,
    );
    expect(check()?.roles).toBe(
      locale === "it" ? "Ruoli e partecipazione" : "Roles and participation",
    );
    for (const key of Object.keys(inputs)) expect(() => check({ [key]: "" })).toThrow();
    expect(() => runInNewContext(source, { output: {} })).toThrow();
  },
);
