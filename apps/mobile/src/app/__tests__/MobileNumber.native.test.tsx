import { act, fireEvent, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";
import { beforeEach, expect, it, vi } from "vitest";
import MobileNumberScreen from "@/app/mobile-number";
import { NativeTestProviders } from "@/test/NativeTestProviders";

const boundary = vi.hoisted(() => ({
  loaded: true,
  signedIn: true,
  metadata: {} as Record<string, unknown>,
  inviteToken: undefined as string | string[] | undefined,
  update: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("@clerk/expo", () => ({
  useUser: () => ({
    isLoaded: boundary.loaded,
    user: boundary.signedIn ? { unsafeMetadata: boundary.metadata, update: boundary.update } : null,
  }),
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ replace: boundary.replace }),
  useLocalSearchParams: () => ({ inviteToken: boundary.inviteToken }),
  useNavigation: () => ({ getState: () => ({ type: "stack" }) }),
  Redirect: ({ href }: { href: string }) => <Text testID="router-redirect">{href}</Text>,
}));
vi.mock("expo-localization", () => ({
  getLocales: () => [{ languageCode: "en", languageTag: "en-GB", regionCode: "GB" }],
}));

beforeEach(() => {
  vi.clearAllMocks();
  boundary.loaded = true;
  boundary.signedIn = true;
  boundary.metadata = { existingSetting: "retained" };
  boundary.inviteToken = undefined;
  boundary.update.mockResolvedValue(undefined);
});

const mount = () =>
  render(
    <NativeTestProviders>
      <MobileNumberScreen />
    </NativeTestProviders>,
  );
const submit = () => userEvent.setup().press(screen.getByRole("button", { name: "Continue" }));

it("waits for Clerk without exposing a form or redirecting an unresolved session", async () => {
  boundary.loaded = false;
  await mount();
  expect(screen.queryByText("Complete your profile")).toBeNull();
  expect(screen.queryByTestId("router-redirect")).toBeNull();
  expect(boundary.update).not.toHaveBeenCalled();
});

it("redirects a signed-out visitor without performing a profile mutation", async () => {
  boundary.signedIn = false;
  await mount();
  expect(screen.getByTestId("router-redirect")).toHaveTextContent(/^\/$/);
  expect(boundary.update).not.toHaveBeenCalled();
});

it.each([
  { token: undefined, destination: "/tables" },
  { token: "abcdefghijklmnopqrstuv", destination: "/invite/abcdefghijklmnopqrstuv" },
  { token: "https://external.example.test", destination: "/tables" },
  { token: ["abcdefghijklmnopqrstuv"], destination: "/tables" },
])(
  "retains only a valid invite continuation for an already completed profile ($destination)",
  async ({ token, destination }) => {
    boundary.metadata.mobileNumber = "+441234567890";
    boundary.inviteToken = token;
    await mount();
    expect(screen.getByTestId("router-redirect")).toHaveTextContent(destination);
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
    expect(boundary.update).not.toHaveBeenCalled();
  },
);

it("validates the actual required field and never saves blank input", async () => {
  await mount();
  expect(screen.getByText("Complete your profile")).toBeVisible();
  expect(screen.getByLabelText(/Country calling code:.*\+44/)).toBeOnTheScreen();
  await submit();
  expect(screen.getByText("Enter a mobile number.")).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText("Mobile number"), "   ");
  await submit();
  expect(boundary.update).not.toHaveBeenCalled();
  expect(boundary.replace).not.toHaveBeenCalled();
});

it("preserves existing Clerk metadata and returns to the validated invitation only after saving", async () => {
  boundary.inviteToken = "abcdefghijklmnopqrstuv";
  await mount();
  await fireEvent.changeText(screen.getByLabelText("Mobile number"), "1234567890");
  await submit();
  expect(boundary.update).toHaveBeenCalledExactlyOnceWith({
    unsafeMetadata: { existingSetting: "retained", mobileNumber: "+44 1234567890" },
  });
  await waitFor(() =>
    expect(boundary.replace).toHaveBeenCalledExactlyOnceWith("/invite/abcdefghijklmnopqrstuv"),
  );
});

it("keeps a pending save disabled and does not navigate or submit twice before its receipt", async () => {
  let finish: () => void = () => {};
  boundary.update.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  await mount();
  await fireEvent.changeText(screen.getByLabelText("Mobile number"), "1234567890");
  await submit();
  const saving = screen.getByRole("button", { name: "Saving…" });
  expect(saving).toBeDisabled();
  await userEvent.setup().press(saving);
  expect(boundary.update).toHaveBeenCalledOnce();
  expect(boundary.replace).not.toHaveBeenCalled();
  await act(() => finish());
  await waitFor(() => expect(boundary.replace).toHaveBeenCalledExactlyOnceWith("/tables"));
});

it("keeps a failed Clerk write observable, preserves the typed value and permits an explicit retry", async () => {
  boundary.update.mockRejectedValueOnce(new Error("Fixture Clerk write rejected"));
  await mount();
  await fireEvent.changeText(screen.getByLabelText("Mobile number"), "1234567890");
  await submit();
  expect(await screen.findByText("Could not save mobile number")).toBeOnTheScreen();
  expect(screen.getByLabelText("Mobile number")).toHaveDisplayValue("1234567890");
  expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  expect(boundary.replace).not.toHaveBeenCalled();
  await submit();
  expect(boundary.update).toHaveBeenCalledTimes(2);
  await waitFor(() => expect(boundary.replace).toHaveBeenCalledExactlyOnceWith("/tables"));
});

it("uses the searched calling code for the actual profile write and clears the search when the selector closes", async () => {
  await mount();
  const user = userEvent.setup();
  const selector = screen.getByTestId("country-calling-code-select");
  await user.press(selector);
  const search = await screen.findByPlaceholderText("Search countries", {
    includeHiddenElements: true,
  });
  await fireEvent.changeText(search, "Country that does not exist");
  expect(
    await screen.findByText("No countries found", { includeHiddenElements: true }),
  ).toBeOnTheScreen();
  await fireEvent.changeText(search, "Italy");
  await fireEvent.press(
    await screen.findByRole("option", { name: /Italy.*\+39/, includeHiddenElements: true }),
  );
  expect(screen.getByLabelText(/Country calling code: Italy \+39/)).toBeOnTheScreen();
  await user.press(screen.getByTestId("country-calling-code-select"));
  const reopened = await screen.findByPlaceholderText("Search countries", {
    includeHiddenElements: true,
  });
  expect(reopened).toHaveDisplayValue("");
  await fireEvent.changeText(reopened, "Italy");
  await fireEvent.press(
    await screen.findByRole("option", { name: /Italy.*\+39/, includeHiddenElements: true }),
  );
  await fireEvent.changeText(screen.getByLabelText("Mobile number"), "3351234567");
  await submit();
  await waitFor(() => {
    expect(boundary.update).toHaveBeenCalledExactlyOnceWith({
      unsafeMetadata: { existingSetting: "retained", mobileNumber: "+39 3351234567" },
    });
    expect(boundary.replace).toHaveBeenCalledExactlyOnceWith("/tables");
  });
});
