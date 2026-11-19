import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { createContext, useContext } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { version } from "../../../../package.json";
import { ProfileIdentity } from "../ProfileIdentity";
import { ProfileVersion } from "../ProfileVersion";

type ClerkIdentity = {
  isLoaded: boolean;
  user: { id: string; createdAt: Date | null } | null;
};
const Identity = createContext<ClerkIdentity>({ isLoaded: false, user: null });
const sdk = vi.hoisted(() => ({
  userRead: vi.fn(),
  constants: {
    expoConfig: undefined as { extra: { sentryEnvironment: string } } | undefined,
  },
  fetch: vi.fn(() => {
    throw new Error("Public profile metadata must not make application requests");
  }),
}));
vi.mock("@clerk/expo", () => ({
  useUser: () => {
    sdk.userRead();
    return useContext(Identity);
  },
}));
vi.mock("expo-constants", () => ({ default: sdk.constants }));

const createdAt = new Date("2020-06-15T12:00:00.000Z");
const owner: ClerkIdentity = { isLoaded: true, user: { id: "owner", createdAt } };
const avatarUrl = "https://images.test/owner-avatar.png";
function IdentityFixture({
  identity,
  ownerId,
  locale = "en",
  name = "Owner Player",
}: {
  identity: ClerkIdentity;
  ownerId?: string;
  locale?: "en" | "it";
  name?: string;
}) {
  return (
    <NativeTestProviders locale={locale}>
      <Identity value={identity}>
        <ProfileIdentity name={name} username="owner" avatarUrl={avatarUrl} ownerId={ownerId} />
      </Identity>
    </NativeTestProviders>
  );
}
beforeEach(() => {
  sdk.userRead.mockClear();
  sdk.fetch.mockClear();
  sdk.constants.expoConfig = undefined;
  vi.stubGlobal("fetch", sdk.fetch);
});
afterEach(async () => {
  expect(sdk.fetch).not.toHaveBeenCalled();
  await cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function loadedAvatar(name: string) {
  const image = screen.getByLabelText(name, { exact: true });
  expect(image.type).toBe("RCTImageView");
  expect(image).not.toBeVisible();
  // Network image completion is an OS boundary; keep the real Avatar status/animation.
  await fireEvent(image, "load", {
    nativeEvent: { source: { uri: avatarUrl, width: 64, height: 64 } },
  });
  await waitFor(() => expect(image).toBeVisible());
  return image;
}

it.each([
  { locale: "en", label: "Joined on:", date: "June 15, 2020" },
  { locale: "it", label: "Iscritto dal:", date: "15 giugno 2020" },
] as const)(
  "shows only the authenticated owner's localized $locale Clerk registration date below the real avatar",
  async ({ locale, label, date }) => {
    await render(<IdentityFixture identity={owner} ownerId="owner" locale={locale} />);
    expect(screen.getByText("Owner Player", { exact: true })).toBeVisible();
    expect(screen.getByText("@owner", { exact: true })).toBeVisible();
    const avatar = await loadedAvatar("Owner Player");
    expect(avatar).toBeVisible();
    const joined = screen.getByTestId("profile-joined-at");
    expect(within(joined).getByText(label, { exact: true })).toBeVisible();
    expect(within(joined).getByText(date, { exact: true })).toBeVisible();
    const body = joined.parent;
    if (!body) throw new Error("Expected the actual profile identity body");
    expect(body.children.at(-1)).toBe(joined);
    const avatarRow = body.children[0];
    if (!avatarRow || typeof avatarRow === "string")
      throw new Error("Expected the actual profile avatar row");
    expect(avatarRow.queryAll((node) => node === avatar)).toHaveLength(1);
    expect(sdk.userRead).toHaveBeenCalled();
    expect(screen.queryByRole("button")).toBeNull();
  },
);

it("keeps loading, missing and mismatched Clerk identities private while preserving the mounted avatar", async () => {
  const view = await render(
    <IdentityFixture identity={{ isLoaded: false, user: null }} ownerId="owner" />,
  );
  const avatar = await loadedAvatar("Owner Player");
  const joined = screen.getByTestId("profile-joined-at");
  expect(
    within(joined).getByLabelText("Loading…", { includeHiddenElements: true }),
  ).toBeOnTheScreen();
  expect(within(joined).queryByText("June 15, 2020")).toBeNull();
  await view.rerender(
    <IdentityFixture identity={{ isLoaded: true, user: null }} ownerId="owner" />,
  );
  expect(within(joined).getByText("—", { exact: true })).toBeVisible();
  expect(within(joined).queryByLabelText("Loading…", { includeHiddenElements: true })).toBeNull();
  await view.rerender(
    <IdentityFixture
      identity={{ isLoaded: true, user: { id: "previous-owner", createdAt } }}
      ownerId="owner"
    />,
  );
  expect(within(joined).getByText("—", { exact: true })).toBeVisible();
  expect(within(joined).queryByText("June 15, 2020")).toBeNull();
  await view.rerender(
    <IdentityFixture
      identity={{ isLoaded: true, user: { id: "owner", createdAt: null } }}
      ownerId="owner"
    />,
  );
  expect(within(joined).getByText("—", { exact: true })).toBeVisible();
  await view.rerender(<IdentityFixture identity={owner} ownerId="owner" />);
  expect(within(joined).getByText("June 15, 2020", { exact: true })).toBeVisible();
  expect(screen.getByLabelText("Owner Player", { exact: true })).toBe(avatar);
  expect(avatar).toBeVisible();
});

it("does not consult Clerk or disclose its creation date for a public identity without ownerId", async () => {
  const view = await render(<IdentityFixture identity={owner} name="Public Player" />);
  expect(screen.getByText("Public Player", { exact: true })).toBeVisible();
  const avatar = await loadedAvatar("Public Player");
  expect(avatar).toBeVisible();
  expect(screen.queryByTestId("profile-joined-at")).toBeNull();
  expect(screen.queryByText("June 15, 2020")).toBeNull();
  expect(sdk.userRead).not.toHaveBeenCalled();
  await view.rerender(
    <IdentityFixture
      identity={{ isLoaded: true, user: { id: "another-private-owner", createdAt } }}
      name="Public Player"
    />,
  );
  expect(screen.queryByTestId("profile-joined-at")).toBeNull();
  expect(screen.getByLabelText("Public Player", { exact: true })).toBe(avatar);
  expect(avatar).toBeVisible();
  expect(sdk.userRead).not.toHaveBeenCalled();
});

it.each([
  { environment: "production", override: undefined, locale: "en", label: "Version", suffix: "" },
  {
    environment: "development",
    override: undefined,
    locale: "it",
    label: "Versione",
    suffix: "+abcdef1",
  },
  {
    environment: "production",
    override: "true",
    locale: "en",
    label: "Version",
    suffix: "+abcdef1",
  },
  { environment: "development", override: "false", locale: "it", label: "Versione", suffix: "" },
  {
    environment: undefined,
    override: undefined,
    locale: "en",
    label: "Version",
    suffix: "+abcdef1",
  },
] as const)(
  "uses the running JavaScript version for Expo environment $environment and public override $override",
  async ({ environment, override, locale, label, suffix }) => {
    sdk.constants.expoConfig = environment
      ? { extra: { sentryEnvironment: environment } }
      : undefined;
    vi.stubEnv("EXPO_PUBLIC_APP_PRERELEASE", override);
    vi.stubEnv("EXPO_PUBLIC_BUILD_SHA", "abcdef1234567890abcdef1234567890abcdef12");
    await render(
      <NativeTestProviders locale={locale}>
        <ProfileVersion />
      </NativeTestProviders>,
    );
    const value = screen.getByTestId("profile-version");
    expect(value).toBeVisible();
    expect(value).toHaveTextContent(`${label}: ${version}${suffix}`);
    expect(screen.getByText(`${label}: ${version}${suffix}`, { exact: true })).toBe(value);
    expect(sdk.userRead).not.toHaveBeenCalled();
    expect(screen.queryByRole("button")).toBeNull();
  },
);
