import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

const source = readFileSync(
  new URL("../../../../.maestro/helpers/cache-inputs.js", import.meta.url),
  "utf8",
);
const fixture = {
  CACHE_TABLE_NAME: "Table (A)+",
  CACHE_GROUP_NAME: "Private [A]",
  CACHE_EVENT_NAME: "Event A?",
  CACHE_USERNAME: "@owned-a",
  CACHE_USERNAME_2: "@owned-b",
  EMAIL: "owned-a@example.test",
  PASSWORD: "owned-a-password",
  EMAIL_2: "owned-b@example.test",
  PASSWORD_2: "owned-b-password",
};
it("requires complete distinct fixture identities before same-process authentication", () => {
  for (const key of Object.keys(fixture)) {
    const missing: Record<string, unknown> = { ...fixture };
    delete missing[key];
    expect(() => runInNewContext(source, { ...missing, output: {} })).toThrow(`Missing ${key}`);
    expect(() => runInNewContext(source, { ...fixture, [key]: "", output: {} })).toThrow(
      `Missing ${key}`,
    );
  }
  expect(() =>
    runInNewContext(source, {
      ...fixture,
      EMAIL_2: fixture.EMAIL.toUpperCase(),
      output: {},
    }),
  ).toThrow("Two distinct owned accounts are required");
  expect(() =>
    runInNewContext(source, {
      ...fixture,
      CACHE_USERNAME_2: fixture.CACHE_USERNAME.toUpperCase(),
      output: {},
    }),
  ).toThrow("Two distinct owned accounts are required");
  for (const username of ["no-at-sign", "@has spaces"])
    expect(() =>
      runInNewContext(source, { ...fixture, CACHE_USERNAME: username, output: {} }),
    ).toThrow("Cache fixture usernames must include @ and contain no spaces");
});
it("matches literal owned fixture rows and current tabs", () => {
  const output: Record<string, string> = {};
  runInNewContext(source, { ...fixture, output });
  for (const [pattern, value] of [
    [output.cacheTablePattern, fixture.CACHE_TABLE_NAME],
    [output.cacheGroupPattern, fixture.CACHE_GROUP_NAME],
    [output.cacheEventPattern, fixture.CACHE_EVENT_NAME],
    [output.cacheOwnerPattern, fixture.CACHE_USERNAME],
    [output.cacheOtherOwnerPattern, fixture.CACHE_USERNAME_2],
  ]) {
    expect(new RegExp(pattern).test(value)).toBe(true);
    expect(new RegExp(pattern).test(`${value} other`)).toBe(false);
  }
  expect(output.registeredLabel).toBe("Scheduled");
  expect(output.availableLabel).toBe("Available");
});
