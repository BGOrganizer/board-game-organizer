import { expect, it } from "vitest";
import { formatUsername } from "../userIdentity";

it.each(["player", "@player", "@@player", "  @player  "])(
  "formats one handle prefix for %s",
  (username) => {
    expect(formatUsername(username, "Known name")).toBe("@player");
  },
);
it.each([undefined, null, "", "  ", "@", "@@"])(
  "retains the known fallback without inventing a username for %s",
  (username) => {
    expect(formatUsername(username, "Known name")).toBe("Known name");
  },
);
