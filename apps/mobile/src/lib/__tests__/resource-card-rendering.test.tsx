// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import * as schemas from "@board-game-organizer/schemas";
import * as shared from "@board-game-organizer/shared";
import * as React from "react";
import * as runtime from "react/jsx-runtime";
import { createRoot } from "react-dom/client";
import ts from "typescript";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { RetainedTabPanel } from "@/components/common/ui/RetainedTabPanel";
import {
  groupRecord,
  plannedEvent,
  plannedTable,
} from "../../../../web/src/test-fixtures/eventRecords";
import { cardStateMessages } from "../eventCardMessages";

beforeAll(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterAll(() => vi.unstubAllGlobals());

// Real React reconciliation and Profiler, native/HeroUI hosts replaced; not device frame timings.
function harness(overrides: Record<string, unknown> = {}) {
  const Attention = React.createContext({ get: (_target: { id: string }) => ({ count: 0 }) });
  const Locale = React.createContext("en");
  const Theme = React.createContext("light");
  const Identity = React.createContext("owner");
  const calls = new Map<string, number>();
  const count = (name: string) => calls.set(name, (calls.get(name) ?? 0) + 1);
  const cache = new Map<string, Record<string, React.ElementType>>();
  const host = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  const router = { push: vi.fn() };
  const colors = (tokens: string | string[]) => {
    React.useContext(Theme);
    return tokens;
  };
  function useT() {
    const locale = React.useContext(Locale);
    return React.useCallback((text: string) => `${locale}:${text}`, [locale]);
  }
  function Help({ label, children }: { label: string; children?: React.ReactNode }) {
    const [open, setOpen] = React.useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(!open)}>
          {label}
        </button>
        {open ? children : null}
      </>
    );
  }
  const linked = vi.fn(
    ({ heading, leadingActions, artwork, children }: Record<string, React.ReactNode>) => (
      <>
        {heading}
        {artwork}
        {leadingActions}
        {children}
      </>
    ),
  );
  const modules: Record<string, unknown> = {
    "@board-game-organizer/schemas": schemas,
    react: React,
    "react/jsx-runtime": runtime,
    "react-native": {
      View: host,
      ScrollView: host,
      FlatList: host,
      useWindowDimensions: () => ({ width: 360, height: 800 }),
    },
    "react-native-safe-area-context": {
      useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }),
    },
    "@clerk/expo": { useAuth: () => ({ userId: React.useContext(Identity) }) },
    "@board-game-organizer/shared": {
      ...shared,
      useNotificationAttentionContext: () => React.useContext(Attention),
    },
    "@lingui/react": {
      useLingui: () => ({
        i18n: { _: () => "count", number: String, locale: React.useContext(Locale) },
      }),
    },
    "expo-router": { useRouter: () => router },
    "heroui-native/hooks": { useThemeColor: colors },
    "heroui-native/skeleton": { Skeleton: host },
    "heroui-native/text": { Typography: host },
    "heroui-native/button": { Button: host },
    "lucide-react-native": new Proxy({}, { get: () => host }),
    "@/lib/i18n": { useT },
    "@/lib/eventCardMessages": { cardStateMessages },
    "@/components/common/ui/LinkedListCard": { LinkedListCard: linked },
    "@/components/common/ui/RecordIdentityCard": { RecordIdentityCard: host },
    "@/components/notifications/NotificationItem": { NotificationItem: host },
    "@/components/common/ui/ListCardBody": {
      ListCardBody: ({ title }: { title: string }) => <span>{title}</span>,
    },
    "@/components/common/ui/ClientRecordBadge": {
      ClientRecordBadge: host,
      useClientRecordStatus: () => "",
    },
    "@/components/common/ui/AnimatedDicebearArtwork": { AnimatedDicebearArtwork: host },
    "./GroupArtwork": { GroupArtwork: host },
    "@/components/common/ui/ArtworkStatusPopover": { ArtworkStatusPopover: Help },
    "@/components/common/ui/HelpPopover": { HelpPopover: Help },
    "./EventRolePopover": { EventRolePopover: host },
    "./EventCardTableSummaries": { EventCardTableSummaries: host },
    "./EventSchedulePopover": { EventSchedulePopover: host },
    "./EventTableSchedulePopover": { EventTableSchedulePopover: host },
    "./EventTableGamesPopover": { EventTableGamesPopover: host },
    "./EventTableRatingInfo": { EventTableRatingInfo: host },
    ...overrides,
  };
  function load(file: string, name: string): React.ElementType {
    if (cache.has(file)) return cache.get(file)?.[name] as React.ElementType;
    const output: Record<string, React.ElementType> = {};
    const source = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../../components", `${file}.tsx`),
      "utf8",
    );
    runInNewContext(
      ts.transpileModule(source, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.ReactJSX,
        },
      }).outputText,
      {
        exports: output,
        require: (id: string) => {
          const child =
            /^\.\/(GroupCardIndicators|EventCardIndicators|EventTableCardIndicators)$/.exec(
              id,
            )?.[1];
          if (child) return { [child]: load(`${file.split("/")[0]}/${child}`, child) };
          if (!(id in modules)) throw new Error(`Unexpected render dependency: ${id}`);
          return modules[id];
        },
      },
    );
    const component = output[name] as unknown as { type?: React.FunctionComponent };
    if (component.type) {
      const render = component.type;
      component.type = (props) => {
        count(name);
        return render(props);
      };
    }
    cache.set(file, output);
    return output[name] as React.ElementType;
  }
  return { Attention, Locale, Theme, Identity, linked, load, calls, router };
}

