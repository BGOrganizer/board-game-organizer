import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { parseAllDocuments } from "yaml";

const action = readFileSync(
  new URL("../actions/maestro-e2e/action.yml", import.meta.url),
  "utf8",
).replace(/\r\n/g, "\n");
const script = readFileSync(new URL("./maestro-e2e.sh", import.meta.url), "utf8").replace(
  /\r\n/g,
  "\n",
);
const workflows = ["pr-ci.yml", "main-ci.yml", "mobile-e2e.yml"].map((name) =>
  readFileSync(new URL(`../workflows/${name}`, import.meta.url), "utf8").replace(/\r\n/g, "\n"),
);
const flows = [...workflows[0].matchAll(/^\s+flow: ([\w-]+)$/gm)].map((match) => match[1]);

// Read actual reachable subflows with their declared parameters, not unused helper text.
function nativeSteps(name, env = {}, stack = []) {
  const url = new URL(`../../apps/mobile/.maestro/${name}`, import.meta.url);
  assert(!stack.includes(url.href), `Recursive native flow: ${name}`);
  const docs = parseAllDocuments(readFileSync(url, "utf8"));
  for (const doc of docs) assert.deepEqual(doc.errors, []);
  assert.equal(docs.length, 2);
  assert.equal(docs[0].toJSON().appId, "com.bgo.mobile");
  const result = [];
  const resolve = (value) => {
    if (typeof value === "string")
      return value.replace(/\$\{([A-Z][A-Z0-9_]*)\}/g, (match, key) => env[key] ?? match);
    if (Array.isArray(value)) return value.map(resolve);
    if (value && typeof value === "object")
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolve(item)]));
    return value;
  };
  function visit(commands) {
    for (const raw of commands) {
      const step = typeof raw === "string" ? { [raw]: null } : resolve(raw);
      result.push(step);
      const call = step.runFlow;
      const file = typeof call === "string" ? call : call?.file;
      if (file) {
        const child = new URL(file, url);
        const relative = child.pathname.split("/.maestro/")[1];
        assert(relative && !relative.startsWith("../"));
        result.push(...nativeSteps(relative, { ...env, ...call.env }, [...stack, url.href]));
      }
      if (call?.commands) visit(call.commands);
      if (step.repeat?.commands) visit(step.repeat.commands);
    }
  }
  visit(docs[1].toJSON());
  return result;
}
const journey = (name) => nativeSteps(`flows/${name}.yaml`);
const contains = (steps, command, value) =>
  steps.some((step) => JSON.stringify(step[command]) === JSON.stringify(value));
test("workspace discovers only the canonical ordered journeys, never helpers or missing-fixture scenarios", () => {
  const docs = parseAllDocuments(
    readFileSync(new URL("../../apps/mobile/.maestro/config.yaml", import.meta.url), "utf8"),
  );
  assert.equal(docs.length, 1);
  assert.deepEqual(docs[0].errors, []);
  const config = docs[0].toJSON();
  assert.deepEqual(
    config.flows,
    flows.map((name) => `flows/${name}.yaml`),
  );
  assert.deepEqual(config.executionOrder.flowsOrder, flows);
  assert.equal(config.executionOrder.continueOnFailure, false);
});

test("rewritten journeys preserve feature assertion budgets without transient feedback or hidden acceptance", () => {
  // Original floors minus explicitly removed toast/progress assertions: 05 (-3), 06 (-5), 09 (-1).
  const minimum = {
    "01-launch-welcome": 1,
    "02-login": 12,
    "02-startup-deep-link": 0,
    "03-profile-logout": 7,
    "04-dark-mode": 1,
    "05-contacts-follow-block": 44,
    "06-match-wizard": 95,
    "07-reauth-after-logout": 2,
    "08-groups": 36,
    "09-group-invitations": 30,
    "10-bgg-collection": 17,
    "12-organizations": 18,
    "13-event-draft": 67,
  };
  for (const name of flows) {
    const steps = journey(name);
    const assertions = steps.filter((step) =>
      Object.keys(step).some((key) => key.startsWith("assert")),
    );
    assert(assertions.length >= minimum[name], `${name}: acceptance assertions removed`);
    for (const step of steps) {
      assert(!("retry" in step) && !("sleep" in step));
      assert.notEqual(step.launchApp?.clearState, true);
      const inspect = (value) => {
        if (!value || typeof value !== "object") return;
        for (const [key, item] of Object.entries(value)) {
          assert(!(key === "optional" && item === true));
          assert(!(key === "disableAnimations" && item === true));
          assert.notEqual(key, "point");
          assert.notEqual(key, "waitToSettleTimeoutMs");
          inspect(item);
        }
      };
      inspect(step);
    }
  }
});

test("actor changes require completed logout, real sign-in and exact API-backed profile identity", () => {
  const steps = nativeSteps("helpers/switch-actor.yaml");
  const guest = steps.findIndex(
    (step) => step.extendedWaitUntil?.visible === "Welcome to Board Game Organizer",
  );
  const signin = steps.findIndex((step) => step.tapOn === "Sign in / Register");
  const identity = steps.findLastIndex(
    (step) => step.assertVisible === "${output.authEmailPattern}",
  );
  assert(guest >= 0 && guest < signin && signin < identity);
  assert(
    contains(steps, "scrollUntilVisible", {
      element: { text: "^Logout$" },
      direction: "DOWN",
      timeout: 60000,
    }),
  );
  assert(contains(steps.slice(identity), "openLink", "bgo:///matches"));
  assert(
    contains(steps, "extendedWaitUntil", {
      notVisible: { id: "confirmation-dialog" },
      timeout: 30000,
    }),
  );
});

test("native photo variants converge on required uploaded organization artwork", () => {
  const steps = journey("12-organizations");
  const selected = steps.findIndex((step) => step.tapOn?.text === "Photo taken.*");
  const artwork = steps.findIndex(
    (step, index) => index > selected && step.extendedWaitUntil?.visible === "Organization logo",
  );
  const submitted = steps.findIndex((step) => step.tapOn === "Submit for review");
  assert(selected >= 0 && selected < artwork && artwork < submitted);
  assert(contains(steps, "assertVisible", "Camera permission is required"));
  assert(
    contains(steps, "extendedWaitUntil", {
      visible: { id: "edit-organization-fab" },
      timeout: 30000,
    }),
  );
});

test("native calendar scripts reject impossible dates, including non-leap February", () => {
  const source = readFileSync(
    new URL("../../apps/mobile/.maestro/helpers/event-date.js", import.meta.url),
    "utf8",
  );
  for (const DATE of ["02/29/2030", "02/30/2032", "04/31/2030", "01/01/1999"])
    assert.throws(() =>
      runInNewContext(source, { DATE, maestro: { copiedText: "Tue, Oct 13" }, output: {} }),
    );
  const context = {
    DATE: "02/29/2032",
    maestro: { copiedText: "Tuesday, October 13" },
    output: {},
  };
  runInNewContext(source, context);
  assert.equal(context.output.eventCalendarDay, "29 February 2032");
  assert.equal(context.output.eventCalendarMonthOffset, -8);
});

