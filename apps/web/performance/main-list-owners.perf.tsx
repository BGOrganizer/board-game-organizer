import { useAppStore } from "@board-game-organizer/store";
import { configure, measureRenders } from "@callstack/reassure-measure";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import {
  type Dispatch,
  type ReactElement,
  type SetStateAction,
  useLayoutEffect,
  useState,
} from "react";
import { afterAll, afterEach, expect, test, vi } from "vitest";
import { Community } from "@/components/community/Community";
import { Events } from "@/components/events/Events";
import { Tables } from "@/components/events/Tables";
import { Groups } from "@/components/groups/Groups";
import { installBrowserIntersections } from "@/test-fixtures/browserIntersections";
import { renderWithI18n } from "@/test-utils";
import { assertRenderMeasurement } from "./assertRenderMeasurement";
import { type MainListOwner, seedMainListOwners } from "./mainListOwnerFixtures";

const boundary = vi.hoisted(() => {
  const previousApiUrl = process.env.NEXT_PUBLIC_API_URL;
  process.env.NEXT_PUBLIC_API_URL = "https://main-owner-performance.test";
  return { previousApiUrl, getToken: vi.fn(async () => "main-owner-token"), push: vi.fn() };
});
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    userId: "owner",
    isLoaded: true,
    isSignedIn: true,
    getToken: boundary.getToken,
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => boundary,
  useSearchParams: () => new URLSearchParams(),
}));
const options = {
  apiUrl: "https://main-owner-performance.test",
  userId: "owner",
  enabled: true,
  getToken: boundary.getToken,
};
const initialStore = useAppStore.getState();
let client: QueryClient | undefined;
let fixture: ReturnType<typeof seedMainListOwners> | undefined;
let selectOwner: Dispatch<SetStateAction<MainListOwner>> | undefined;

