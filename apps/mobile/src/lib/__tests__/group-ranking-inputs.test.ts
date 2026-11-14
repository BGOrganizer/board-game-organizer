import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

const source = readFileSync(
  new URL("../../../.maestro/helpers/group-ranking-inputs.js", import.meta.url),
  "utf8",
);
const fixture = {
  groupId: "12345678-1234-1234-1234-123456789abc",
  groupName: "Club (one)",
  gameName: "Azul",
  userId: "user_player",
  username: "@@player.name",
  role: "MEMBER",
};
function run(change: Record<string, unknown> = {}, value: unknown = fixture) {
  const output: Record<string, any> = {};
  runInNewContext(source, {
    output,
    GROUP_RANKING_FIXTURE_ACK: "owned-development-group-ranking",
    GROUP_RANKING_BUILD_ACK: "owned-preview-build",
    GROUP_RANKING_LOCALE: "en",
    GROUP_RANKING_INPUT: JSON.stringify(value),
    ...change,
  });
  return output.groupRanking;
}
it.each(["ADMIN", "MODERATOR", "MEMBER"])(
  "uses actual %s fixture facts and literal entity selectors",
  (role) => {
    const result = run({}, { ...fixture, role });
    expect(result.username).toBe("^@player\\.name$");
    expect(result.group).toBe("^Club \\(one\\)$");
    expect(result.row).toBe("group-ranking-player-user_player");
    expect(result.query).toBe("Azul");
    expect(result.role).toBe(
      `^${role === "ADMIN" ? "Admin" : role === "MODERATOR" ? "Moderator" : "Accepted member"}$`,
    );
  },
);
it.each([
  ["ADMIN", "Amministratore"],
  ["MODERATOR", "Moderatore"],
  ["MEMBER", "Membro accettato"],
])("localizes %s without invented role inference", (role, label) => {
  const result = run({ GROUP_RANKING_LOCALE: "it" }, { ...fixture, role });
  expect(result.role).toBe(`^${label}$`);
  expect(result.search).toBe("^Cerca giochi da tavolo$");
});
it.each([
  "GROUP_RANKING_FIXTURE_ACK",
  "GROUP_RANKING_BUILD_ACK",
  "GROUP_RANKING_LOCALE",
  "GROUP_RANKING_INPUT",
])("fails closed for missing %s", (key) => {
  expect(() => run({ [key]: undefined })).toThrow();
});
it.each([
  null,
  [],
  "fixture",
  2,
  {},
  { ...fixture, role: "FORMER" },
  { ...fixture, role: "OWNER" },
  { ...fixture, groupId: "not-an-id" },
  { ...fixture, userId: "/unsafe" },
  { ...fixture, username: "@" },
  { ...fixture, gameName: "Go" },
  { ...fixture, gameName: "x".repeat(121) },
  { ...fixture, groupName: "x".repeat(121) },
  { ...fixture, username: 4 },
])("rejects malformed/unsupported fixtures %#", (value) => expect(() => run({}, value)).toThrow());
it.each(["groupId", "groupName", "gameName", "userId", "username", "role"])(
  "requires a nonempty canonical %s",
  (key) => expect(() => run({}, { ...fixture, [key]: " " })).toThrow(),
);
it("rejects malformed JSON and unsupported locales/acknowledgements", () => {
  for (const change of [
    { GROUP_RANKING_INPUT: "{" },
    { GROUP_RANKING_LOCALE: "fr" },
    { GROUP_RANKING_FIXTURE_ACK: "production" },
    { GROUP_RANKING_BUILD_ACK: "production" },
  ])
    expect(() => run(change)).toThrow();
});
