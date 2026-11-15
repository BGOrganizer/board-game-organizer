import assert from "node:assert/strict";
import test from "node:test";
import { cleanupE2eUsers } from "../cleanup-e2e-clerk-users.mjs";

const env = {
  CLERK_SECRET_KEY: "sk_test_fixture",
  GH_TOKEN: "fixture-token",
  GITHUB_REPOSITORY: "BGOrganizer/board-game-organizer",
  E2E_USER_MAX_AGE_SECONDS: "7200",
};
const user = (id, run = "10", attempt = "1", extra = {}) => ({
  id: `user_${id}`,
  username: `e2e_${run}_${attempt}_abcdef`,
  created_at: Date.now() - 10_000_000,
  public_metadata: { e2e: true },
  ...extra,
});
const completed = (id = 10, extra = {}) => ({
  id,
  run_attempt: 1,
  status: "completed",
  event: "pull_request",
  path: ".github/workflows/pr-ci.yml",
  head_repository: { full_name: env.GITHUB_REPOSITORY },
  ...extra,
});
function fixture(rows, runs = { 10: completed() }, options = {}) {
  const calls = [],
    deleted = [];
  return {
    calls,
    deleted,
    request: async (url, input) => {
      calls.push(url);
      assert.equal(input.redirect, "error");
      assert(input.signal instanceof AbortSignal);
      if (input.method === "DELETE") {
        deleted.push(url.split("/").at(-1));
        if (options.deleteError) throw Error("private provider body");
        return new Response(null, { status: options.deleteStatus ?? 204 });
      }
      if (url.includes("api.github.com")) {
        const run = runs[url.split("/").at(-1)];
        return Response.json(run ?? {}, { status: options.ownerStatus ?? 200 });
      }
      const offset = Number(new URL(url).searchParams.get("offset"));
      return Response.json(rows.slice(offset, offset + 100));
    },
  };
}
test("cleanup rejects live/missing keys and malformed identities before any request", async () => {
  for (const override of [
    { CLERK_SECRET_KEY: "sk_live_private" },
    { CLERK_SECRET_KEY: "" },
    { E2E_RUN_KEY: "10_bad" },
    { E2E_USER_MAX_AGE_SECONDS: "0" },
    { E2E_USER_MAX_AGE_SECONDS: "NaN" },
    { GH_TOKEN: "" },
    { GITHUB_REPOSITORY: "bad" },
  ])
    await assert.rejects(
      cleanupE2eUsers({ ...env, ...override }, [], () => assert.fail("network")),
    );
  await assert.rejects(cleanupE2eUsers(env, ["../../users"], () => assert.fail("network")));
});
test("explicit IDs delete only those users, accept 404, and never sweep or require GitHub", async () => {
  const f = fixture([user("other")], {}, { deleteStatus: 404 });
  assert.deepEqual(
    await cleanupE2eUsers(
      { CLERK_SECRET_KEY: env.CLERK_SECRET_KEY },
      ["user_own", "user_own"],
      f.request,
    ),
    { deleted: 1, failures: 0 },
  );
  assert.deepEqual(f.deleted, ["user_own"]);
  assert.equal(f.calls.length, 1);
});
test("exact run recovery never deletes other stale attempts/runs and includes fresh own targets", async () => {
  const f = fixture([
    user("own"),
    user("target", "10", "1", { username: "e2e_target_10_1_abcdef", created_at: Date.now() }),
    user("other", "11"),
    user("otherAttempt", "10", "2"),
    user("ordinary", "10", "1", { public_metadata: {} }),
    user("legacy", "10", "1", { username: "e2e_legacy" }),
  ]);
  const result = await cleanupE2eUsers(
    { ...env, E2E_RUN_KEY: "10_1", GH_TOKEN: undefined },
    ["user_own"],
    f.request,
  );
  assert.deepEqual(result, { deleted: 2, failures: 0 });
  assert.deepEqual(f.deleted, ["user_own", "user_target"]);
  assert(!f.calls.some((url) => url.includes("api.github.com")));
});
test("orphan sweep deletes only stale marked users of verified completed owners and caches lookups", async () => {
  const f = fixture([
    user("actor"),
    user("target", "10", "1", {
      username: "e2e_target_10_1_abcdef",
      created_at: new Date(Date.now() - 10_000_000).toISOString(),
    }),
    user("fresh", "10", "1", { created_at: Date.now() }),
    user("legacy", "10", "1", { username: "e2e_legacy" }),
    user("badDate", "10", "1", { created_at: "bad" }),
    user("normal", "10", "1", { public_metadata: { e2e: false } }),
  ]);
  assert.deepEqual(await cleanupE2eUsers(env, [], f.request), { deleted: 2, failures: 0 });
  assert.deepEqual(f.deleted, ["user_actor", "user_target"]);
  assert.equal(f.calls.filter((url) => url.includes("api.github.com")).length, 1);
});
test("active/queued owners including newer reruns, foreign runs and unknown owners are retained", async () => {
  for (const extra of [
    { status: "in_progress", run_attempt: 2 },
    { status: "queued" },
    { run_attempt: 0 },
    { event: "push" },
    { path: ".github/workflows/main-ci.yml" },
    { head_repository: { full_name: "foreign/repo" } },
    { id: 11 },
  ]) {
    const f = fixture([user("keep")], { 10: completed(10, extra) });
    assert.deepEqual(await cleanupE2eUsers(env, [], f.request), { deleted: 0, failures: 0 });
    assert.deepEqual(f.deleted, []);
  }
});
test("failed owner verification cannot authorize deletion or expose response bodies", async () => {
  for (const status of [403, 404, 429, 500]) {
    const f = fixture([user("keep")], {}, { ownerStatus: status });
    await assert.rejects(cleanupE2eUsers(env, [], f.request), /owner verification failed/);
    assert.deepEqual(f.deleted, []);
  }
});
test("snapshot pagination completes before deleting rows so offsets cannot shift", async () => {
  const f = fixture(Array.from({ length: 101 }, (_, i) => user(String(i))));
  assert.deepEqual(await cleanupE2eUsers(env, [], f.request), { deleted: 101, failures: 0 });
  assert(f.calls[2].endsWith("offset=100"));
  assert(f.calls[3].endsWith("/user_0"));
});
test("delete failures retry three times and report failure without claiming success", async () => {
  for (const options of [{ deleteStatus: 500 }, { deleteError: true }]) {
    const f = fixture([], {}, options);
    assert.deepEqual(await cleanupE2eUsers(env, ["user_one"], f.request, async () => {}), {
      deleted: 0,
      failures: 1,
    });
    assert.equal(f.deleted.length, 3);
  }
});
test("invalid listings and exhausted pagination fail instead of reporting complete cleanup", async () => {
  await assert.rejects(
    cleanupE2eUsers(env, [], async () => new Response(null, { status: 401 })),
    /listing failed/,
  );
  await assert.rejects(
    cleanupE2eUsers(env, [], async () => Response.json({})),
    /Invalid E2E user listing/,
  );
  await assert.rejects(
    cleanupE2eUsers(env, [], async () => Response.json(Array.from({ length: 100 }, () => ({})))),
    /pagination limit/,
  );
});
