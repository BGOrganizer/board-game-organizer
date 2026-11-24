import { measureRenders } from "@callstack/reassure-measure";
import { screen, within } from "@testing-library/react-native";
import { Text, View } from "react-native";
import { expect, it, vi } from "vitest";
import EventResults from "@/app/event/results";
import EventTableEdit from "@/app/event/table-edit";
import GroupBan from "@/app/group/ban";
import GroupInvite from "@/app/group/invite";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ eventId: "friday" }),
  Redirect: ({ href }: { href: string | { pathname: string; params: unknown } }) => (
    <Text testID="sdk-redirect">{typeof href === "string" ? href : JSON.stringify(href)}</Text>
  ),
}));

it("Mobile route parameters: preserve the event fallback and report missing group context", async () => {
  const result = await measureRenders(
    <>
      <View testID="results-route">
        <EventResults />
      </View>
      <View testID="old-edit-route">
        <EventTableEdit />
      </View>
      <View testID="group-ban-route">
        <GroupBan />
      </View>
      <View testID="group-invite-route">
        <GroupInvite />
      </View>
    </>,
    {
      wrapper: NativeTestProviders,
      scenario: async () => {
        expect(
          within(screen.getByTestId("results-route")).getByTestId("sdk-redirect"),
        ).toHaveTextContent(
          JSON.stringify({ pathname: "/event/[eventId]", params: { eventId: "friday" } }),
        );
        expect(
          within(screen.getByTestId("old-edit-route")).getByTestId("sdk-redirect"),
        ).toHaveTextContent("/events");
        for (const route of ["group-ban-route", "group-invite-route"])
          expect(within(screen.getByTestId(route)).getByRole("alert")).toHaveTextContent(
            "Group not found",
          );
      },
    },
  );
  assertRenderMeasurement(result);
});
