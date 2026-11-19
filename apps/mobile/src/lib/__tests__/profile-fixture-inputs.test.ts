import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

// Shipped Maestro input validation; component behavior uses actual RNTL suites.
it.each(["en", "it"])(
  "requires real registration-date and running-version expectations for the %s device journey",
  (locale) => {
    const source = readFileSync(
      new URL("../../../.maestro/helpers/profile-inputs.js", import.meta.url),
      "utf8",
    );
    const inputs = {
      PROFILE_LOCALE: locale,
      PROFILE_JOINED_AT_LABEL: locale === "it" ? "15 giugno 2020" : "June 15, 2020",
      PROFILE_APP_VERSION: "1.3.2+abcdef1",
      PROFILE_GAME_NAME: "Game",
      PROFILE_OWNER_NAME: "Owner",
      PROFILE_TARGET_ID: "target",
      PROFILE_TARGET_NAME: "Other",
      PROFILE_EMPTY_ID: "empty",
      PROFILE_EMPTY_NAME: "Empty",
      PROFILE_BLOCKED_BY_ME_ID: "blocked",
      PROFILE_BLOCKED_ME_ID: "blocking",
      PROFILE_PUBLIC_ACTIVITY_TEXT: "Visible",
      PROFILE_PRIVATE_ACTIVITY_TEXT: "Hidden",
    };
    const output: { profile?: { version: string; joinedDate: string } } = {};
    runInNewContext(source, { ...inputs, output });
    expect(
      new RegExp(output.profile?.version ?? "").test(
        `${locale === "it" ? "Versione" : "Version"}: 1.3.2+abcdef1`,
      ),
    ).toBe(true);
    expect(new RegExp(output.profile?.joinedDate ?? "").test(inputs.PROFILE_JOINED_AT_LABEL)).toBe(
      true,
    );
    for (const key of ["PROFILE_JOINED_AT_LABEL", "PROFILE_APP_VERSION"])
      expect(() => runInNewContext(source, { ...inputs, [key]: "", output: {} })).toThrow();
  },
);