test("native acceptance flows are invoked and require real, distinct JUnit reports", () => {
  assert.equal(flows.length, 13);
  for (const name of ["08-groups", "09-group-invitations", "12-organizations", "13-event-draft"])
    assert(flows.includes(name), `${name} missing from the executable Maestro commands`);
  for (const name of flows)
    assert(existsSync(new URL(`../../apps/mobile/.maestro/flows/${name}.yaml`, import.meta.url)));
  assert(script.includes('--output "/tmp/maestro-reports/$FLOW.xml"'));
  assert(script.includes('--test-output-dir "/tmp/maestro-debug/$FLOW"'));
  assert(script.includes("trap persist EXIT"));
  const verification = script.slice(
    script.indexOf("python3 .github/scripts/verify-maestro-reports.py"),
  );
  for (const name of flows) assert(verification.includes(name));
  for (const workflow of workflows) {
    assert.deepEqual(
      [...workflow.matchAll(/^\s+flow: ([\w-]+)$/gm)].map((match) => match[1]),
      flows,
    );
    const native = workflow.split("  e2e-maestro:")[1].split(/\n {2}[\w-]+:/)[0];
    assert.doesNotMatch(native, /continue-on-error|no-junit-output|all-flows-passed/);
    for (const phase of ["sdk", "avd", "boot", "install", "warm", "seed", "verify", "cleanup"])
      assert(native.includes(`phase: ${phase}`));
    assert.match(native, /if: always\(\)[\s\S]*?phase: cleanup/);
    assert.equal((native.match(/phase: boot/g) ?? []).length, 1);
    assert.equal((native.match(/phase: install/g) ?? []).length, 1);
    assert.equal((native.match(/phase: seed/g) ?? []).length, 1);
    assert(native.indexOf("phase: cleanup") < native.indexOf("uses: actions/upload-artifact@v4"));
  }
  assert.doesNotMatch(script, /all-flows-passed|summary\.xml/);
});
test("PR native acceptance attempts every flow after a failure without weakening its result", () => {
  const native = workflows[0].split("  e2e-maestro:")[1].split(/\n {2}[\w-]+:/)[0];
  assert.match(native, /id: maestro_ready[\s\S]*?phase: seed/);
  const steps = native.split(/\n {6}- name:/).filter((step) => /phase: (flow|verify)\b/.test(step));
  assert.equal(steps.length, 14);
  for (const step of steps) {
    const expression = step.match(/if: \$\{\{ (.+) \}\}/)?.[1];
    assert.equal(expression, "!cancelled() && steps.maestro_ready.outcome == 'success'");
    const evaluate = new Function("cancelled", "steps", `return ${expression}`);
    for (const previous of ["success", "failure", "skipped"]) {
      for (const ready of ["success", "failure", "skipped"]) {
        for (const cancelled of [false, true]) {
          assert.equal(
            evaluate(() => cancelled, {
              maestro_ready: { outcome: ready },
              previous_flow: { outcome: previous },
            }),
            !cancelled && ready === "success",
          );
        }
      }
    }
  }
  assert.doesNotMatch(native, /continue-on-error/);
  const watchdog = readFileSync(
    new URL("../workflows/pr-ci-fail-fast.yml", import.meta.url),
    "utf8",
  );
  assert(watchdog.includes('select(.conclusion == "failure")'));
  assert.doesNotMatch(watchdog, /\.steps\[\]/);
});
test("managed HeroUI patch preserves popup sizing, controlled initial sheet index and genuine pan closure", () => {
  const patch = readFileSync(
    new URL("../../patches/heroui-native@1.0.9.patch", import.meta.url),
    "utf8",
  );
  assert.equal((patch.match(/^diff --git /gm) ?? []).length, 8);
  assert.deepEqual(
    patch.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++")),
    [
      "+        style: StyleSheet.absoluteFill,",
      "+      style: StyleSheet.absoluteFill,",
      "+    if (isPanActivated.get() && value > 1.5 && !isDragging.get() && !isClosingOnSwipe.get()) {",
      "+      index: isOpen ? initialIndex ?? 0 : -1,",
      "+            style={StyleSheet.absoluteFill}",
      "+          style={StyleSheet.absoluteFill}",
      "+      if (isPanActivated.get() && value > 1.5 && !isDragging.get() && !isClosingOnSwipe.get()) {",
      "+          index={isOpen ? (initialIndex ?? 0) : -1}",
    ],
  );
  const workspace = readFileSync(new URL("../../pnpm-workspace.yaml", import.meta.url), "utf8");
  assert(workspace.includes("heroui-native@1.0.9: patches/heroui-native@1.0.9.patch"));
  for (const [path, expected] of [
    [
      "src/components/popover/popover.tsx",
      /pointerEvents="box-none"\s+style=\{StyleSheet\.absoluteFill\}/,
    ],
    [
      "lib/module/components/popover/popover.js",
      /pointerEvents: "box-none",\s+style: StyleSheet\.absoluteFill/,
    ],
    [
      "src/components/select/select.tsx",
      /pointerEvents="box-none"\s+style=\{StyleSheet\.absoluteFill\}/,
    ],
    [
      "lib/module/components/select/select.js",
      /pointerEvents: "box-none",\s+style: StyleSheet\.absoluteFill/,
    ],
  ]) {
    const installed = readFileSync(
      new URL(`../../node_modules/heroui-native/${path}`, import.meta.url),
      "utf8",
    );
    const driven = installed.split("if (isDrivenEntering) {")[1].split("// Fallback path:")[0];
    assert.match(driven, expected);
    assert.match(driven, /exiting[=:]/);
    assert.match(driven, /Animated(?:Popover)?Content/);
    assert.match(driven, /rEnteringStyle/);
    assert.doesNotMatch(driven, /no-hide-descendants|accessibilityElementsHidden/);
  }
  assert.deepEqual(
    patch.split("\n").filter((line) => line.startsWith("-") && !line.startsWith("---")),
    [
      "-    if (value > 1.5 && !isDragging.get() && !isClosingOnSwipe.get()) {",
      "-      index: -1,",
      "-      if (value > 1.5 && !isDragging.get() && !isClosingOnSwipe.get()) {",
      "-          index={-1}",
    ],
  );
  for (const [path, expected] of [
    [
      "src/helpers/internal/components/bottom-sheet-content.tsx",
      /index=\{isOpen \? \(initialIndex \?\? 0\) : -1\}/,
    ],
    [
      "lib/module/helpers/internal/components/bottom-sheet-content.js",
      /index: isOpen \? initialIndex \?\? 0 : -1/,
    ],
    [
      "src/helpers/internal/components/bottom-sheet-content-container.tsx",
      /isPanActivated\.get\(\) && value > 1\.5/,
    ],
    [
      "lib/module/helpers/internal/components/bottom-sheet-content-container.js",
      /isPanActivated\.get\(\) && value > 1\.5/,
    ],
  ]) {
    assert.match(
      readFileSync(new URL(`../../node_modules/heroui-native/${path}`, import.meta.url), "utf8"),
      expected,
    );
  }
});
test("fresh native launch preserves real contacts and notification permission prompts", () => {
  const welcome = readFileSync(
    new URL("../../apps/mobile/.maestro/flows/01-launch-welcome.yaml", import.meta.url),
    "utf8",
  ).replace(/\r\n/g, "\n");
  const launch = welcome.split("- launchApp:")[1]?.split(/\n- /)[0];
  assert(launch);
  assert.match(launch, /^\s+contacts: deny$/m);
  assert.match(launch, /^\s+notifications: deny$/m);
  assert.doesNotMatch(launch, /clearState: true|contacts: allow|notifications: allow/);
  const contacts = journey("05-contacts-follow-block");
  assert.equal(
    contacts.filter((step) => step.extendedWaitUntil?.visible === ".*[Aa]llow.*contacts.*").length,
    2,
  );
  for (const action of ["Don.t allow", "Yes", "Allow"]) assert(contains(contacts, "tapOn", action));
  assert(contains(contacts, "tapOn", { id: "confirmation-cancel" }));
  assert(
    contains(contacts, "extendedWaitUntil", {
      notVisible: { id: "enable-contacts-btn" },
      timeout: 30000,
    }),
  );
});
test("native help and legends wait for visible portal content without dropping assertions", () => {
  for (const name of ["05-contacts-follow-block", "06-match-wizard", "12-organizations"]) {
    const steps = journey(name);
    assert(contains(steps, "extendedWaitUntil", { visible: "Search help", timeout: 30000 }));
    assert(contains(steps, "assertVisible", "Type at least 4 characters to search"));
    assert(contains(steps, "assertNotVisible", "Search help"));
  }
  const contacts = journey("05-contacts-follow-block");
  for (const title of ["Friendship accepted.", "Requests awaiting your reply."])
    assert(contains(contacts, "extendedWaitUntil", { visible: title, timeout: 30000 }));
  for (const text of [
    "People you follow.",
    "People who follow you.",
    "People you have blocked.",
    "Online",
    "Offline",
    "Requests awaiting their reply.",
  ])
    assert(contains(contacts, "assertVisible", text));
});
test("native device verification uses Clerk development fixtures, without disabling Device Trust", () => {
  const provision = readFileSync(
    new URL("../actions/provision-e2e-user/action.yml", import.meta.url),
    "utf8",
  );
  assert.match(provision, /case "\$CLERK_SECRET_KEY" in\s+sk_test_\*/);
  assert.equal((provision.match(/\+clerk_test@gmail\.com/g) ?? []).length, 2);
  const helper = readFileSync(
    new URL("../../apps/mobile/.maestro/helpers/verify-clerk-device.yaml", import.meta.url),
    "utf8",
  );
  assert(helper.includes('visible: "Check your email|Mobile number|Matches"'));
  assert(helper.includes('inputText: "424242"'));
  const signIn = readFileSync(
    new URL("../../apps/mobile/.maestro/helpers/sign-in.yaml", import.meta.url),
    "utf8",
  );
  assert(signIn.includes('visible: "^Email address$"'));
  assert(signIn.includes("[Ee]nter your [Ee]mail"));
  assert(signIn.includes(`inputText: \${AUTH_EMAIL}`));
  assert.match(
    signIn,
    /inputText: \$\{AUTH_PASSWORD\}\n- tapOn: "Continue"\n- runFlow: verify-clerk-device.yaml/,
  );
  for (const [name, expected] of [
    ["02-login", 1],
    ["05-contacts-follow-block", 4],
    ["07-reauth-after-logout", 1],
    ["09-group-invitations", 3],
  ]) {
    const steps = journey(name);
    const emails = steps.filter(
      (step, index) =>
        (step.inputText === "${EMAIL}" || step.inputText === "${EMAIL_2}") &&
        steps[index + 1]?.assertVisible === "${output.authEmailPattern}",
    );
    assert.equal(emails.length, expected, name);
    const passwords = steps.filter(
      (step) => step.inputText === "${PASSWORD}" || step.inputText === "${PASSWORD_2}",
    );
    assert.equal(passwords.length, expected, name);
    for (let index = 0; index < expected; index++)
      assert.equal(
        emails[index].inputText.endsWith("_2}"),
        passwords[index].inputText.endsWith("_2}"),
      );
    assert(!steps.some((step) => String(step.inputText).includes("USERNAME")));
  }
  for (const workflow of workflows)
    assert.match(workflow.split("  e2e-maestro:")[1].split(/\n {2}[\w-]+:/)[0], /E2E_EMAIL:/);
});
test("native sign-in fully replaces remembered actor/target credentials before authenticating", () => {
  const targetEmail = "e2e_target.38247581797.1.abcdef+clerk_test@gmail.com";
  assert(targetEmail.length > 50 && targetEmail.length <= 100);
  const signIn = readFileSync(
    new URL("../../apps/mobile/.maestro/helpers/sign-in.yaml", import.meta.url),
    "utf8",
  ).replace(/\r\n/g, "\n");
  assert(signIn.includes('visible: "Last used"'));
  const rememberedPattern = signIn.match(/- longPressOn: '([^']+)'/)?.[1];
  assert(rememberedPattern);
  const rememberedEmail = new RegExp(rememberedPattern);
  for (const email of [targetEmail, "previous.development@example.invalid"]) {
    assert.match(email, rememberedEmail);
  }
  for (const label of ["Last used", "Email address", "Enter your email", "user@host extra"]) {
    assert.doesNotMatch(label, rememberedEmail);
  }
  assert(signIn.includes('- tapOn: "[Ss]elect [Aa]ll"'));
  const selectAll = signIn.indexOf('- tapOn: "[Ss]elect [Aa]ll"');
  const deletion = signIn.indexOf("- eraseText: 1", selectAll);
  const entry = signIn.indexOf("- inputText: ${AUTH_EMAIL}", deletion);
  assert(selectAll < deletion && deletion < entry);
  assert(signIn.includes("- eraseText: 100\n- inputText: ${AUTH_PASSWORD}"));
  assert.match(
    signIn,
    /inputText: \$\{AUTH_EMAIL\}\n- assertVisible: \$\{output.authEmailPattern\}\n- tapOn: "Continue"/,
  );
  const script = readFileSync(
    new URL("../../apps/mobile/.maestro/helpers/auth-email.js", import.meta.url),
    "utf8",
  );
  const output = {};
  runInNewContext(script, { AUTH_EMAIL: targetEmail, AUTH_PASSWORD: "fixture-password", output });
  for (const AUTH_EMAIL of ["", "not-email", "user@host extra"])
    assert.throws(() =>
      runInNewContext(script, { AUTH_EMAIL, AUTH_PASSWORD: "fixture-password", output: {} }),
    );
  assert.throws(() =>
    runInNewContext(script, { AUTH_EMAIL: targetEmail, AUTH_PASSWORD: "", output: {} }),
  );
  const exactEmail = new RegExp(output.authEmailPattern);
  assert.match(targetEmail, exactEmail);
  for (const leftover of [
    `prefix${targetEmail}`,
    `${targetEmail}suffix`,
    targetEmail.replace("+", ""),
  ]) {
    assert.doesNotMatch(leftover, exactEmail);
  }
});
test("native country search verifies complete input before empty and short-code outcomes", () => {
  const login = readFileSync(
    new URL("../../apps/mobile/.maestro/flows/02-login.yaml", import.meta.url),
    "utf8",
  ).replace(/\r\n/g, "\n");
  for (const [character, prefix] of [
    ["z", "z"],
    ["z", "zz"],
    ["z", "zzz"],
    ["z", "zzzz"],
    ["D", "D"],
    ["E", "DE"],
    ["I", "I"],
    ["T", "IT"],
  ])
    assert(login.includes(`- inputText: "${character}"\n- assertVisible: "^${prefix}$"`));
  assert.equal(login.match(/- inputText: "z"/g)?.length, 4);
  assert(!login.includes('- inputText: "zzzz"'));
  assert(login.includes('assertVisible: "No countries found"'));
  assert(login.includes('tapOn: "Germany"'));
  assert(login.includes('tapOn: "Italy"'));
  assert.equal((login.match(/notVisible: "\^Search countries\$"/g) ?? []).length, 2);
  assert.match(login, /visible: "Mobile number"\s+timeout: 120000/);
  const commands = parseAllDocuments(login)[1].toJSON();
  const conditional = commands.filter((step) => step.runFlow?.when);
  assert.equal(conditional.length, 3);
  for (const step of conditional)
    assert.deepEqual(step.runFlow, {
      when: { visible: { id: ".*inputmethod.*:id/.*" } },
      commands: ["hideKeyboard"],
    });
});
test("native password entry selects the input placeholder, never the heading or account hint", () => {
  const signIn = readFileSync(
    new URL("../../apps/mobile/.maestro/helpers/sign-in.yaml", import.meta.url),
    "utf8",
  );
  const selector = signIn.match(/^- tapOn: "([^"\n]*assword[^"\n]*)"$/m)?.[1];
  assert(selector);
  const passwordInput = new RegExp(selector);
  assert.match("Enter your password", passwordInput);
  for (const other of [
    "Enter password",
    "Enter the password associated with your account",
    "Show password",
    "Forgot password?",
  ])
    assert.doesNotMatch(other, passwordInput);
  assert(signIn.includes(`visible: "${selector}"`));
});
test("native social flows select the search input and named actions, never the help trigger", () => {
  for (const name of ["05-contacts-follow-block", "09-group-invitations"]) {
    const steps = journey(name);
    assert(contains(steps, "tapOn", { id: "contact-search-input" }));
    assert(contains(steps, "eraseText", 100));
    for (const actor of ["Test", "Target"])
      assert(contains(steps, "tapOn", `^Actions: E2E ${actor}$`));
    assert(contains(steps, "tapOn", { id: "confirm-accept_friend_request-btn" }));
    assert(!contains(steps, "tapOn", "Actions"));
    assert(!contains(steps, "tapOn", ".*[Ss]earch.*users.*"));
    assert(!JSON.stringify(steps).includes("respond-accept-friend-request-btn"));
  }
  const input = /^Search users by name or email$/;
  assert.match("Search users by name or email", input);
  assert.doesNotMatch("Search users by name or email: Search help", input);
});
test("contact searches wait for API results, not an already-visible address-book duplicate", () => {
  const steps = nativeSteps("helpers/contact-search.yaml");
  const target = {
    text: "${CONTACT_ACTIONS}",
    below: { text: "^Search results$" },
    above: { text: "^Device Contacts$" },
  };
  assert(contains(steps, "extendedWaitUntil", { visible: target, timeout: 90000 }));
  assert(contains(steps, "assertVisible", target));
  assert(!contains(steps, "extendedWaitUntil", { visible: "${CONTACT_ACTIONS}", timeout: 90000 }));
  assert(contains(steps, "tapOn", { id: "contact-search-input" }));
  assert(!contains(steps, "tapOn", "^Search users by name or email$"));
  const cleared = steps.findIndex((step) => step.assertNotVisible === "Clear search");
  const typed = steps.findIndex((step) => step.inputText === "${CONTACT_EMAIL}");
  assert(cleared >= 0 && cleared < typed);
  assert(
    contains(steps, "assertVisible", {
      id: "contact-search-input",
      text: "${output.contactEmailPattern}",
    }),
  );
  assert(contains(steps, "openLink", "bgo:///contacts?tab=search"));
  assert(
    contains(steps, "extendedWaitUntil", {
      visible: { id: "contact-search-input" },
      timeout: 30000,
    }),
  );
  assert(contains(steps, "runScript", "contact-email.js"));
  const script = readFileSync(
    new URL("../../apps/mobile/.maestro/helpers/contact-email.js", import.meta.url),
    "utf8",
  );
  const context = { CONTACT_EMAIL: "fixture+clerk_test@example.test", output: {} };
  runInNewContext(script, context);
  const exact = new RegExp(context.output.contactEmailPattern);
  assert(exact.test(context.CONTACT_EMAIL));
  assert(!exact.test(context.CONTACT_EMAIL.repeat(2)));
  assert(!exact.test("fixtureclerk_test@example.test"));
  for (const CONTACT_EMAIL of [undefined, "", "invalid"])
    assert.throws(() => runInNewContext(script, { CONTACT_EMAIL, output: {} }));
});

