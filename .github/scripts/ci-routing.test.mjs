import assert from "node:assert/strict";
import test from "node:test";
import { resolveCiContext } from "./ci-context.mjs";
import { requireCurrentPr } from "./ci-current-pr.mjs";
import { internalJobs, qualityJobs, verifyCiGate } from "./ci-gate.mjs";

const repository = "BGOrganizer/board-game-organizer",
  sha = "a".repeat(40),
  base = "b".repeat(40);
const pull = (change = {}) => ({
  number: 22,
  title: "Feature $(literal)\nnot shell",
  state: "open",
  base: { ref: "main", sha: base },
  head: { ref: "feat/topic", sha, repo: { full_name: repository } },
  ...change,
});
const push = {
  eventName: "push",
  event: { ref: "refs/heads/feat/topic", before: base },
  repository,
  refName: "feat/topic",
  sha,
};
const statuses = () =>
  Object.fromEntries(
    ["context", ...qualityJobs, ...internalJobs, "e2e-maestro", "e2e-playwright"].map((name) => [
      name,
      "success",
    ]),
  );

test("branch without PR gets quality only; a push with PR routes without a second pipeline", async () => {
  const calls = [];
  const branch = await resolveCiContext(push, async (...args) => {
    calls.push(args);
    return [];
  });
  assert.equal(branch.mode, "branch");
  assert.equal(branch["head-sha"], sha);
  assert.equal(branch["base-sha"], base);
  assert.deepEqual(calls, [[repository, "feat/topic"]]);
  const routed = await resolveCiContext(push, async () => [pull()]);
  assert.deepEqual(routed, { mode: "routed", trusted: "true" });
  const pr = await resolveCiContext(
    { ...push, eventName: "pull_request", event: { pull_request: pull() } },
    () => {
      throw Error("No lookup for PR event");
    },
  );
  assert.equal(pr.mode, "pr");
  assert.equal(pr.trusted, "true");
  assert.equal(pr.title, pull().title);
  assert.equal(pr["checkout-sha"], sha);
  assert.equal(pr.number, "22");
});
test("routing validates context and fails closed on API errors or ambiguous branches", async () => {
  for (const input of [
    { ...push, repository: "bad" },
    { ...push, sha: "bad" },
    { ...push, eventName: "workflow_dispatch" },
  ])
    await assert.rejects(resolveCiContext(input, async () => []));
  for (const pr of [
    null,
    pull({ number: -1 }),
    pull({ base: { ref: "other", sha: base } }),
    pull({ head: { sha: "bad" } }),
    pull({ base: { ref: "main", sha: "bad" } }),
  ])
    await assert.rejects(
      resolveCiContext(
        { ...push, eventName: "pull_request", event: { pull_request: pr } },
        async () => [],
      ),
    );
  await assert.rejects(
    resolveCiContext(push, async () => {
      throw Error("Lookup failed");
    }),
    /Lookup failed/,
  );
  await assert.rejects(
    resolveCiContext(push, async () => null),
    /lookup response/,
  );
  await assert.rejects(
    resolveCiContext(push, async () => [pull(), pull()]),
    /Ambiguous/,
  );
  for (const event of [{ ...push.event, deleted: true }, { ref: "refs/tags/v1" }])
    assert.equal(
      (
        await resolveCiContext({ ...push, event }, () => {
          throw Error("Must not query");
        })
      ).mode,
      "routed",
    );
  assert.equal(
    (await resolveCiContext({ ...push, refName: "main" }, async () => [])).mode,
    "routed",
  );
  assert.equal(
    (
      await resolveCiContext(
        { ...push, event: { ...push.event, before: "0".repeat(40) } },
        async () => [],
      )
    )["base-sha"],
    "",
  );
  assert.equal(
    (await resolveCiContext({ ...push, event: { ...push.event, before: "bad" } }, async () => []))[
      "base-sha"
    ],
    "",
  );
  const other = [
    pull({ state: "closed" }),
    pull({ base: { ref: "release" } }),
    pull({ head: { ref: "other", repo: { full_name: repository } } }),
    pull({ head: { ref: "feat/topic", repo: { full_name: "fork/repo" } } }),
  ];
  assert.equal((await resolveCiContext(push, async () => other)).mode, "branch");
  const fork = pull({ head: { ...pull().head, repo: { full_name: "fork/repo" } } });
  assert.equal(
    (
      await resolveCiContext(
        { ...push, eventName: "pull_request", event: { pull_request: fork } },
        async () => [],
      )
    ).trusted,
    "false",
  );
});
test("merge gate requires every Internal/common result but never depends on Development", () => {
  const results = statuses();
  assert.match(verifyCiGate("pr", results, "true"), /passed/);
  for (const name of ["context", ...qualityJobs, ...internalJobs, "e2e-maestro", "e2e-playwright"])
    for (const value of ["failure", "cancelled", "skipped", undefined, "timed_out"])
      assert.throws(
        () => verifyCiGate("pr", { ...results, [name]: value }, "true"),
        /CI gate|E2E result/,
      );
  const disabled = { ...results, "e2e-maestro": "skipped", "e2e-playwright": "skipped" };
  assert.match(verifyCiGate("pr", disabled, "false"), /not acceptance evidence/);
  for (const name of ["e2e-maestro", "e2e-playwright"])
    for (const result of ["success", "failure", "cancelled", undefined])
      assert.throws(() => verifyCiGate("pr", { ...disabled, [name]: result }, "false"));
  for (const name of [
    "deploy-development-api",
    "deploy-development-web",
    "build-mobile-development",
    "draft-release",
  ])
    assert.match(verifyCiGate("pr", { ...disabled, [name]: "failure" }, "false"), /passed/);
  const branch = Object.fromEntries(["context", ...qualityJobs].map((name) => [name, "success"]));
  assert.match(verifyCiGate("branch", branch), /passed/);
  for (const name of ["context", ...qualityJobs])
    assert.throws(() => verifyCiGate("branch", { ...branch, [name]: "skipped" }));
  assert.throws(() => verifyCiGate("routed", {}), /eligible/);
  assert.throws(() => verifyCiGate("pr", results, undefined), /policy/);
});
test("publication rejects stale, closed or fork PRs and never exposes tokens in errors", async () => {
  const input = {
    repository,
    number: 22,
    headSha: sha,
    token: "unit-secret-token",
    runId: 100,
    attempt: 2,
  };
  const run = {
    id: 100,
    run_attempt: 2,
    run_number: 5,
    status: "in_progress",
    event: "pull_request",
    path: ".github/workflows/pr-ci.yml",
    head_sha: sha,
    head_branch: "feat/topic",
    head_repository: { full_name: repository },
    pull_requests: [{ number: 22 }],
  };
  const request = async (url, options) => {
    assert.equal(options.headers.Authorization, "Bearer unit-secret-token");
    return Response.json(
      url.endsWith("/pulls/22")
        ? pull()
        : url.endsWith("/actions/runs/100")
          ? run
          : { workflow_runs: [run] },
    );
  };
  assert.equal((await requireCurrentPr(input, request)).number, 22);
  for (const value of [
    { ...input, repository: "bad" },
    { ...input, number: 0 },
    { ...input, headSha: "bad" },
    { ...input, token: "" },
    { ...input, runId: "bad" },
    { ...input, attempt: 0 },
  ])
    await assert.rejects(requireCurrentPr(value, request), /context/);
  for (const value of [
    pull({ state: "closed" }),
    pull({ base: { ref: "other" } }),
    pull({ head: { ...pull().head, sha: base } }),
    pull({ head: { ...pull().head, repo: { full_name: "fork/repo" } } }),
  ])
    await assert.rejects(
      requireCurrentPr(input, async () => Response.json(value)),
      /refusing publication/,
    );
  await assert.rejects(
    requireCurrentPr(input, async () => new Response("private", { status: 403 })),
    /check failed \(403\)/,
  );
  for (const change of [
    { id: 101 },
    { run_attempt: 3 },
    { status: "completed" },
    { event: "push" },
    { path: "other.yml" },
    { head_sha: base },
    { head_branch: "other" },
    { head_repository: null },
    { run_number: null },
    { pull_requests: [] },
  ])
    await assert.rejects(
      requireCurrentPr(input, async (url) =>
        Response.json(url.endsWith("/pulls/22") ? pull() : { ...run, ...change }),
      ),
      /workflow run/,
    );
  for (const recent of [
    {},
    { workflow_runs: [] },
    { workflow_runs: [run, { ...run, id: 101, run_number: 6 }] },
  ])
    await assert.rejects(
      requireCurrentPr(input, async (url) =>
        Response.json(
          url.endsWith("/pulls/22") ? pull() : url.endsWith("/actions/runs/100") ? run : recent,
        ),
      ),
      /stale publication/,
    );
  assert.equal(
    (
      await requireCurrentPr(input, async (url) =>
        Response.json(
          url.endsWith("/pulls/22")
            ? pull()
            : url.endsWith("/actions/runs/100")
              ? run
              : {
                  workflow_runs: [
                    run,
                    { ...run, id: 99, run_number: 4 },
                    { ...run, id: 101, run_number: 6, event: "push" },
                    { ...run, id: 102, run_number: 7, head_sha: base },
                    { ...run, id: 103, run_number: 8, head_repository: null },
                    { ...run, id: 104, run_number: 9, pull_requests: [] },
                  ],
                },
        ),
      )
    ).number,
    22,
  );
});
