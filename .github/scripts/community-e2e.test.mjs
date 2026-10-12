import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

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
test("managed HeroUI patch sizes the animated wrapper without hiding or remounting popover content", () => {
  const patch = readFileSync(
    new URL("../../patches/heroui-native@1.0.9.patch", import.meta.url),
    "utf8",
  );
  assert.equal((patch.match(/^diff --git /gm) ?? []).length, 2);
  assert.deepEqual(
    patch.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++")),
    ["+        style: StyleSheet.absoluteFill,", "+            style={StyleSheet.absoluteFill}"],
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
  ]) {
    const installed = readFileSync(
      new URL(`../../node_modules/heroui-native/${path}`, import.meta.url),
      "utf8",
    );
    const driven = installed.split("if (isDrivenEntering) {")[1].split("// Fallback path:")[0];
    assert.match(driven, expected);
    assert.match(driven, /exiting[=:]/);
    assert.match(driven, /AnimatedContent/);
    assert.match(driven, /rEnteringStyle/);
    assert.doesNotMatch(driven, /no-hide-descendants|accessibilityElementsHidden/);
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
  const contacts = readFileSync(
    new URL("../../apps/mobile/.maestro/flows/05-contacts-follow-block.yaml", import.meta.url),
    "utf8",
  );
  assert.equal((contacts.match(/visible: ".*\[Aa\]llow.*contacts.*"/g) ?? []).length, 2);
  assert(contacts.includes('- tapOn: "Don.t allow"'));
  assert(contacts.indexOf('"Don.t allow"') < contacts.indexOf('id: "enable-contacts-btn"'));
  assert(contacts.includes('- tapOn: "Yes"'));
  assert(contacts.includes('- tapOn: "Allow"'));
});
test("native help and legends wait for visible portal content without dropping assertions", () => {
  for (const name of ["05-contacts-follow-block", "06-match-wizard", "12-organizations"]) {
    const flow = readFileSync(
      new URL(`../../apps/mobile/.maestro/flows/${name}.yaml`, import.meta.url),
      "utf8",
    ).replace(/\r\n/g, "\n");
    assert.match(
      flow,
      /Search help"\n(?:#[^\n]*\n)?- extendedWaitUntil:\n {4}visible: "Search help"\n {4}timeout: 30000/,
    );
    assert(flow.includes('- assertVisible: "Type at least 4 characters to search"'));
  }
  const contacts = readFileSync(
    new URL("../../apps/mobile/.maestro/flows/05-contacts-follow-block.yaml", import.meta.url),
    "utf8",
  ).replace(/\r\n/g, "\n");
  for (const title of ["Friendship accepted.", "Requests awaiting your reply."])
    assert(
      contacts.includes(
        `- extendedWaitUntil:\n    visible: "${title}"\n    timeout: 30000\n- assertVisible: "${title}"`,
      ),
    );
  assert(contacts.includes('- assertVisible: "Search help"'));
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
    /inputText: \$\{AUTH_PASSWORD\}\n- tapOn: "Continue"\n- runFlow: "verify-clerk-device.yaml"/,
  );
  for (const [name, expected] of [
    ["02-login", 1],
    ["05-contacts-follow-block", 4],
    ["07-reauth-after-logout", 1],
    ["09-group-invitations", 3],
  ]) {
    const flow = readFileSync(
      new URL(`../../apps/mobile/.maestro/flows/${name}.yaml`, import.meta.url),
      "utf8",
    ).replace(/\r\n/g, "\n");
    const calls = [
      ...flow.matchAll(
        /file: "\.\.\/helpers\/sign-in.yaml"\n {4}env:\n {6}AUTH_EMAIL: \$\{EMAIL(_2)?\}\n {6}AUTH_PASSWORD: \$\{PASSWORD(_2)?\}/g,
      ),
    ];
    assert.equal(calls.length, expected, name);
    for (const call of calls) assert.equal(call[1], call[2], name);
    assert.doesNotMatch(flow, /inputText: \$\{USERNAME/);
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
  assert(signIn.includes('- longPressOn: ".*clerk_test@gmail.com$"'));
  assert(signIn.includes('- tapOn: "[Ss]elect [Aa]ll"'));
  const selectAll = signIn.indexOf('- tapOn: "[Ss]elect [Aa]ll"');
  const deletion = signIn.indexOf("- eraseText: 1", selectAll);
  const entry = signIn.indexOf("- inputText: ${AUTH_EMAIL}", deletion);
  assert(selectAll < deletion && deletion < entry);
  assert(signIn.includes("- eraseText: 100\n- inputText: ${AUTH_PASSWORD}"));
  assert.match(
    signIn,
    /inputText: \$\{AUTH_EMAIL\}\n- runScript: "auth-email.js"\n- assertVisible: \$\{output.authEmailPattern\}\n- tapOn: "Continue"/,
  );
  const script = readFileSync(
    new URL("../../apps/mobile/.maestro/helpers/auth-email.js", import.meta.url),
    "utf8",
  );
  const output = {};
  runInNewContext(script, { AUTH_EMAIL: targetEmail, output });
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
    assert(login.includes(`- inputText: "${character}"\n      - assertVisible: "^${prefix}$"`));
  assert.equal(login.match(/- inputText: "z"/g)?.length, 4);
  assert(!login.includes('- inputText: "zzzz"'));
  assert(login.includes('assertVisible: "No countries found"'));
  assert(login.includes('tapOn: "Germany"'));
  assert(login.includes('tapOn: "Italy"'));
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
    const flow = readFileSync(
      new URL(`../../apps/mobile/.maestro/flows/${name}.yaml`, import.meta.url),
      "utf8",
    ).replace(/\r\n/g, "\n");
    assert.doesNotMatch(flow, /tapOn: "\.\*\[Ss\]earch\.\*users\.\*"|tapOn: "Actions"/);
    assert(flow.includes('- tapOn: "^Search users by name or email$"\n- eraseText: 100'));
    for (const actor of ["Test", "Target"]) {
      assert(flow.includes(`- tapOn: "^Actions: E2E ${actor}$"`));
    }
    assert.doesNotMatch(
      flow,
      /"Friend requests"|respond-friend-request-btn|respond-accept-friend-request-btn/,
    );
    assert(flow.includes('id: "confirm-accept_friend_request-btn"'));
  }
  const input = /^Search users by name or email$/;
  assert.match("Search users by name or email", input);
  assert.doesNotMatch("Search users by name or email: Search help", input);
});
test("native profile completion reaches Continue while the keyboard stays open", () => {
  const flow = readFileSync(
    new URL("../../apps/mobile/.maestro/flows/02-login.yaml", import.meta.url),
    "utf8",
  ).replace(/\r\n/g, "\n");
  const completion = flow.split('- inputText: "not a formatted phone"')[1];
  assert(completion);
  assert.match(
    completion,
    /scrollUntilVisible:\s+element:\s+text: "Continue"\s+direction: DOWN\s+- tapOn: "Continue"/,
  );
  assert.doesNotMatch(completion.split('- tapOn: "Continue"')[0], /hideKeyboard/);
  assert.match(completion, /visible: "Matches"\s+timeout: 120000/);
});
test("native community acceptance follows confirmed counts and table-only legends without a repeated venue", () => {
  const organization = readFileSync(
    new URL("../../apps/mobile/.maestro/flows/12-organizations.yaml", import.meta.url),
    "utf8",
  );
  const table = readFileSync(
    new URL("../../apps/mobile/.maestro/flows/13-event-draft.yaml", import.meta.url),
    "utf8",
  );
  assert(organization.includes('assertVisible: "Confirmed members: 1"'));
  assert(!organization.includes('assertVisible: "Approved members: 1"'));
  assert(table.includes('assertNotVisible: "Table location help"'));
  assert(!table.includes('tapOn: "Table location help"'));
  assert(table.includes('tapOn: "Table name help"'));
  for (const legend of [
    "Confirmed players.",
    "Maximum seats here; free places in Seats.",
    "Reserved places, including pending requests.",
  ])
    assert(table.includes(`"${legend}"`));
});
test("native event acceptance uses the catalog game actually seeded by CI", () => {
  const flow = readFileSync(
    new URL("../../apps/mobile/.maestro/flows/13-event-draft.yaml", import.meta.url),
    "utf8",
  );
  const seed = readFileSync(
    new URL("../../apps/api/src/app/api/admin/ci-db/route.ts", import.meta.url),
    "utf8",
  );
  assert(seed.includes('name: "Cascadia"'));
  assert(flow.includes('"Select: Cascadia"'));
  assert(!flow.includes('"Select: Catan"'));
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
  assert(emulator.includes('nohup "$ANDROID_HOME/emulator/emulator"'));
  assert(emulator.includes('echo "BGO_EMULATOR_PID=$EMU_PID" >> "$GITHUB_ENV"'));
  assert(emulator.includes('if [ "$EMULATOR_READY" != "1" ]; then kill "$EMU_PID"'));
  assert(script.includes('kill "$BGO_EMULATOR_PID"'));
  assert.match(action, /bash -e -o pipefail/);
  assert(script.startsWith("#!/usr/bin/env bash\nset -euo pipefail"));
});
test("native UI acceptance installs and selects rendering-enabled AOSP, never ATD", () => {
  const emulator = readFileSync(
    new URL("../actions/android-emulator/action.yml", import.meta.url),
    "utf8",
  ).replace(/\r\n/g, "\n");
  assert(emulator.includes('"$SDKMGR" "system-images;android-34;default;x86_64"'));
  assert.doesNotMatch(emulator, /system-images;android-34;aosp_atd/);
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
      # A cached ATD sorts before default: selection must not depend on ls order.
      mkdir -p "$ANDROID_HOME/system-images/android-34/"{aosp_atd,default}
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
  assert.match(result.stdout, /system-images;android-34;default;x86_64/);
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
  assert(emulator.indexOf("-accel-check") < emulator.indexOf('nohup "$ANDROID_HOME'));
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

test("failed native flows capture the assertion driver's hierarchy without reinstalling it", () => {
  const capture = script.match(/capture\(\) \{([\s\S]*?)\n\}/)?.[1];
  assert(capture);
  assert(capture.includes("timeout 60 maestro hierarchy --no-reinstall-driver"));
  assert(capture.includes("/tmp/maestro-debug/failure-hierarchy.json"));
  assert(capture.indexOf("screencap") < capture.indexOf("maestro hierarchy"));
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
