import type { ProfileActivity, ProfileView } from "@board-game-organizer/schemas";
import { profileActivitiesQuery, profileViewQuery } from "@board-game-organizer/shared";
import { useAppStore } from "@board-game-organizer/store";
import { measureRenders } from "@callstack/reassure-measure";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen } from "@testing-library/react-native";
import {
  createContext,
  createRef,
  type ReactNode,
  useContext,
  useImperativeHandle,
  useState,
} from "react";
import { Text } from "react-native";
import { expect, it, vi } from "vitest";
import ProfileActivitiesScreen from "@/app/user/[userId]/activities";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

const boundary = vi.hoisted(() => ({
  apiUrl: "https://native-activities-perf.test",
  token: async () => "activity-fixture-token",
  push: vi.fn(),
}));
const Session = createContext(true);
vi.mock("@clerk/expo", () => ({
  useAuth: () => {
    const signedIn = useContext(Session);
    return {
      userId: signedIn ? "owner" : null,
      sessionId: signedIn ? "activity-fixture-session" : null,
      isLoaded: true,
      isSignedIn: signedIn,
      getToken: boundary.token,
    };
  },
  useUser: () => ({
    isLoaded: true,
    user: { unsafeMetadata: { mobileNumber: "fixture contact value" } },
  }),
}));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { apiUrl: boundary.apiUrl } } },
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: boundary.push }),
  useLocalSearchParams: () => ({ userId: profile.id }),
  Redirect: ({ href }: { href: string }) => <Text testID="native-redirect-target">{href}</Text>,
}));
vi.mock("expo-notifications", () => ({}));

const options = {
  apiUrl: boundary.apiUrl,
  userId: "owner",
  enabled: true,
  getToken: boundary.token,
};
const profile: ProfileView = {
  id: "subject",
  name: "Subject Player",
  username: "subject-player",
  avatarUrl: null,
  social: { friends: 1, followers: 2, following: 3 },
  player: { gamesPlayed: 3, gamesWon: 1, winRate: 33.3 },
};
const eventId = "11111111-1111-4111-8111-111111111111";
const activity: ProfileActivity = {
  id: "activity",
  kind: "event_join",
  occurredAt: "2030-06-01T12:00:00.000Z",
  context: "Spring games",
  eventContext: "Spring event participation",
  href: `/events/${eventId}`,
  visibility: "authorized",
};

it("ProfileAccess and ProfileActivities: render owned activity, open its source and revoke access on sign-out", async () => {
  const profileKey = profileViewQuery(options, profile.id).queryKey;
  const activityKey = profileActivitiesQuery(options, profile.id, undefined, 10).queryKey;
  const driver = createRef<{ signOut: () => void }>();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  function Providers({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <NativeTestProviders>{children}</NativeTestProviders>
      </QueryClientProvider>
    );
  }
  function GatedActivities() {
    const [signedIn, setSignedIn] = useState(true);
    useImperativeHandle(driver, () => ({ signOut: () => setSignedIn(false) }), []);
    return (
      <Session.Provider value={signedIn}>
        <ProfileActivitiesScreen />
      </Session.Provider>
    );
  }
  try {
    const measured = await measureRenders(<GatedActivities />, {
      wrapper: Providers,
      beforeEach: () => {
        useAppStore.getState().clearProfileViews();
        client.clear();
        client.setQueryData(profileKey, profile);
        client.setQueryData(activityKey, {
          pages: [{ items: [activity], nextCursor: null }],
          pageParams: [""],
        });
        boundary.push.mockClear();
        fetch.mockClear();
      },
      scenario: async () => {
        expect(await screen.findByText("Spring event participation")).toBeVisible();
        expect(screen.getByRole("combobox", { name: "Activity type" })).toBeVisible();
        expect(screen.queryByTestId("native-redirect-target")).toBeNull();
        await fireEvent.press(screen.getByText("Spring games"));
        expect(boundary.push).toHaveBeenCalledExactlyOnceWith(`/event/${eventId}`);
        await act(() => driver.current?.signOut());
        expect(screen.queryByText("Spring event participation")).toBeNull();
        expect(screen.getByTestId("native-redirect-target")).toHaveTextContent("/");
        expect(fetch).not.toHaveBeenCalled();
      },
    });
    assertRenderMeasurement(measured);
  } finally {
    await client.cancelQueries();
    client.clear();
    useAppStore.getState().clearProfileViews();
    vi.unstubAllGlobals();
  }
});
