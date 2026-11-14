import assert from "node:assert/strict";
import test from "node:test";
import { requireClerkTarget } from "../clerk-target.mjs";

test("matching Clerk keys are mandatory, never a Production-to-Preview fallback", () => {
  for (const target of ["preview", "production"])
    for (const kind of ["pk", "sk"]) {
      const prefix = `${kind}_${target === "production" ? "live" : "test"}_`;
      assert.equal(requireClerkTarget(target, prefix + "fixture", kind), prefix + "fixture");
      for (const value of [
        "",
        undefined,
        prefix,
        `${kind}_${target === "production" ? "test" : "live"}_fixture`,
      ])
        assert.throws(() => requireClerkTarget(target, value, kind));
    }
  assert.throws(() => requireClerkTarget("invalid", "pk_test_fixture", "pk"));
  assert.throws(() => requireClerkTarget("preview", "pk_test_fixture", "other"));
});
