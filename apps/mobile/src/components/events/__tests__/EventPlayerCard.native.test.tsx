import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { expect, it } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { EventPlayerCard } from "../EventPlayerCard";

it("shows the shared avatar and username without inventing roles or relationships", async () => {
  const view = await render(
    <EventPlayerCard name="Player" username="handle" avatarUrl="https://images.test/avatar">
      <Text>Game statistics</Text>
    </EventPlayerCard>,
    { wrapper: NativeTestProviders },
  );
  const image = screen.container.queryAll((node) => node.type === "RCTImageView")[0];
  if (!image) throw new Error("Expected the actual native player avatar image host");
  await fireEvent(image, "error", { nativeEvent: { error: "Fixture image unavailable" } });
  expect(screen.getByText("P")).toBeVisible();
  expect(screen.getByText("@handle")).toBeVisible();
  expect(screen.getByText("Game statistics")).toBeVisible();
  expect(screen.queryByRole("button")).toBeNull();
  await view.rerender(
    <EventPlayerCard name="" username={null} avatarUrl={null} footer={<Text>Result pending</Text>}>
      <Text>Game statistics</Text>
    </EventPlayerCard>,
  );
  expect(screen.getByText("?")).toBeVisible();
  expect(screen.getByText("—")).toBeVisible();
  expect(screen.getByText("Result pending")).toBeVisible();
  await view.rerender(
    <EventPlayerCard name={undefined} avatarUrl={null}>
      <Text>Game statistics</Text>
    </EventPlayerCard>,
  );
  expect(screen.queryByText("P")).toBeNull();
  expect(screen.queryByText("?")).toBeNull();
  expect(screen.queryByText("—")).toBeNull();
  expect(screen.getByText("Game statistics")).toBeVisible();
});