test("native profile completion closes only the actual keyboard before Continue", () => {
  const flow = readFileSync(
    new URL("../../apps/mobile/.maestro/flows/02-login.yaml", import.meta.url),
    "utf8",
  ).replace(/\r\n/g, "\n");
  const completion = flow.split('- inputText: "not a formatted phone"')[1];
  assert(completion);
  assert.match(
    completion,
    /scrollUntilVisible:\s+element:\s+text: "\^Continue\$"\s+direction: DOWN\s+- tapOn: "\^Continue\$"/,
  );
  const steps = journey("02-login");
  const input = steps.findIndex((step) => step.inputText === "not a formatted phone");
  assert.deepEqual(steps[input + 1].assertVisible, {
    id: "mobile-number-input",
    text: "^not a formatted phone$",
  });
  const keyboard = steps[input + 2].runFlow;
  assert.deepEqual(keyboard.when, { visible: { id: ".*inputmethod.*:id/.*" } });
  assert.deepEqual(keyboard.commands, ["hideKeyboard"]);
  const gone = steps.findIndex(
    (step, index) =>
      index > input && step.extendedWaitUntil?.notVisible?.id === keyboard.when.visible.id,
  );
  const proceed = steps.findIndex((step, index) => index > input && step.tapOn === "^Continue$");
  assert(input < gone && gone < proceed);
  for (const country of ["Germany", "Italy"]) {
    const selected = steps.findIndex((step) => step.tapOn === country);
    assert.equal(steps[selected - 1].extendedWaitUntil.notVisible.id, keyboard.when.visible.id);
    assert.deepEqual(steps[selected - 3].runFlow, keyboard);
    assert.equal(steps[selected + 1].extendedWaitUntil.notVisible, "^Search countries$");
  }
  assert.match(completion, /visible: "Matches"\s+timeout: 120000/);
});
test("native community acceptance follows confirmed counts and table-only legends without a repeated venue", () => {
  const organization = journey("12-organizations");
  const table = journey("13-event-draft");
  assert(contains(organization, "assertVisible", "Confirmed members: 1"));
  assert(!contains(organization, "assertVisible", "Approved members: 1"));
  assert(contains(table, "assertNotVisible", "Table location help"));
  assert(!contains(table, "tapOn", "Table location help"));
  assert(contains(table, "tapOn", "Table name help"));
  for (const legend of [
    "Confirmed players.",
    "Maximum seats here; free places in Seats.",
    "Reserved places, including pending requests.",
  ])
    assert(
      contains(table, "assertVisible", legend) ||
        contains(table, "extendedWaitUntil", { visible: legend, timeout: 30000 }),
    );
});
test("native event acceptance uses the catalog game actually seeded by CI", () => {
  const steps = journey("13-event-draft");
  const seed = readFileSync(
    new URL("../../apps/api/src/app/api/admin/ci-db/route.ts", import.meta.url),
    "utf8",
  );
  assert(seed.includes('name: "Cascadia"'));
  assert(contains(steps, "tapOn", "Select: Cascadia"));
  assert(!contains(steps, "tapOn", "Select: Catan"));
});
test("the gallery fixture is committed and pushed to the emulator before community acceptance", () => {
  const push = script.indexOf(
    "adb push apps/mobile/assets/icon.png /sdcard/Pictures/bgo-organization-logo.png",
  );
  assert(push >= 0);
  assert(script.includes('if [ "$FLOW" = "12-organizations" ]'));
  assert(push < script.indexOf("maestro test"));
  assert(existsSync(new URL("../../apps/mobile/assets/icon.png", import.meta.url)));
  assert(script.includes("android.intent.action.MEDIA_SCANNER_SCAN_FILE"));
});

