import { measureRenders } from "@callstack/reassure-measure";
import { act, fireEvent, screen, userEvent, waitFor } from "@testing-library/react-native";
import { createRef, type Ref, useImperativeHandle, useState } from "react";
import { Text, View } from "react-native";
import { expect, it, vi } from "vitest";
import MobileNumberScreen from "@/app/mobile-number";
import SignInScreen from "@/app/sign-in";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

const inviteToken = "abcdefghijklmnopqrstuv";
const sdk = vi.hoisted(() => ({
  signedIn: false,
  metadata: {} as Record<string, unknown>,
  back: vi.fn(),
  replace: vi.fn(),
  update: vi.fn(async () => {}),
}));
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: sdk.signedIn }),
  useUser: () => ({
    isLoaded: true,
    user: sdk.signedIn ? { unsafeMetadata: sdk.metadata, update: sdk.update } : null,
  }),
}));
vi.mock("@clerk/expo/native", () => ({
  AuthView: () => <View testID="sdk-native-auth-view" />,
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ back: sdk.back, replace: sdk.replace }),
  useLocalSearchParams: () => ({ inviteToken }),
  useNavigation: () => ({ getState: () => ({ type: "stack" }) }),
  Redirect: ({ href }: { href: string | { pathname: string; params: unknown } }) => (
    <Text testID="sdk-redirect-target">
      {typeof href === "string" ? href : JSON.stringify(href)}
    </Text>
  ),
}));
vi.mock("expo-localization", () => ({
  getLocales: () => [{ languageCode: "en", languageTag: "en-GB", regionCode: "GB" }],
}));

function SignInTransition({ restore }: { restore: Ref<() => void> }) {
  const [, setReady] = useState(false);
  useImperativeHandle(
    restore,
    () => () => {
      sdk.signedIn = true;
      setReady(true);
    },
    [],
  );
  return <SignInScreen />;
}

it("SignIn: resume a validated invitation when the Clerk session is restored", async () => {
  const restore = createRef<() => void>();
  const result = await measureRenders(<SignInTransition restore={restore} />, {
    wrapper: NativeTestProviders,
    beforeEach: () => {
      sdk.signedIn = false;
      sdk.metadata = { mobileNumber: "+441234567890" };
    },
    scenario: async () => {
      expect(screen.getByTestId("sdk-native-auth-view")).toBeOnTheScreen();
      expect(screen.queryByTestId("sdk-redirect-target")).toBeNull();
      await act(() => restore.current?.());
      expect(screen.getByTestId("sdk-redirect-target")).toHaveTextContent(`/invite/${inviteToken}`);
      expect(screen.queryByTestId("sdk-native-auth-view")).toBeNull();
    },
  });
  assertRenderMeasurement(result);
});

it("MobileNumber: preserve metadata and resume the invitation only after save", async () => {
  const result = await measureRenders(<MobileNumberScreen />, {
    wrapper: NativeTestProviders,
    beforeEach: () => {
      sdk.signedIn = true;
      sdk.metadata = { existingSetting: "retained" };
      sdk.update.mockClear();
      sdk.replace.mockClear();
    },
    scenario: async () => {
      expect(screen.getByText("Complete your profile")).toBeVisible();
      expect(sdk.replace).not.toHaveBeenCalled();
      await fireEvent.changeText(screen.getByLabelText("Mobile number"), "1234567890");
      await userEvent.setup().press(screen.getByRole("button", { name: "Continue" }));
      expect(sdk.update).toHaveBeenCalledExactlyOnceWith({
        unsafeMetadata: { existingSetting: "retained", mobileNumber: "+44 1234567890" },
      });
      await waitFor(() =>
        expect(sdk.replace).toHaveBeenCalledExactlyOnceWith(`/invite/${inviteToken}`),
      );
    },
  });
  assertRenderMeasurement(result);
});
