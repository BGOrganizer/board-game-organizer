import { measureRenders } from "@callstack/reassure-measure";
import { fireEvent, screen } from "@testing-library/react-native";
import { HeroUINativeProviderRaw } from "heroui-native/provider-raw";
import { Tabs } from "heroui-native/tabs";
import { useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { expect, test } from "vitest";
import { TabBar } from "@/components/common/ui/TabBar";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

function DetailTabs() {
  const [selected, setSelected] = useState("members");
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, bottom: 0, left: 0, right: 0 },
      }}
    >
      <HeroUINativeProviderRaw>
        <Tabs value={selected} onValueChange={setSelected}>
          <TabBar>
            <Tabs.Trigger value="details">
              <Tabs.Label>Details</Tabs.Label>
            </Tabs.Trigger>
            <Tabs.Trigger value="members">
              <Tabs.Label>Members</Tabs.Label>
            </Tabs.Trigger>
            <Tabs.Trigger value="events">
              <Tabs.Label>Events</Tabs.Label>
            </Tabs.Trigger>
          </TabBar>
        </Tabs>
      </HeroUINativeProviderRaw>
    </SafeAreaProvider>
  );
}

test("real HeroUI TabBar: mount three detail tabs", async () => {
  const result = await measureRenders(<DetailTabs />, {
    scenario: async () => {
      expect(screen.getAllByRole("tab")).toHaveLength(3);
      expect(screen.getByRole("tab", { name: "Members" })).toBeSelected();
    },
  });
  assertRenderMeasurement(result);
});

test("real HeroUI TabBar: repeated Members and Events selection", async () => {
  const result = await measureRenders(<DetailTabs />, {
    scenario: async () => {
      for (let cycle = 0; cycle < 3; cycle++) {
        await fireEvent.press(screen.getByRole("tab", { name: "Events" }));
        expect(screen.getByRole("tab", { name: "Events" })).toBeSelected();
        await fireEvent.press(screen.getByRole("tab", { name: "Members" }));
        expect(screen.getByRole("tab", { name: "Members" })).toBeSelected();
      }
    },
  });
  assertRenderMeasurement(result);
});
