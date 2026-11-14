import { expect, it } from "vitest";
import { appVersion } from "../appVersion";

it("uses the running bundle revision only for prereleases without fabricating an unknown SHA", () => {
  const sha = "ABCDEF1234567890ABCDEF1234567890ABCDEF12";
  expect(appVersion("1.3.2", false, sha)).toBe("1.3.2");
  expect(appVersion("1.3.2", true)).toBe("1.3.2");
  expect(appVersion("1.3.2", true, "")).toBe("1.3.2");
  expect(appVersion("1.3.2", true, "unknown")).toBe("1.3.2");
  expect(appVersion("1.3.2", true, sha)).toBe("1.3.2+abcdef1");
  expect(appVersion("1.3.2-rc.1+build", true, sha)).toBe("1.3.2-rc.1+build.abcdef1");
});
