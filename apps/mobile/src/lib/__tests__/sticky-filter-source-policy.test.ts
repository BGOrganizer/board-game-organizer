import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { expect, it } from "vitest";

// Actual installed SDK/patch and product source policies; no primitive renderer.
it("preserves the installed Uniwind-compatible RN host and keeps its third-party patch free of global host overrides", () => {
  const runtime = readFileSync(
    new URL(
      "../../../../../node_modules/heroui-native/lib/module/components/pressable-feedback/pressable-feedback.js",
      import.meta.url,
    ),
    "utf8",
  );
  expect(runtime).toContain("import { Pressable, View } from 'react-native'");
  expect(runtime).not.toContain("from 'react-native-gesture-handler'");
  const patch = readFileSync(
    new URL("../../../../../patches/heroui-native@1.0.9.patch", import.meta.url),
    "utf8",
  );
  expect(patch).not.toContain("components/pressable-feedback/");
});
it("retains the actual sticky header and controlled HeroUI filters instead of press-in/clipping workarounds", () => {
  const collection = readFileSync(
      new URL("../../components/profile/ProfileCollection.tsx", import.meta.url),
      "utf8",
    ),
    chips = readFileSync(
      new URL("../../components/common/ui/FilterChips.tsx", import.meta.url),
      "utf8",
    );
  expect(collection).toContain("stickySectionHeadersEnabled");
  expect(collection).toContain("onToggle={filter.toggle}");
  expect(chips).toContain("onPress={() => onToggle(key)}");
  expect(chips).not.toContain("onPressIn=");
  expect(chips).toContain("isDisabled={disabled}");
  expect(chips).toContain('variant={active ? "primary" : "secondary"}');
});