test("emulator survives successful boot only, with guaranteed job teardown", () => {
  const emulator = readFileSync(
    new URL("../actions/android-emulator/action.yml", import.meta.url),
    "utf8",
  ).replace(/\r\n/g, "\n");
  assert(emulator.includes("nohup bash -c '"));
  assert(emulator.includes('"$ANDROID_HOME/emulator/emulator" "$@" &'));
  assert(emulator.includes("read -r EMU_PID < /tmp/bgo-emulator.pid"));
  assert(emulator.includes('echo "BGO_EMULATOR_PID=$EMU_PID" >> "$GITHUB_ENV"'));
  assert(emulator.includes('if [ "$EMULATOR_READY" != "1" ]; then kill "$EMU_PID"'));
  assert(script.includes('kill "$BGO_EMULATOR_PID"'));
  assert.match(action, /bash -e -o pipefail/);
  assert(script.startsWith("#!/usr/bin/env bash\nset -euo pipefail"));
});
test("emulator watcher records the real child PID and exit status with supported software rendering", () => {
  const emulator = readFileSync(
    new URL("../actions/android-emulator/action.yml", import.meta.url),
    "utf8",
  ).replace(/\r\n/g, "\n");
  assert.match(emulator, /-gpu swiftshader -memory/);
  assert.doesNotMatch(emulator, /-gpu swiftshader_indirect/);
  const wrapper = emulator.match(/nohup bash -c '\n([\s\S]*?)\n {8}' _ -avd/)?.[1];
  assert(wrapper);
  const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
  for (const code of [0, 139]) {
    const folder = mkdtempSync(join(tmpdir(), "bgo-emulator-exit-"));
    try {
      mkdirSync(join(folder, "emulator"));
      const executable = join(folder, "emulator/emulator");
      // Unit-only process fixture: never starts an Android device.
      writeFileSync(executable, `#!/usr/bin/env bash\nexit ${code}\n`, { mode: 0o755 });
      const result = spawnSync(
        bash,
        ["-e", "-c", wrapper.replaceAll("/tmp/bgo-emulator.pid", '"$PID_FILE"')],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            ANDROID_HOME: folder.replaceAll("\\", "/"),
            PID_FILE: join(folder, "pid").replaceAll("\\", "/"),
          },
        },
      );
      assert.equal(result.status, code, result.stderr);
      assert.match(result.stdout, new RegExp(`Emulator exit code: ${code}`));
      assert.match(readFileSync(join(folder, "pid"), "utf8"), /^\d+\n$/);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  }
});

