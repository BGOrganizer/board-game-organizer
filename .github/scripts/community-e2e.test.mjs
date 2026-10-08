import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const action = readFileSync(new URL("../actions/maestro-e2e/action.yml", import.meta.url), "utf8");
const commands = action
  .replace(/\\\r?\n\s*/g, " ")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.startsWith("maestro test "));
test("native community flows are actually invoked, not only present in the repository", () => {
  for (const name of ["12-organizations.yaml", "13-event-draft.yaml"]) {
    assert(
      commands.some((command) => command.includes(`apps/mobile/.maestro/flows/${name}`)),
      `${name} missing from the executable Maestro commands`,
    );
  }
  for (const command of commands)
    for (const match of command.matchAll(/apps\/mobile\/\.maestro\/flows\/[\w-]+\.yaml/g))
      assert(
        existsSync(new URL(`../../${match[0]}`, import.meta.url)),
        `Missing invoked flow ${match[0]}`,
      );
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
  for (const name of [
    "02-login",
    "05-contacts-follow-block",
    "07-reauth-after-logout",
    "09-group-invitations",
  ]) {
    const flow = readFileSync(
      new URL(`../../apps/mobile/.maestro/flows/${name}.yaml`, import.meta.url),
      "utf8",
    );
    for (const match of flow.matchAll(
      /- inputText: \$\{PASSWORD(?:_2)?\}\n- tapOn: "Continue"\n/g,
    )) {
      assert(
        flow
          .slice(match.index + match[0].length)
          .startsWith('- runFlow: "../helpers/verify-clerk-device.yaml"'),
      );
    }
  }
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
  const push = action.indexOf(
    "adb push apps/mobile/assets/icon.png /sdcard/Pictures/bgo-organization-logo.png",
  );
  assert(push >= 0);
  assert(push < action.indexOf("apps/mobile/.maestro/flows/12-organizations.yaml"));
  assert(existsSync(new URL("../../apps/mobile/assets/icon.png", import.meta.url)));
  assert(action.includes("android.intent.action.MEDIA_SCANNER_SCAN_FILE"));
});