// The fixture only selects actual application owners. It measures their mount/reentry,
// not Next routing, retained routes or the platform's main-navigation implementation.
function MainOwnerJourney() {
  const [owner, setOwner] = useState<MainListOwner>("groups");
  useLayoutEffect(() => {
    selectOwner = setOwner;
    return () => {
      selectOwner = undefined;
    };
  }, []);
  return owner === "groups" ? <Groups /> : owner === "events" ? <Events /> : <Tables />;
}
function current() {
  if (!client || !fixture) throw new Error("Expected a measured canonical owner cache");
  return { client, fixture };
}
function renderOwners(ui: ReactElement) {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  fixture = seedMainListOwners(client, options);
  useAppStore.setState({ communityViews: {} });
  boundary.push.mockClear();
  installBrowserIntersections();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      expect(url.origin).toBe(options.apiUrl);
      expect(init?.method ?? "GET").toBe("GET");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer main-owner-token");
      return Response.json(current().fixture.read(url));
    }),
  );
  return renderWithI18n(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
function cleanupOwners() {
  cleanup();
  client?.clear();
  client = undefined;
  fixture = undefined;
  useAppStore.setState(initialStore, true);
}
configure({
  testingLibrary: { render: renderOwners, cleanup: cleanupOwners },
  runs: 10,
  warmupRuns: 1,
});
afterEach(() => {
  cleanupOwners();
  vi.unstubAllGlobals();
});
afterAll(() => {
  if (boundary.previousApiUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
  else process.env.NEXT_PUBLIC_API_URL = boundary.previousApiUrl;
});
async function visit(owner: MainListOwner, name: string) {
  const select = selectOwner;
  if (!select) throw new Error("Expected the actual-owner fixture controller");
  act(() => select(owner));
  expect(await screen.findByText(name)).toBeVisible();
}

const mainScenario =
  "Main list owners: Groups Events History cached reentry and real authoritative refresh";
test(mainScenario, async () => {
  const result = await measureRenders(<MainOwnerJourney />, {
    scenario: async () => {
      const { client, fixture } = current();
      expect(await screen.findByText("Cached private group")).toBeVisible();
      expect(screen.queryByText("Retained private group")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Load more" }));
      expect(await screen.findByText("Retained private group")).toBeVisible();
      expect(client.getQueryData(fixture.keys.groups)).toBe(fixture.snapshots.groups);
      for (let visit = 0; visit < 2; visit++) {
        fireEvent.click(screen.getByRole("tab", { name: "Public groups" }));
        expect(await screen.findByText("Cached public group")).toBeVisible();
        fireEvent.click(screen.getByRole("tab", { name: "Private groups" }));
        expect(await screen.findByText("Cached private group")).toBeVisible();
      }
      await visit("events", "Cached scheduled event");
      for (const [tab, name] of [
        ["Available events", "Cached available event"],
        ["Terminated events", "Cached terminated event"],
        ["Scheduled", "Cached scheduled event"],
      ]) {
        fireEvent.click(screen.getByRole("tab", { name: tab }));
        expect(await screen.findByText(name)).toBeVisible();
      }
      expect(client.getQueryData(fixture.keys.events)).toBe(fixture.snapshots.events);
      await visit("history", "Cached history table");
      expect(screen.queryByText("Retained history table")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Load more" }));
      expect(await screen.findByText("Retained history table")).toBeVisible();
      expect(client.getQueryData(fixture.keys.history)).toBe(fixture.snapshots.history);
      expect(fixture.reads).toEqual([]);
      const firstTable = screen.getByRole("link", { name: "Open table: Cached history table" });
      await act(() => fixture.refresh("history"));
      expect(await screen.findByRole("link", { name: "Open table: Updated history table" })).toBe(
        firstTable,
      );
      await visit("events", "Cached scheduled event");
      await act(() => fixture.refresh("events"));
      expect(await screen.findByText("Updated scheduled event")).toBeVisible();
      await visit("groups", "Cached private group");
      await act(() => fixture.refresh("groups"));
      expect(await screen.findByText("Updated private group")).toBeVisible();
      for (let reentry = 0; reentry < 2; reentry++) {
        await visit("events", "Updated scheduled event");
        await visit("history", "Updated history table");
        await visit("groups", "Updated private group");
        expect(screen.queryByText("Retained private group")).toBeNull();
      }
      expect(fixture.reads).toEqual([
        "history:first",
        "history:retained",
        "events:first",
        "events:retained",
        "groups:first",
        "groups:retained",
      ]);
      expect(client.getQueryData(fixture.foreignKey)).toBe(fixture.foreignSnapshot);
      expect(screen.queryByText("Foreign private group")).toBeNull();
      await waitFor(() => expect(client.isFetching()).toBe(0));
      expect(fixture.unexpected).toEqual([]);
      expect(fetch).toHaveBeenCalledTimes(fixture.reads.length);
      expect(boundary.push).not.toHaveBeenCalled();
    },
  });
  assertRenderMeasurement(result, mainScenario);
});

const communityScenario =
  "Community owner: cached feed reveal Marketplace reentry and real authoritative refresh";
test(communityScenario, async () => {
  const result = await measureRenders(<Community />, {
    scenario: async () => {
      const { client, fixture } = current();
      expect(await screen.findByText("Cached activity table")).toBeVisible();
      expect(screen.queryByText("Retained activity table")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Load more" }));
      expect(await screen.findByText("Retained activity table")).toBeVisible();
      expect(client.getQueryData(fixture.keys.community)).toBe(fixture.snapshots.community);
      for (let visit = 0; visit < 2; visit++) {
        fireEvent.click(screen.getByRole("tab", { name: "Marketplace" }));
        expect(await screen.findByText("Coming soon")).toBeVisible();
        fireEvent.click(screen.getByRole("tab", { name: "Activities" }));
        expect(await screen.findByText("Cached activity table")).toBeVisible();
      }
      expect(fixture.reads).toEqual([]);
      for (const author of screen.getAllByRole("link", { name: "network-player" }))
        expect(author).toHaveAttribute("href", "/profiles/network-author");
      await act(() => fixture.refresh("community"));
      expect(await screen.findByText("Updated activity table")).toBeVisible();
      expect(screen.queryByText("Cached activity table")).toBeNull();
      fireEvent.click(screen.getByRole("tab", { name: "Marketplace" }));
      fireEvent.click(screen.getByRole("tab", { name: "Activities" }));
      expect(await screen.findByText("Updated activity table")).toBeVisible();
      expect(fixture.reads).toEqual(["community:first", "community:retained"]);
      expect(
        useAppStore.getState().communityViews[JSON.stringify([options.apiUrl, "owner"])]?.tab,
      ).toBe("activity");
      expect(client.getQueryData(fixture.foreignKey)).toBe(fixture.foreignSnapshot);
      await waitFor(() => expect(client.isFetching()).toBe(0));
      expect(fixture.unexpected).toEqual([]);
      expect(fetch).toHaveBeenCalledTimes(fixture.reads.length);
      expect(boundary.push).not.toHaveBeenCalled();
    },
  });
  assertRenderMeasurement(result, communityScenario);
});