it.each([
  ["groups/GroupCard", "GroupCard", "GroupCardIndicators", "group", groupRecord],
  ["events/EventCard", "EventCard", "EventCardIndicators", "event", plannedEvent],
  ["events/EventTableCard", "EventTableCard", "EventTableCardIndicators", "table", plannedTable],
] as const)(
  "isolates unchanged rows and local popovers in %s",
  async (file, name, indicator, prop, record) => {
    const h = harness();
    const Card = h.load(file, name);
    const container = Reflect.get(globalThis, "document").createElement("div");
    const root = createRoot(container);
    let records = Array.from({ length: 8 }, (_, i) => ({ ...record, id: `resource-${i}` }));
    let notice = { get: (_target: { id: string }) => ({ count: 0 }) };
    let locale = "en";
    let theme = "light";
    let user = "owner";
    const commits: number[] = [];
    const render = () =>
      React.act(async () =>
        root.render(
          <h.Locale value={locale}>
            <h.Theme value={theme}>
              <h.Identity value={user}>
                <h.Attention value={notice}>
                  <React.Profiler
                    id={name}
                    onRender={(_id, _phase, duration) => commits.push(duration)}
                  >
                    {records.map((row) => (
                      <Card key={row.id} {...{ [prop]: row }} />
                    ))}
                  </React.Profiler>
                </h.Attention>
              </h.Identity>
            </h.Theme>
          </h.Locale>,
        ),
      );
    try {
      await render();
      expect(h.linked).toHaveBeenCalledTimes(8);
      expect(h.calls.get(indicator)).toBe(8);
      // Parent/query rerenders and equivalent notification snapshots do not rebuild card bodies.
      for (let i = 0; i < 5; i++) {
        notice = { get: (_target) => ({ count: 0 }) };
        await render();
      }
      expect(h.linked).toHaveBeenCalledTimes(8);
      expect(h.calls.get(indicator)).toBe(8);
      notice = { get: (target) => ({ count: target.id === "resource-0" ? 1 : 0 }) };
      await render();
      expect(h.linked).toHaveBeenCalledTimes(9);
      expect(h.calls.get(indicator)).toBe(8);
      records = records.map((row, i) => (i ? row : { ...row, name: "Updated name" }));
      await render();
      expect(h.linked).toHaveBeenCalledTimes(10);
      expect(h.calls.get(indicator)).toBe(9);
      expect(container.textContent).toContain("Updated name");
      const before = h.linked.mock.calls.length;
      const beforeIndicators = h.calls.get(indicator);
      const button = container.querySelector("button");
      expect(button).not.toBeNull();
      await React.act(async () => button?.click());
      expect(h.linked).toHaveBeenCalledTimes(before);
      expect(h.calls.get(indicator)).toBe(beforeIndicators);
      // Theme, locale and account changes still cross memo boundaries.
      locale = "it";
      await render();
      expect(h.linked.mock.calls.length).toBeGreaterThan(before);
      expect(container.textContent).toContain("it:");
      const translated = h.linked.mock.calls.length;
      theme = "dark";
      await render();
      expect(h.linked.mock.calls.length).toBeGreaterThan(translated);
      if (prop === "table") {
        const themed = h.calls.get(indicator) ?? 0;
        user = "another-user";
        await render();
        expect(h.calls.get(indicator)).toBeGreaterThan(themed);
      }
      expect(commits.every(Number.isFinite)).toBe(true);
    } finally {
      await React.act(async () => root.unmount());
    }
  },
);

