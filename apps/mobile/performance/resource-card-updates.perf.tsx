import { writeFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import type {
  NotificationAttentionSnapshot,
  NotificationAttentionTarget,
} from "@board-game-organizer/schemas";
import {
  NotificationAttentionProvider,
  notificationAttentionQuery,
  useNotificationAttentionContext,
} from "@board-game-organizer/shared";
import { measureRenders } from "@callstack/reassure-measure";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, screen, waitFor } from "@testing-library/react-native";
import { NavigationContext } from "expo-router/react-navigation";
import {
  type ContextType,
  createRef,
  Profiler,
  type ProfilerOnRenderCallback,
  type ReactNode,
  type Ref,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import { Text } from "react-native";
import { beforeEach, expect, it, vi } from "vitest";
import { EventCard } from "@/components/events/EventCard";
import { EventTableCard } from "@/components/events/EventTableCard";
import { GroupCard } from "@/components/groups/GroupCard";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  installNativePopoverMeasurements,
  pressMeasuredPopover,
} from "@/test/nativePopoverGeometry";
import { groupRecord, plannedEvent, plannedTable } from "../../web/src/test-fixtures/eventRecords";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("expo-router", () => ({
  useRouter: () => navigation,
  useLocalSearchParams: () => ({}),
}));
vi.mock("@clerk/expo", () => ({ useAuth: () => ({ userId: "owner" }) }));

type Kind = "group" | "event" | "table";
type Resource = typeof groupRecord | typeof plannedEvent | typeof plannedTable;
type Stage = "mount" | "parent" | "attention" | "unread" | "rename" | "popover";
type Commit = {
  id: string;
  stage: Stage;
  phase: Parameters<ProfilerOnRenderCallback>[1];
  duration: number;
};
type Driver = { revise: () => void; rename: () => void };
const base: Record<Kind, Resource> = {
  group: groupRecord,
  event: plannedEvent,
  table: plannedTable,
};
const labels = { group: "Open group", event: "Open event", table: "Open table" };
const popovers = { group: "Private", event: "Private event", table: "Rating enabled" };
const focusedNavigation = {
  isFocused: () => true,
  addListener: () => () => undefined,
} as unknown as NonNullable<ContextType<typeof NavigationContext>>;

function resourceRow(kind: Kind, record: Resource) {
  if (kind === "group") return <GroupCard group={record as typeof groupRecord} />;
  if (kind === "event") return <EventCard event={record as typeof plannedEvent} />;
  return <EventTableCard table={record as typeof plannedTable} />;
}

function rows(kind: Kind) {
  return screen.getAllByRole("button", {
    name: new RegExp(`^${labels[kind]}:`),
    includeHiddenElements: true,
  });
}

beforeEach(installNativePopoverMeasurements);

