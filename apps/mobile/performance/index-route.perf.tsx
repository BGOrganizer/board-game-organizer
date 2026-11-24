import { measureRenders } from "@callstack/reassure-measure";
import { act, screen, userEvent } from "@testing-library/react-native";
import { createRef, type ReactNode, type Ref, useImperativeHandle, useState } from "react";
import { Text } from "react-native";
import { expect, it, vi } from "vitest";
import Index from "@/app/index";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

const boundary = vi.hoisted(() => ({ push: vi.fn(), restored: false }));
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: boundary.restored }),
  useUser: () => ({
    isLoaded: true,
    user: { id: "player", unsafeMetadata: { mobileNumber: "+390000000000" } },
  }),
  Show: ({ children }: { children: ReactNode }) => (boundary.restored ? children : null),
}));
vi.mock("@clerk/expo/native", () => ({ UserButton: () => null }));
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: boundary.push }),
  Redirect: ({ href }: { href: string }) => <Text testID="sdk-redirect-target">{href}</Text>,
}));

function RestoreSession({ controller }: { controller: Ref<() => void> }) {
  const [, setRestored] = useState(false);
  useImperativeHandle(
    controller,
    () => () => {
      boundary.restored = true;
      setRestored(true);
    },
    [],
  );
  return <Index />;
}

it("Index: show the signed-out home, then resolve the restored session's landing target", async () => {
  const restore = createRef<() => void>();
  const result = await measureRenders(<RestoreSession controller={restore} />, {
    wrapper: NativeTestProviders,
    beforeEach: () => {
      boundary.restored = false;
      boundary.push.mockClear();
    },
    scenario: async () => {
      expect(screen.getByText("Board Game Organizer")).toBeVisible();
      expect(screen.getByText("Welcome to Board Game Organizer")).toBeVisible();
      await userEvent.setup().press(screen.getByRole("button", { name: "Sign in / Register" }));
      expect(boundary.push).toHaveBeenCalledExactlyOnceWith("/sign-in");
      await act(() => restore.current?.());
      expect(screen.getByTestId("sdk-redirect-target")).toHaveTextContent("/tables");
      expect(screen.queryByRole("button", { name: "Sign in / Register" })).toBeNull();
    },
  });
  assertRenderMeasurement(result);
});
