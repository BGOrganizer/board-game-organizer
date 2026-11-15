import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";
import { inviteDestination, inviteTokenParam } from "../inviteLinks";

const token = "abcdefghijklmnopqrstuv";
it("retains only canonical invitation continuations across authentication", () => {
  expect(inviteTokenParam(token)).toBe(token);
  expect(inviteDestination(token)).toBe(`/invite/${token}`);
  for (const invalid of [
    undefined,
    [],
    [token],
    "",
    "short",
    `${token}extra`,
    "/tables",
    "https://evil.test/",
    `${token}?apiUrl=https://evil.test`,
    "abcdefghijklmnopqrstu/",
  ]) {
    expect(inviteTokenParam(invalid)).toBeNull();
    expect(inviteDestination(invalid)).toBe("/tables");
  }
});

const helper = readFileSync(
  new URL("../../../.maestro/helpers/native-table-invite-inputs.js", import.meta.url),
  "utf8",
);
const fixture = {
  token,
  locale: "en",
  mode: "success",
  tableName: "Owned table",
  positiveLabels: ["Owned game: Yes"],
};
function inputs(value: unknown = fixture, ack: string | undefined = "owned-preview-native-invite") {
  const output: Record<string, any> = {};
  runInNewContext(helper, {
    NATIVE_TABLE_INVITE_ACK: ack,
    NATIVE_TABLE_INVITE_INPUT: value === undefined ? undefined : JSON.stringify(value),
    output,
  });
  return output.nativeTableInvite;
}
it.each([
  "success",
  "waiting",
  "incomplete",
  "expired",
  "revoked",
  "offline",
  "auth",
  "onboarding",
])("validates real Preview native acceptance inputs for %s", (mode) => {
  for (const locale of ["en", "it"]) {
    const result = inputs({ ...fixture, mode, locale });
    expect(result.link).toBe(`bgo-dev:///invite/${token}`);
    expect(result.unavailable).toBe(["expired", "revoked"].includes(mode));
    expect(result.votes).toEqual(fixture.positiveLabels);
  }
});
it("rejects missing acknowledgments and invalid native fixtures", () => {
  for (const ack of ["", "production"]) expect(() => inputs(fixture, ack)).toThrow();
  for (const value of [
    { ...fixture, token: "../invalid" },
    { ...fixture, locale: "de" },
    { ...fixture, mode: "production" },
    { ...fixture, tableName: "" },
    { ...fixture, tableName: null },
    { ...fixture, positiveLabels: null },
    { ...fixture, positiveLabels: [null] },
    { ...fixture, positiveLabels: [""] },
  ])
    expect(() => inputs(value)).toThrow();
  expect(() => runInNewContext(helper, {})).toThrow();
});
