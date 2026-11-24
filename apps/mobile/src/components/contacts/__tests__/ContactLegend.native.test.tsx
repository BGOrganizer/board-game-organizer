import { act, render, screen, waitFor } from "@testing-library/react-native";
import { UserRoundCheck, UsersRound } from "lucide-react-native";
import { DeviceEventEmitter, Keyboard } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  installNativePopoverMeasurements,
  pressMeasuredPopover,
} from "@/test/nativePopoverGeometry";
import { ContactLegend } from "../ContactLegend";

beforeEach(installNativePopoverMeasurements);
afterEach(() => vi.restoreAllMocks());

it("dismisses the search keyboard only on explicit opening and displays real contact/presence explanations", async () => {
  const dismiss = vi.spyOn(Keyboard, "dismiss");
  await render(
    <ContactLegend
      title="Connections"
      icon={UsersRound}
      entries={[
        {
          icon: UserRoundCheck,
          label: "Friend",
          color: "accent",
          description: "You accepted each other's invitations.",
        },
      ]}
    />,
    { wrapper: NativeTestProviders },
  );
  expect(dismiss).not.toHaveBeenCalled();
  await pressMeasuredPopover(screen.getByRole("button", { name: "Connections: Icon legend" }));
  expect(dismiss).toHaveBeenCalledOnce();
  expect(screen.getByRole("heading", { name: "Connections" })).toBeVisible();
  for (const text of ["Friend", "You accepted each other's invitations.", "Online", "Offline"])
    expect(screen.getByText(text)).toBeVisible();
  await act(() => DeviceEventEmitter.emit("hardwareBackPress"));
  await waitFor(() => expect(screen.queryByRole("heading", { name: "Connections" })).toBeNull());
  expect(dismiss).toHaveBeenCalledOnce();
});