it.each([
  ["groups/GroupIdentityCard", "GroupIdentityCard", "GroupCardIndicators", "group", groupRecord],
  ["events/EventDetailsCard", "EventDetailsCard", "EventCardIndicators", "event", plannedEvent],
  ["events/EventTableInfo", "EventTableInfo", "EventTableCardIndicators", "table", plannedTable],
] as const)(
  "keeps detail indicators stable through unrelated updates in %s",
  async (file, name, indicator, prop, record) => {
    const h = harness();
    const Card = h.load(file, name);
    const root = createRoot(Reflect.get(globalThis, "document").createElement("div"));
    try {
      for (let i = 0; i < 6; i++)
        await React.act(async () =>
          root.render(<Card {...{ [prop]: record }} titleAction={<span>{i}</span>} />),
        );
      expect(h.calls.get(indicator)).toBe(1);
      await React.act(async () =>
        root.render(<Card {...{ [prop]: { ...record, name: "Changed detail" } }} />),
      );
      expect(h.calls.get(indicator)).toBe(2);
    } finally {
      await React.act(async () => root.unmount());
    }
  },
);

it("retains each Event list/header and rejects inactive-tab paging", async () => {
  const host = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  const labelHost = Object.assign(host, { Label: host });
  const scrollTo = vi.fn();
  const mounted = vi.fn();
  const disposed = vi.fn();
  const headerMounted = vi.fn();
  const fetchNextPage = vi.fn();
  const resetPresentation = vi.fn();
  let select: (value: string) => void = () => {};
  const endReached = new Map<string, () => void>();
  function List(props: {
    ref: React.Ref<unknown>;
    ListHeaderComponent: React.ReactNode;
    data: (typeof plannedTable)[];
    renderItem: (row: { item: typeof plannedTable }) => React.ReactNode;
    onEndReached: () => void;
    initialNumToRender: number;
    maxToRenderPerBatch: number;
    windowSize: number;
  }) {
    React.useState(() => {
      mounted();
      return null;
    });
    expect([props.initialNumToRender, props.maxToRenderPerBatch, props.windowSize]).toEqual([
      8, 6, 7,
    ]);
    React.useImperativeHandle(props.ref, () => ({ getNativeScrollRef: () => ({ scrollTo }) }), []);
    React.useEffect(() => {
      return () => {
        disposed();
      };
    }, []);
    endReached.set(props.data.length ? "tables" : "details", props.onEndReached);
    return (
      <div data-list="retained">
        {props.ListHeaderComponent}
        {props.data.map((item) => (
          <React.Fragment key={item.id}>{props.renderItem({ item })}</React.Fragment>
        ))}
      </div>
    );
  }
  function Header() {
    React.useState(() => {
      headerMounted();
      return null;
    });
    return <span>Event identity</span>;
  }
  const tabs = Object.assign(
    ({ children, onValueChange }: { children: React.ReactNode; onValueChange: typeof select }) => {
      select = onValueChange;
      return <>{children}</>;
    },
    { Label: host },
  );
  const overrides: Record<string, unknown> = {
    "@board-game-organizer/shared": {
      ...shared,
      useEventRecord: () => ({ data: plannedEvent }),
      useRecordTables: () => ({
        items: [plannedTable],
        hasNextPage: true,
        fetchNextPage,
        resetPresentation,
      }),
      useEventRecordActions: () => ({ busy: false, blocking: false }),
      useNotificationChanges: () => ({ tabCounts: {} }),
    },
    "react-native": { View: host, FlatList: List },
    "expo-router": { useRouter: () => ({}), Stack: { Screen: () => null } },
    "heroui-native/tabs": { Tabs: tabs },
    "heroui-native/button": { Button: labelHost },
    "@/lib/useCommunityApi": { useCommunityApi: () => ({ userId: "owner" }) },
    "@/lib/useFloatingActionLayout": { useFloatingActionLayout: () => ({ paddingBottom: 32 }) },
    "@/components/common/layout/headerStyles": { HEADER_ICON_SIZE: 20, headerButtonProps: {} },
    "@/components/common/ui/ScrollTargetContext": {
      ScrollTargetContext: React.createContext(null),
    },
    "@/components/common/ui/RetainedTabPanel": { RetainedTabPanel },
    "./EventDetailsCard": { EventDetailsCard: Header },
    "./EventTableCard": {
      EventTableCard: ({ table }: { table: typeof plannedTable }) => <span>{table.name}</span>,
    },
  };
  for (const name of [
    "ConfirmDialog",
    "DateTimeInfo",
    "EmptyList",
    "FloatingActions",
    "GroupedList",
    "GroupedRow",
    "ScreenScrollView",
    "TabBar",
    "TabTrigger",
  ])
    overrides[`@/components/common/ui/${name}`] = { [name]: host };
  overrides["@/components/locations/LocationListRow"] = { LocationListRow: host };
  for (const name of [
    "NotificationAttentionScope",
    "NotificationChangesPopover",
    "NotificationItem",
    "NotificationTabBadge",
  ])
    overrides[`@/components/notifications/${name}`] = { [name]: host };
  for (const name of [
    "EventDeleteAction",
    "EventFinalizeAction",
    "EventGroupLink",
    "EventParticipants",
    "EventProposalSection",
    "EventVoteButtons",
    "EventVoteCounts",
    "EventVoteLegend",
  ])
    overrides[`./${name}`] = { [name]: host };
  const h = harness(overrides);
  const Detail = h.load("events/EventDetail", "EventDetail");
  const container = Reflect.get(globalThis, "document").createElement("div");
  const root = createRoot(container);
  try {
    await React.act(async () => root.render(<Detail eventId={plannedEvent.id} />));
    expect(mounted).toHaveBeenCalledTimes(1);
    expect(headerMounted).toHaveBeenCalledTimes(1);
    for (const tab of ["tables", "details", "tables", "details"]) {
      const previousEnd = endReached.get("tables");
      await React.act(async () => select(tab));
      const visibleList = container.querySelector('[data-list]:not([style*="display: none"])');
      expect(visibleList.textContent?.includes(plannedTable.name)).toBe(tab === "tables");
      if (tab === "details") {
        if (!previousEnd) throw new Error("Expected the previously active Tables callback");
        previousEnd();
      }
    }
    expect(fetchNextPage).not.toHaveBeenCalled();
    expect(resetPresentation).toHaveBeenCalledTimes(2);
    expect(mounted).toHaveBeenCalledTimes(2);
    expect(headerMounted).toHaveBeenCalledTimes(2);
    expect(disposed).toHaveBeenCalledTimes(4);
    expect(scrollTo).toHaveBeenCalledTimes(4);
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 0, animated: false });
  } finally {
    await React.act(async () => root.unmount());
  }
  expect(disposed).toHaveBeenCalledTimes(5);
});