it.each(["group", "event", "table"] as const)(
  "eight real %s rows retain controls through parent, attention, authoritative and popover updates",
  async (kind) => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
    });
    const records: Resource[] = Array.from({ length: 8 }, (_, index) => ({
      ...base[kind],
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      name: `Resource ${index + 1}`,
    }));
    const targets: NotificationAttentionTarget[] = records.map(({ id }) => ({ kind, id }));
    const options = {
      apiUrl: "https://performance-fixtures.test",
      userId: "owner",
      enabled: false,
      getToken: vi.fn(async () => "test-token"),
    };
    const queryKey = notificationAttentionQuery(options, targets).queryKey;
    function snapshot(revision: number, count = 0): NotificationAttentionSnapshot {
      return {
        asOf: `2030-06-01T10:00:${String(revision).padStart(2, "0")}.000Z`,
        unreadCount: count,
        summary: {
          tables: kind === "table" ? count : 0,
          events: kind === "event" ? count : 0,
          groups: kind === "group" ? count : 0,
          contacts: 0,
          sections: { connections: 0, requests: 0, search: 0 },
        },
        targets: targets.map((target, index) => ({
          target,
          count: index ? 0 : count,
          direct: index ? 0 : count,
          events: 0,
          sections: { connections: 0, requests: 0, search: 0 },
        })),
      };
    }
    let stage: Stage = "mount";
    let commits: Commit[] = [];
    let attentionCommits = 0;
    const runs: Commit[][] = [];
    const driver = createRef<Driver>();
    const capture: ProfilerOnRenderCallback = (id, phase, duration) => {
      commits.push({ id, stage, phase, duration });
    };
    // Wait for the real Query observer, including equivalent-count snapshots.
    function AttentionObserver() {
      const attention = useNotificationAttentionContext();
      useEffect(() => {
        if (attention?.ready) attentionCommits++;
      }, [attention]);
      return null;
    }
    function Harness({ ref }: { ref: Ref<Driver> }) {
      const [revision, setRevision] = useState(0);
      const [current, setCurrent] = useState(records);
      useImperativeHandle(ref, () => ({
        revise: () => setRevision((value) => value + 1),
        rename: () =>
          setCurrent((previous) =>
            previous.map((record, index) =>
              index ? record : { ...record, name: "Updated authoritative name" },
            ),
          ),
      }));
      return (
        <NotificationAttentionProvider options={options} targets={targets}>
          <AttentionObserver />
          <Text>Revision {revision}</Text>
          {current.map((record) => (
            <Profiler key={record.id} id={record.id} onRender={capture}>
              {resourceRow(kind, record)}
            </Profiler>
          ))}
        </NotificationAttentionProvider>
      );
    }
    const wrapper = ({ children }: { children: ReactNode }) => (
      <NativeTestProviders>
        <QueryClientProvider client={client}>
          <NavigationContext.Provider value={focusedNavigation}>
            {children}
          </NavigationContext.Provider>
        </QueryClientProvider>
      </NativeTestProviders>
    );
    try {
      const result = await measureRenders(<Harness ref={driver} />, {
        wrapper,
        beforeEach: () => {
          client.clear();
          client.setQueryData(queryKey, snapshot(0));
          navigation.push.mockClear();
          stage = "mount";
          commits = [];
          attentionCommits = 0;
        },
        scenario: async () => {
          const original = rows(kind);
          expect(original).toHaveLength(8);
          expect(screen.queryByLabelText("Unread updates")).toBeNull();
          const mounted = new Set(
            commits.filter((commit) => commit.phase === "mount").map((c) => c.id),
          );
          expect(mounted).toEqual(new Set(records.map(({ id }) => id)));
          function retained() {
            const current = rows(kind);
            expect(current).toHaveLength(8);
            current.forEach((host, index) => {
              expect(host).toBe(original[index]);
            });
            expect(
              commits.filter((commit) => commit.stage !== "mount" && commit.phase === "mount"),
            ).toHaveLength(0);
          }
          for (let revision = 1; revision <= 5; revision++) {
            stage = "parent";
            await act(() => driver.current?.revise());
            expect(screen.getByText(`Revision ${revision}`)).toBeVisible();
            retained();
            stage = "attention";
            const before = attentionCommits;
            await act(() => client.setQueryData(queryKey, snapshot(revision)));
            await waitFor(() => expect(attentionCommits).toBeGreaterThan(before));
            expect(screen.queryByLabelText("Unread updates")).toBeNull();
            retained();
          }
          stage = "unread";
          await act(() => client.setQueryData(queryKey, snapshot(6, 1)));
          await waitFor(() => expect(screen.getAllByLabelText("Unread updates")).toHaveLength(1));
          expect(original[0].props.accessibilityValue).toEqual({ text: "Unread updates" });
          original.slice(1).forEach((host) => {
            expect(host.props.accessibilityValue).toBeUndefined();
          });
          retained();
          stage = "rename";
          await act(() => driver.current?.rename());
          expect(screen.getByText("Updated authoritative name")).toBeVisible();
          expect(screen.queryByText("Resource 1")).toBeNull();
          expect(rows(kind)[0].props.accessibilityLabel).toBe(
            `${labels[kind]}: Updated authoritative name`,
          );
          retained();
          stage = "popover";
          await pressMeasuredPopover(screen.getAllByRole("button", { name: popovers[kind] })[0]);
          expect(
            screen.getByRole("heading", { name: kind === "table" ? "Rating" : popovers[kind] }),
          ).toBeVisible();
          expect(navigation.push).not.toHaveBeenCalled();
          retained();
          expect(options.getToken).not.toHaveBeenCalled();
          expect(
            commits.every((commit) => Number.isFinite(commit.duration) && commit.duration >= 0),
          ).toBe(true);
        },
        afterEach: () => {
          runs.push(commits);
        },
      });
      // These are subtree commits, not composite function invocations or device frames.
      // Preserve stage/row samples before the deliberately uncalibrated root budget check.
      expect(runs).toHaveLength(result.runs + 1);
      writeFileSync(
        fileURLToPath(
          new URL(`../.reassure/resource-card-update-${kind}.rows.json`, import.meta.url),
        ),
        JSON.stringify(
          { scenario: expect.getState().currentTestName, warmupRuns: 1, runs },
          null,
          2,
        ),
      );
      assertRenderMeasurement(result);
    } finally {
      client.clear();
    }
  },
);
