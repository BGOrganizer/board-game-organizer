import { measureRenders } from "@callstack/reassure-measure";
import { I18nProvider } from "@lingui/react";
import { fireEvent, screen } from "@testing-library/react-native";
import { HeroUINativeProviderRaw } from "heroui-native/provider-raw";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { expect, test } from "vitest";
import { ListCardBody } from "@/components/common/ui/ListCardBody";
import { RetainedTabPanel } from "@/components/common/ui/RetainedTabPanel";
import { createAppI18n } from "@/lib/i18n";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

const i18n = createAppI18n("en");
const records = Array.from({ length: 12 }, (_, index) => ({
  id: String(index),
  title: `Event ${index + 1}`,
}));

function CachedList({ updated }: { updated: boolean }) {
  const [draft, setDraft] = useState("");
  return (
    <View>
      <TextInput accessibilityLabel="Filter events" value={draft} onChangeText={setDraft} />
      {records.map((record, index) => (
        <ListCardBody
          key={record.id}
          title={updated && index === 0 ? "Event updated by server" : record.title}
          unread={index === 0}
        />
      ))}
    </View>
  );
}

function CachedPanels() {
  const [selected, setSelected] = useState("members");
  const [updated, setUpdated] = useState(false);
  return (
    <I18nProvider i18n={i18n}>
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 0, bottom: 0, left: 0, right: 0 },
        }}
      >
        <HeroUINativeProviderRaw>
          <Pressable accessibilityRole="button" onPress={() => setSelected("members")}>
            <Text>Members</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setSelected("events")}>
            <Text>Events</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setUpdated(true)}>
            <Text>Receive server snapshot</Text>
          </Pressable>
          <RetainedTabPanel active={selected === "members"}>
            <Text>Cached members</Text>
          </RetainedTabPanel>
          <RetainedTabPanel active={selected === "events"}>
            <CachedList updated={updated} />
          </RetainedTabPanel>
        </HeroUINativeProviderRaw>
      </SafeAreaProvider>
    </I18nProvider>
  );
}

test("retained panels: first cached Events entry with 12 real card headings", async () => {
  const result = await measureRenders(<CachedPanels />, {
    scenario: async () => {
      expect(screen.queryByLabelText("Filter events")).toBeNull();
      await fireEvent.press(screen.getByText("Events"));
      expect(screen.getByText("Event 12")).toBeTruthy();
      expect(screen.getAllByTestId("card-heading")).toHaveLength(12);
    },
  });
  assertRenderMeasurement(result);
});

test("retained panels: repeated tabs preserve draft and accept fresh server data", async () => {
  const result = await measureRenders(<CachedPanels />, {
    scenario: async () => {
      await fireEvent.press(screen.getByText("Events"));
      await fireEvent.changeText(screen.getByLabelText("Filter events"), "saved filter");
      for (let cycle = 0; cycle < 3; cycle++) {
        await fireEvent.press(screen.getByText("Members"));
        expect(screen.getByText("Cached members")).toBeTruthy();
        await fireEvent.press(screen.getByText("Events"));
        expect(screen.getByLabelText("Filter events")).toHaveDisplayValue("saved filter");
      }
      await fireEvent.press(screen.getByText("Receive server snapshot"));
      expect(screen.getByText("Event updated by server")).toBeTruthy();
      expect(screen.getByLabelText("Filter events")).toHaveDisplayValue("saved filter");
    },
  });
  assertRenderMeasurement(result);
});
