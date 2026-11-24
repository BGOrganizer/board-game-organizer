import assert from "node:assert/strict";
import test from "node:test";
import { clerkFrontendOrigin, requireClerkTarget } from "../clerk-target.mjs";

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

test("the Clerk publishable key supplies the public issuer for the same environment", () => {
  const encode = (host) => Buffer.from(host).toString("base64url");
  const developmentKey = `pk_test_${encode("example.clerk.accounts.dev$")}`;
  assert.equal(
    clerkFrontendOrigin("preview", developmentKey),
    "https://example.clerk.accounts.dev",
  );
  assert.equal(
    clerkFrontendOrigin("production", `pk_live_${encode("clerk.example.com$")}`),
    "https://clerk.example.com",
  );
  assert.throws(() => clerkFrontendOrigin("production", developmentKey));
  for (const value of ["example.com", "example.com/auth$", "a.example.com@b.example.com$"])
    assert.throws(() => clerkFrontendOrigin("preview", `pk_test_${encode(value)}`));
});