test("native UI acceptance installs and selects rendering-enabled Google APIs for Expo Location, never ATD", () => {
  const emulator = readFileSync(
    new URL("../actions/android-emulator/action.yml", import.meta.url),
    "utf8",
  ).replace(/\r\n/g, "\n");
  assert(emulator.includes('"$SDKMGR" "system-images;android-34;google_apis;x86_64"'));
  assert.doesNotMatch(emulator, /system-images;android-34;(aosp_atd|google_atd|default)/);
  assert.match(emulator, /adb shell pm path com\.google\.android\.gms \| grep -q '\^package:'/);
  const avd = emulator.match(
    /- name: 🚀 Create AVD[\s\S]*?run: \|\n([\s\S]*?)\n {4}- name: 📱 Boot emulator/,
  )?.[1];
  assert(avd);
  const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
  const result = spawnSync(
    bash,
    [
      "-e",
      "-o",
      "pipefail",
      "-c",
      `
      HOME=$(mktemp -d)
      trap 'rm -rf "$HOME"' EXIT
      ANDROID_HOME="$HOME/sdk"
      GITHUB_ENV="$HOME/github-env"
      # Cached AOSP/ATD must not override the required Google Play Services image.
      mkdir -p "$ANDROID_HOME/system-images/android-34/"{aosp_atd,default,google_apis}
      avdmanager() {
        printf '%s\\n' "$@"
        if [ "$1" = create ]; then touch "$ANDROID_AVD_HOME/test.ini"; fi
      }
      ${avd.replaceAll("/tmp/avd-create.log", '"$HOME/avd-create.log"')}
    `,
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /system-images;android-34;google_apis;x86_64/);
  assert.doesNotMatch(result.stdout, /aosp_atd/);
});
test("native boot verifies KVM and never falls back to software CPU emulation", () => {
  const emulator = readFileSync(
    new URL("../actions/android-emulator/action.yml", import.meta.url),
    "utf8",
  );
  for (const guard of ["test -c /dev/kvm", "test -r /dev/kvm", "test -w /dev/kvm"])
    assert(emulator.includes(guard));
  assert(emulator.includes("sudo udevadm control --reload-rules"));
  assert(emulator.includes("sudo udevadm trigger --name-match=kvm --settle"));
  assert(emulator.indexOf("--settle") < emulator.indexOf("test -r /dev/kvm"));
  assert(emulator.includes("runner lacks read/write permission after udev settlement"));
  assert(emulator.includes('"$ANDROID_HOME/emulator/emulator" -accel-check'));
  assert(emulator.indexOf("-accel-check") < emulator.indexOf("nohup bash"));
  assert(emulator.includes("-accel on"));
  assert.doesNotMatch(emulator, /-accel (?:off|auto)/);
  for (const workflow of workflows)
    assert.match(workflow.split("  e2e-maestro:")[1], /runs-on: ubuntu-latest/);
});
test("KVM permission checks await the triggered rule and fail before the accelerator probe when denied", () => {
  const emulator = readFileSync(
    new URL("../actions/android-emulator/action.yml", import.meta.url),
    "utf8",
  );
  const guards = emulator.match(/# Fail early[^\n]*\n([\s\S]*?)# Keep the same emulator/)[1];
  const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
  for (const allowed of ["0", "1"]) {
    const result = spawnSync(
      bash,
      [
        "-e",
        "-o",
        "pipefail",
        "-c",
        `
      ANDROID_HOME=$(mktemp -d)
      trap 'rm -rf "$ANDROID_HOME"' EXIT
      mkdir -p "$ANDROID_HOME/emulator"
      printf '#!/bin/sh\\n[ "$1" = "-accel-check" ] && echo accelerator-probe\\n' > "$ANDROID_HOME/emulator/emulator"
      chmod +x "$ANDROID_HOME/emulator/emulator"
      KVM_READY=0
      test() {
        case "$*" in
          '-c /dev/kvm') return 0 ;;
          '-r /dev/kvm'|'-w /dev/kvm') [ "$KVM_READY" = 1 ] && [ '${allowed}' = 1 ] ;;
          *) builtin test "$@" ;;
        esac
      }
      sudo() {
        case "$*" in
          'tee /etc/udev/rules.d/99-kvm4all.rules') cat >/dev/null ;;
          'udevadm control --reload-rules') return 0 ;;
          'udevadm trigger --name-match=kvm --settle') KVM_READY=1 ;;
          'udevadm trigger --name-match=kvm') KVM_READY=0 ;;
          *) return 2 ;;
        esac
      }
      ls() { echo fixture-kvm-mode; }
      id() { echo fixture-runner-user; }
      ${guards}
    `,
      ],
      { encoding: "utf8" },
    );
    assert.equal(result.status, allowed === "1" ? 0 : 1, result.stderr);
    if (allowed === "1") assert.match(result.stdout, /accelerator-probe/);
    else {
      assert.doesNotMatch(result.stdout, /accelerator-probe/);
      assert.match(result.stderr, /runner lacks read\/write permission after udev settlement/);
    }
  }
});
test("group update acceptance targets the saved detail heading instead of duplicate toast/form text", () => {
  const groups = readFileSync(
    new URL("../../apps/web/e2e/groups.spec.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(groups, /page\.getByText\("Updated Players"\)/);
  assert.match(
    groups,
    /getByRole\("heading", \{ name: "Updated Players", exact: true, level: 1 \}\)/,
  );
});
test("boot lifetime spans steps, but failed boot kills its process", () => {
  const emulator = readFileSync(
    new URL("../actions/android-emulator/action.yml", import.meta.url),
    "utf8",
  );
  const trap = emulator.match(/^\s*(trap 'if \[ "\$EMULATOR_READY".* EXIT)$/m)?.[1];
  assert(trap);
  const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
  for (const ready of ["0", "1"]) {
    const r = spawnSync(
      bash,
      [
        "-e",
        "-c",
        `
      sleep 60 >/dev/null 2>&1 &
      pid=$!
      trap 'kill "$pid" 2>/dev/null || true' EXIT
      (EMU_PID=$pid; EMULATOR_READY=${ready}; ${trap})
      if [ "${ready}" = "0" ]; then wait "$pid" || true; fi
      if kill -0 "$pid" 2>/dev/null; then echo alive; else echo stopped; fi
    `,
      ],
      { encoding: "utf8" },
    );
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), ready === "1" ? "alive" : "stopped");
  }
});
test("address-book seed preserves spaced names through adb's remote shell and verifies them", () => {
  const body = script.match(/\n {2}seed\)\n([\s\S]*?)\n {4};;/)?.[1];
  assert(body);
  const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
  const folder = mkdtempSync(join(tmpdir(), "bgo-contact-seed-"));
  const file = join(folder, "names.txt");
  const run = (empty) =>
    spawnSync(
      bash,
      [
        "-e",
        "-o",
        "pipefail",
        "-c",
        `
    content() {
      case "$1" in
        insert)
          for arg in "$@"; do
            case "$arg" in data1:s:*) printf '%s\\n' "\${arg#data1:s:}" >> "$NAMES_FILE";; esac
          done;;
        query)
          if [[ "$*" == *raw_contacts* ]]; then
            echo 'Row: 0 _id=1'
          elif [ "$EMPTY_QUERY" = 0 ]; then
            while IFS= read -r name; do printf 'display_name=%s\\n' "$name"; done < "$NAMES_FILE"
          fi;;
      esac
    }
    adb() { shift; (eval "$*"); }
    ${body}
  `,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          NAMES_FILE: file.replaceAll("\\", "/"),
          EMPTY_QUERY: String(empty),
          E2E_TARGET_PHONE: "+199999999000001",
        },
      },
    );
  try {
    const ok = run(0);
    assert.equal(ok.status, 0, ok.stderr);
    const names = readFileSync(file, "utf8").trim().split(/\r?\n/);
    assert(names.includes("E2E Unregistered"));
    for (let i = 1; i <= 43; i++) assert(names.includes(`ZZ Page ${i}`));
    assert.notEqual(
      run(1).status,
      0,
      "Missing native names must fail seeding, not later UI acceptance",
    );
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
test("each native flow preserves quoting, failure exit status and partial reports", () => {
  const body = script.match(/\n {2}flow\)\n([\s\S]*?)\n {4};;/)?.[1];
  assert(body);
  const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
  const run = (exit, name = "01-launch-welcome", username = "fixture $(not-expanded)") =>
    spawnSync(
      bash,
      [
        "-e",
        "-o",
        "pipefail",
        "-c",
        `
        adb() { :; }
        stop_recording() { :; }
        persist() { echo persisted; }
        capture() { echo captured; }
        maestro() { printf '%s\\n' "$@"; return "$TEST_EXIT"; }
        set -- flow "$TEST_FLOW"
        ${body}
        echo finished
      `,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          TEST_EXIT: String(exit),
          TEST_FLOW: name,
          E2E_USERNAME: username,
          E2E_EMAIL: "fixture.actor@example.invalid",
          E2E_PASSWORD: "fixture password with spaces",
          E2E_TARGET_EMAIL: "fixture@example.invalid",
          E2E_TARGET_USERNAME: "fixture target",
          E2E_TARGET_PASSWORD: "fixture target password",
        },
      },
    );
  const ok = run(0);
  assert.equal(ok.status, 0, ok.stderr);
  assert(ok.stdout.includes("USERNAME=fixture $(not-expanded)"));
  assert(ok.stdout.includes("EMAIL=fixture.actor@example.invalid"));
  assert(ok.stdout.includes("PASSWORD=fixture password with spaces"));
  assert(ok.stdout.includes("/tmp/maestro-reports/01-launch-welcome.xml"));
  assert(ok.stdout.includes("persisted"));
  assert(ok.stdout.includes("finished"));
  const failed = run(1);
  assert.equal(failed.status, 1, failed.stderr);
  assert(failed.stdout.includes("captured"));
  assert(failed.stdout.includes("persisted"));
  assert(!failed.stdout.includes("finished"));
  assert.notEqual(run(0, "unrequested-flow").status, 0);
  assert.notEqual(run(0, "01-launch-welcome", "").status, 0);
});

test("native invite sharing requires the actual clipboard action across Android sharesheet labels", () => {
  const steps = journey("05-contacts-follow-block");
  const pattern = steps.find(
    (step) => step.extendedWaitUntil?.visible === "^(Copy|Copy to clipboard|Copy link)$",
  )?.extendedWaitUntil.visible;
  assert(contains(steps, "tapOn", pattern));
  assert(contains(steps, "extendedWaitUntil", { notVisible: pattern, timeout: 30000 }));
  assert(
    contains(steps, "extendedWaitUntil", {
      visible: { id: "contact-search-input" },
      timeout: 30000,
    }),
  );
  assert(pattern);
  const clipboard = new RegExp(pattern);
  for (const label of ["Copy", "Copy to clipboard", "Copy link"]) assert(clipboard.test(label));
  for (const label of ["Sharing link", "Chrome", "Copy failed", "Clipboard unavailable"]) {
    assert(!clipboard.test(label));
  }
});

test("native event acceptance targets real controls, fixed footers and completed save transitions", () => {
  const clock = nativeSteps("helpers/event-time.yaml");
  assert(contains(clock, "tapOn", { id: "android:id/toggle_mode" }));
  const steps = journey("13-event-draft");
  assert(contains(steps, "tapOn", "Global ratings enabled, off"));
  assert.equal(
    steps.filter(
      (step) =>
        step.assertVisible?.text === "Global ratings enabled, on" &&
        step.assertVisible.checked === true,
    ).length,
    2,
  );
  const footer = steps.findIndex((step) => step.assertVisible?.id === "event-navigation-bar");
  assert.equal(steps[footer + 1].assertVisible, "Publish event");
  assert.equal(steps[footer + 2].tapOn, "Publish event");
  assert(!steps.some((step) => step.scrollUntilVisible?.element?.text === "Publish event"));
  const save = steps.findLastIndex((step) => step.tapOn?.id === "confirmation-action-0");
  assert.deepEqual(steps[save + 1].extendedWaitUntil, {
    visible: { id: "edit-event-fab" },
    timeout: 30000,
  });
  assert(contains(steps.slice(save), "assertNotVisible", { id: "confirmation-dialog" }));
  for (let index = 0; index < steps.length - 1; index++)
    if (steps[index].tapOn === "Clear search") assert(!("hideKeyboard" in steps[index + 1]));
});

test("final dark-mode acceptance signs out explicitly without clearing authenticated app state", () => {
  const steps = journey("04-dark-mode");
  assert.equal(steps[0].launchApp.stopApp, true);
  assert.equal(steps[0].launchApp.clearState, false);
  assert(contains(steps, "tapOn", "^Logout$"));
  assert(
    contains(steps, "extendedWaitUntil", {
      visible: "Welcome to Board Game Organizer",
      timeout: 180000,
    }),
  );
  assert(contains(steps, "assertVisible", "Sign in / Register"));
  assert(contains(steps, "assertNotVisible", { id: "profile-button" }));
});

test("native event date selects the real calendar year, month and fully qualified day", () => {
  const source = readFileSync(
    new URL("../../apps/mobile/.maestro/helpers/event-date.js", import.meta.url),
    "utf8",
  );
  const months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
  for (const [index, month] of months.entries()) {
    const context = { DATE: "06/12/2030", maestro: { copiedText: `Tue, ${month} 13` }, output: {} };
    runInNewContext(source, context);
    assert.equal(context.output.eventCalendarYear, "2030");
    assert.equal(context.output.eventCalendarMonthOffset, 5 - index);
    assert.equal(context.output.eventCalendarDay, "12 June 2030");
  }
  for (const [DATE, copiedText] of [
    ["invalid", "Tue, Oct 13"],
    ["06/12/2030", "invalid"],
    ["00/12/2030", "Tue, Oct 13"],
    ["13/12/2030", "Tue, Oct 13"],
    ["06/00/2030", "Tue, Oct 13"],
    ["06/32/2030", "Tue, Oct 13"],
  ])
    assert.throws(() => runInNewContext(source, { DATE, maestro: { copiedText }, output: {} }));
  const helper = readFileSync(
    new URL("../../apps/mobile/.maestro/helpers/event-date.yaml", import.meta.url),
    "utf8",
  );
  assert(helper.includes('id: "android:id/date_picker_header_date"'));
  assert(helper.includes('id: "android:id/date_picker_header_year"'));
  assert(helper.includes("output.eventCalendarDay"));
  assert(!helper.includes("Switch to text input"));
});

test("native BGG collection uses its seeded actor and the current four-step match wizard", () => {
  const steps = journey("10-bgg-collection");
  assert(contains(steps, "inputText", "${EMAIL}"));
  assert(contains(steps, "inputText", "${PASSWORD}"));
  const login = steps.findIndex((step) => step.inputText === "${EMAIL}");
  const seeded = steps.findIndex((step) => step.extendedWaitUntil?.visible === "bgg-e2e");
  assert(login < seeded);
  assert(contains(steps.slice(login, seeded), "assertVisible", "${output.authEmailPattern}"));
  assert(contains(steps, "tapOn", { id: "favorite-location-select" }));
  const phases = ["Locations", "Players", "Board games"].map((text) =>
    steps.findIndex((step) => step.extendedWaitUntil?.visible === text),
  );
  assert(phases[0] >= 0 && phases[0] < phases[1] && phases[1] < phases[2]);
  assert(
    contains(steps, "extendedWaitUntil", {
      visible: { id: "android:id/timePicker" },
      timeout: 30000,
    }),
  );
  assert(contains(steps, "assertNotVisible", "BGG collection match"));
});

test("native group invitations settle confirmations, handle permission and verify removal on the actual group list", () => {
  const setup = parseAllDocuments(
    readFileSync(
      new URL("../../apps/mobile/.maestro/helpers/friendship-create.yaml", import.meta.url),
      "utf8",
    ),
  )[1].toJSON();
  const reset = setup.find((step) => step.runFlow?.when?.visible === "^Remove friend$");
  assert.deepEqual(reset.runFlow.commands, [
    { tapOn: "^Remove friend$" },
    { extendedWaitUntil: { visible: { id: "confirm-unfriend-btn" }, timeout: 30000 } },
    { tapOn: { id: "confirm-unfriend-btn" } },
    { extendedWaitUntil: { notVisible: { id: "confirmation-dialog" }, timeout: 30000 } },
  ]);
  const decisions = setup.filter((step) => step.runFlow?.file === "contact-action.yaml");
  assert.deepEqual(
    decisions.map((step) => step.runFlow.env.ACTION_LABEL),
    ["^Send friend request$", "^Accept friend request$"],
  );
  assert(decisions.every((step) => !step.runFlow.when));
  const steps = journey("09-group-invitations");
  for (const action of ["friend-request", "accept_friend_request"]) {
    const index = steps.findIndex((step) => step.tapOn?.id === `confirm-${action}-btn`);
    assert(index >= 0);
    assert.deepEqual(steps[index + 1].extendedWaitUntil, {
      notVisible: { id: "confirmation-dialog" },
      timeout: 30000,
    });
  }
  assert(contains(journey("05-contacts-follow-block"), "tapOn", "Allow"));
  assert(contains(steps, "tapOn", { id: "notifications-button" }));
  assert(
    contains(steps, "tapOn", { id: "com.android.permissioncontroller:id/permission_allow_button" }),
  );
  assert(
    contains(steps, "extendedWaitUntil", {
      notVisible: { id: "com.android.permissioncontroller:id/permission_message" },
      timeout: 30000,
    }),
  );
  assert(
    contains(steps, "assertNotVisible", {
      id: "com.android.permissioncontroller:id/permission_message",
    }),
  );
  assert(contains(steps, "extendedWaitUntil", { visible: "^· 2 members$", timeout: 30000 }));
  const leave = steps.findLastIndex((step) => step.tapOn?.id === "confirmation-action-0");
  assert(contains(steps.slice(leave), "openLink", "bgo:///groups"));
  assert(
    contains(steps.slice(leave), "extendedWaitUntil", { visible: "No groups yet", timeout: 30000 }),
  );
  assert(
    contains(journey("08-groups"), "extendedWaitUntil", {
      visible: "No organizations found",
      timeout: 30000,
    }),
  );
});

test("canonical match flow verifies saved feature states instead of transient feedback", () => {
  const steps = journey("06-match-wizard");
  assert(contains(steps, "assertNotVisible", "Clear search"));
  assert(
    contains(steps, "assertVisible", {
      id: "location-address-input",
      text: "Piazza del Colosseo 1 Roma",
    }),
  );
  const creation = nativeSteps("helpers/match-create.yaml");
  const save = creation.findIndex((step) => step.tapOn?.id === "save-match-fab");
  assert(save >= 0);
  assert.deepEqual(creation[save + 1].extendedWaitUntil, {
    visible: "Friday night games",
    timeout: 60000,
  });
  const edit = nativeSteps("helpers/match-edit-delete.yaml");
  const update = edit.findIndex((step) => step.tapOn === "Save changes");
  assert(update >= 0);
  assert.deepEqual(edit[update + 1].extendedWaitUntil, {
    visible: { id: "more-match-actions" },
    timeout: 30000,
  });
  assert.equal(edit[update + 2].assertVisible, "Updated game night");
  assert.equal(edit[update + 3].openLink, "bgo:///matches");
  assert.deepEqual(edit[update + 4].extendedWaitUntil, {
    visible: "Updated game night",
    timeout: 30000,
  });
  assert.equal(edit[update + 5].assertNotVisible, "Friday night games");
  assert.equal(edit[update + 6].tapOn, "Updated game night");
  assert.deepEqual(edit[update + 7].extendedWaitUntil, {
    visible: { id: "more-match-actions" },
    timeout: 30000,
  });
  assert.equal(edit[update + 9].tapOn.id, "more-match-actions");
  for (const label of ["Choose date: Yes", "Choose game: If I have to", "Choose location: Yes"])
    assert(contains(steps, "assertVisible", label));
  assert(contains(steps, "assertVisible", ".*Not enough accepted players.*"));
  assert(contains(steps, "assertNotVisible", "Updated game night"));
  assert(!JSON.stringify(steps).includes("disableAnimations"));
});

test("native journeys never assert or tap disappearing feedback; durable inbox coverage stays", () => {
  const paths = [
    ...flows.map((name) => `flows/${name}.yaml`),
    "flows/11-match-join-requests.yaml",
    "helpers/organization-invitation.yaml",
    "helpers/organization-members.yaml",
    "helpers/organization-review.yaml",
  ];
  const transient = [
    "dismiss-notification",
    "Dismiss notification",
    "Match created",
    "Match updated",
    "Choice saved",
    "Person removed from group",
    "Join request approved",
    "Action failed",
    "Sharing link",
  ];
  for (const path of paths) {
    const steps = nativeSteps(path);
    for (const label of transient)
      assert(!JSON.stringify(steps).includes(label), `${path}: ${label}`);
    assert(!JSON.stringify(steps).includes("waitToSettleTimeoutMs"), path);
  }
  const contacts = journey("05-contacts-follow-block");
  assert(contains(contacts, "tapOn", { id: "notifications-button" }));
  assert(contains(contacts, "tapOn", "Friend request accepted"));
  assert(contains(journey("09-group-invitations"), "tapOn", "New group invitation"));
});

test("device contact sharing scrolls the actionable row into view and restores the search field", () => {
  const steps = nativeSteps("helpers/contacts-permissions.yaml");
  assert(
    contains(steps, "scrollUntilVisible", {
      element: "ZZ Page 43",
      direction: "DOWN",
      timeout: 90000,
    }),
  );
  assert(
    contains(steps, "scrollUntilVisible", {
      element: "Send invite: E2E Unregistered",
      direction: "UP",
      timeout: 90000,
    }),
  );
  assert(contains(steps, "assertVisible", "E2E Unregistered"));
  const invite = steps.findIndex((step) => step.tapOn === "Send invite: E2E Unregistered");
  assert(invite >= 0);
  assert(
    contains(steps.slice(invite), "scrollUntilVisible", {
      element: { id: "contact-search-input" },
      direction: "UP",
      timeout: 30000,
    }),
  );
  assert.deepEqual(steps.at(-1), { assertVisible: { id: "contact-search-input" } });
});

test("shared address selection checks exact input after closing the covering IME", () => {
  const steps = nativeSteps("helpers/select-address.yaml", {
    ADDRESS_QUERY: "Via Roma Milano",
    LOCATION_NAME: "Community club",
  });
  const input = steps.findIndex((step) => step.inputText === "Via Roma Milano");
  assert(input >= 0);
  assert.deepEqual(steps[input + 1], { hideKeyboard: null });
  assert.deepEqual(steps[input + 2].assertVisible, {
    id: "location-address-input",
    text: "Via Roma Milano",
  });
  assert(contains(steps, "tapOn", { id: "address-result-0" }));
  for (const name of ["06-match-wizard", "12-organizations", "13-event-draft"])
    assert(contains(journey(name), "tapOn", { id: "address-result-0" }), name);
});

test("ordinary match date slots confirm both Android native dialogs before creation or editing", () => {
  const helper = nativeSteps("helpers/match-date-time.yaml");
  const date = helper.findIndex(
    (step) => step.extendedWaitUntil?.visible?.id === "android:id/datePicker",
  );
  const time = helper.findIndex(
    (step) => step.extendedWaitUntil?.visible?.id === "android:id/timePicker",
  );
  assert(date >= 0 && date < time);
  assert.deepEqual(helper[date + 1].tapOn, { id: "android:id/button1" });
  assert.deepEqual(helper[time + 1].tapOn, { id: "android:id/button1" });
  assert(
    contains(helper, "extendedWaitUntil", {
      notVisible: { id: "android:id/timePicker" },
      timeout: 30000,
    }),
  );
  const keyboard = helper.find((step) => step.runFlow?.when?.visible?.id?.includes("inputmethod"));
  assert(keyboard);
  const ime = keyboard.runFlow.when.visible.id;
  assert(new RegExp(ime).test("com.google.android.inputmethod.latin:id/key_pos_space"));
  assert(new RegExp(ime).test("com.android.inputmethod.latin:id/keyboard_view"));
  assert(!new RegExp(ime).test("match-name-input"));
  assert(keyboard.runFlow.commands.includes("hideKeyboard"));
  assert(contains(helper, "extendedWaitUntil", { notVisible: { id: ime }, timeout: 30000 }));
  assert.equal(
    journey("06-match-wizard").filter((step) => step.tapOn === "Pick date and time").length,
    3,
  );
});

test("match GPS handles real native location permission and provider consent, never simulated grants", () => {
  const steps = nativeSteps("helpers/match-create.yaml");
  const permission = steps.find(
    (step) =>
      step.runFlow?.when?.visible?.id ===
      "com.android.permissioncontroller:id/permission_allow_foreground_only_button",
  );
  assert(permission);
  assert(contains(steps, "tapOn", "Precise"));
  assert(
    contains(steps, "tapOn", {
      id: "com.android.permissioncontroller:id/permission_allow_foreground_only_button",
    }),
  );
  const providers = steps.find(
    (step) => step.runFlow?.when?.visible?.id === "com.google.android.gms:id/message",
  );
  assert(providers);
  assert.equal(providers.runFlow.when.visible.text, ".*Location Accuracy.*");
  assert(contains(steps, "tapOn", "Turn on"));
  assert(providers.runFlow.commands.some((step) => step.setLocation?.latitude === 41.8902));
  assert(
    contains(steps, "extendedWaitUntil", {
      visible: { id: "location-address-input", text: ".*(Roma|Rome).*" },
      timeout: 30000,
    }),
  );
  assert(!steps.some((step) => "setPermissions" in step));
});

test("match preferences require the actual sheet to open and close before editing", () => {
  const votes = nativeSteps("helpers/match-planning.yaml");
  const choices = votes.filter((step) => step.tapOn === "^Yes$" || step.tapOn === "^If I have to$");
  assert.equal(choices.length, 3);
  const detail = readFileSync(
    new URL("../../apps/mobile/src/components/matches/MatchDetail.tsx", import.meta.url),
    "utf8",
  );
  for (const [position, kind] of ["date", "game", "location"].entries()) {
    const index = votes.indexOf(choices[position]);
    assert.deepEqual(votes[index - 2].tapOn, { id: `choose-${kind}` });
    assert.equal(votes[index - 1].assertVisible, `^Choose ${kind}$`);
    assert.deepEqual(votes[index + 1].extendedWaitUntil, {
      notVisible: `^Choose ${kind}$`,
      timeout: 30000,
    });
    assert(detail.includes(`title: t("Choose ${kind}")`));
  }
  const edit = nativeSteps("helpers/match-edit-delete.yaml");
  assert.equal(edit[0].assertNotVisible, "^Choose (date|game|location)$");
  assert.deepEqual(edit[1].tapOn, { id: "edit-match-fab" });
});

test("native confirmation titles match literal question marks, not background action buttons", () => {
  const paths = [
    ...flows.map((name) => `flows/${name}.yaml`),
    "flows/11-match-join-requests.yaml",
    "helpers/organization-invitation.yaml",
    "helpers/organization-members.yaml",
  ];
  const titles = new Set();
  for (const path of paths) {
    for (const step of nativeSteps(path)) {
      for (const pattern of [
        step.assertVisible,
        step.assertNotVisible,
        step.extendedWaitUntil?.visible,
        step.extendedWaitUntil?.notVisible,
      ]) {
        if (typeof pattern !== "string" || !pattern.includes("?")) continue;
        assert(pattern.startsWith("^") && pattern.endsWith("\\?$"), `${path}: ${pattern}`);
        const title = `${pattern.slice(1, -3)}?`;
        const matcher = new RegExp(pattern);
        assert(matcher.test(title));
        for (const other of [title.slice(0, -1), `Other ${title}`, `${title} Other`])
          assert(!matcher.test(other));
        titles.add(title);
      }
    }
  }
  for (const title of [
    "Delete notification?",
    "Delete match?",
    "Delete group?",
    "Remove from group?",
    "Leave group?",
    "Disconnect BoardGameGeek?",
    "Remove player?",
    "Are you sure?",
  ])
    assert(titles.has(title), title);
});

test("failed native flows capture the assertion driver's hierarchy without reinstalling it", () => {
  const capture = script.match(/capture\(\) \{([\s\S]*?)\n\}/)?.[1];
  assert(capture);
  assert(capture.includes("timeout 60 maestro hierarchy --no-reinstall-driver"));
  assert(capture.includes("/tmp/maestro-debug/failure-hierarchy.json"));
  assert(capture.indexOf("screencap") < capture.indexOf("maestro hierarchy"));
});

test("native failure diagnostics stay bounded when the emulator disappears", () => {
  const functions = script
    .slice(script.indexOf("stop_recording() {"), script.indexOf('case "${1:-}" in'))
    .replaceAll("/tmp/", '"$DIAG_ROOT"/');
  for (const state of ["ready", "gone", "timeout"]) {
    const root = mkdtempSync(join(tmpdir(), "bgo-native-diagnostics-"));
    try {
      const result = spawnSync(
        "bash",
        [
          "-euo",
          "pipefail",
          "-c",
          `
            mkdir -p "$DIAG_ROOT/maestro-debug"
            free() { echo "Mem: 16000 12000 4000"; }
            ps() { echo "42 1 8000000 qemu-system-x86"; }
            sudo() { echo "Out of memory: Killed process 42 (qemu-system-x86)"; }
            adb() {
              printf '%s\\n' "$*" >> "$DIAG_ROOT/commands.txt"
              if [ "$1" = get-state ] && [ "$DEVICE_STATE" != ready ]; then return 1; fi
              printf '%s\\n' AndroidRuntime
            }
            maestro() { echo hierarchy; }
            timeout() {
              printf '%s\\n' "$*" >> "$DIAG_ROOT/deadlines.txt"
              if [ "$DEVICE_STATE" = timeout ] && [ "$2 $3" = 'adb get-state' ]; then return 124; fi
              shift
              "$@"
            }
            ${functions}
            capture
          `,
        ],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            DIAG_ROOT: root.replaceAll("\\", "/"),
            DEVICE_STATE: state,
            FLOW: "05-contacts-follow-block",
          },
        },
      );
      assert.equal(result.status, 0, result.stderr);
      const commands = readFileSync(join(root, "commands.txt"), "utf8");
      const deadlines = readFileSync(join(root, "deadlines.txt"), "utf8");
      assert(deadlines.includes("10 sudo -n dmesg"));
      assert(deadlines.includes("10 adb get-state"));
      assert(deadlines.includes("15 adb shell pkill -f screenrecord"));
      const host = readFileSync(join(root, "maestro-debug/failure-host.txt"), "utf8");
      assert.match(host, /Mem: 16000 12000 4000/);
      assert.match(host, /Out of memory: Killed process 42/);
      assert.equal(
        readFileSync(join(root, "maestro-debug/05-contacts-follow-block-host.txt"), "utf8"),
        host,
      );
      if (state === "ready") {
        assert(commands.includes("screencap"));
        assert(deadlines.includes("30 adb shell uiautomator dump"));
        assert(deadlines.includes("15 adb logcat -d"));
      } else {
        assert(!commands.includes("screencap"));
        assert(!commands.includes("uiautomator"));
        assert.match(
          readFileSync(join(root, "maestro-debug/failure-device.txt"), "utf8"),
          /Android device unavailable/,
        );
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("native command artifacts redact raw and JSON-escaped credentials before upload", () => {
  const scrubber = script.match(/python3 - <<'PY'\n([\s\S]*?)\nPY/)?.[1];
  assert(scrubber);
  const folder = mkdtempSync(join(tmpdir(), "bgo-maestro-redaction-"));
  const file = join(folder, "fail-logcat.txt");
  const secret = 'fixture pass"word';
  const run = () =>
    spawnSync(process.platform === "win32" ? "python" : "python3", ["-c", scrubber], {
      encoding: "utf8",
      env: { ...process.env, GITHUB_WORKSPACE: folder, E2E_PASSWORD: secret },
    });
  try {
    writeFileSync(file, `ordinary diagnostic\n${secret}\n${JSON.stringify(secret)}\n`);
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    const text = readFileSync(file, "utf8");
    assert(text.includes("ordinary diagnostic"));
    assert.doesNotMatch(text, /fixture pass/);
    assert.equal((text.match(/\[redacted\]/g) ?? []).length, 2);
    writeFileSync(file, Buffer.from([255, 254]));
    assert.notEqual(run().status, 0);
    assert(!existsSync(file), "Unreadable text must not survive for upload");
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test("JUnit validation fails closed for absent, fabricated, skipped, failed, or malformed results", () => {
  const folder = mkdtempSync(join(tmpdir(), "bgo-maestro-junit-"));
  const script = fileURLToPath(new URL("./verify-maestro-reports.py", import.meta.url));
  const file = join(folder, "01-launch-welcome.xml");
  const run = (...names) =>
    spawnSync(process.platform === "win32" ? "python" : "python3", [script, folder, ...names], {
      encoding: "utf8",
    });
  const valid =
    '<testsuites><testsuite tests="1" failures="0"><testcase name="01-launch-welcome" status="SUCCESS"/></testsuite></testsuites>';
  try {
    assert.notEqual(run("01-launch-welcome").status, 0);
    writeFileSync(file, valid);
    const ok = run("01-launch-welcome");
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /1 real Maestro flows; zero failures or skips/);
    assert.notEqual(run().status, 0);
    for (const xml of [
      "not XML",
      "<testsuites/>",
      valid.replace('status="SUCCESS"', ""),
      valid.replace('status="SUCCESS"', 'status="ERROR"'),
      valid.replace('name="01-launch-welcome"', 'name="all-flows-passed"'),
      valid.replace('failures="0"', 'failures="1"'),
      valid.replace('failures="0"', 'errors="1"'),
      valid.replace('failures="0"', 'skipped="1"'),
      valid.replace('tests="1"', 'tests="0"'),
      ...["failure", "error", "skipped"].map((tag) =>
        valid.replace("/></testsuite>", `><${tag}/></testcase></testsuite>`),
      ),
    ]) {
      writeFileSync(file, xml);
      assert.notEqual(run("01-launch-welcome").status, 0, xml);
    }
    writeFileSync(file, valid);
    writeFileSync(join(folder, "summary.xml"), valid);
    assert.notEqual(run("01-launch-welcome").status, 0);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
