import type {
  NotificationAttentionSnapshot,
  NotificationAttentionTarget,
} from "@board-game-organizer/schemas";
import { emptyAttentionSummary } from "@board-game-organizer/shared";
import { screen, waitFor } from "@testing-library/react-native";
import { expect, it, vi } from "vitest";
import {
  contactsBoundary,
  contactsFixture,
  contactsReady,
  contactTab,
  fixtureJson,
  renderContacts,
  socialWrites,
} from "./contactsScreenFixture";

const sections = ["connections", "requests", "search"] as const;
type Section = (typeof sections)[number];
it.each(sections)(
  "acknowledges only the explicitly selected %s source without navigation or relationship consent",
  async (section) => {
    contactsBoundary.parameter = section === "connections" ? "requests" : "connections";
    const unread = new Set<Section>(sections);
    const acknowledged: {
      target: NotificationAttentionTarget;
      through: string;
    }[] = [];
    const actualFetch = fetch;
    function snapshot(targets: NotificationAttentionTarget[]): NotificationAttentionSnapshot {
      const sectionCounts = {
        connections: Number(unread.has("connections")),
        requests: Number(unread.has("requests")),
        search: Number(unread.has("search")),
      };
      return {
        asOf: acknowledged.length ? "2030-01-01T00:00:01.000Z" : "2030-01-01T00:00:00.000Z",
        unreadCount: unread.size,
        summary: {
          ...emptyAttentionSummary(),
          contacts: unread.size,
          sections: sectionCounts,
        },
        targets: targets.map((target) => {
          const count = target.kind === "contacts" && unread.has(target.id as Section) ? 1 : 0;
          return {
            target,
            count,
            direct: count,
            events: 0,
            sections:
              target.kind === "contacts"
                ? {
                    connections: target.id === "connections" ? count : 0,
                    requests: target.id === "requests" ? count : 0,
                    search: target.id === "search" ? count : 0,
                  }
                : { connections: 0, requests: 0, search: 0 },
          };
        }),
      };
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        );
        if (url.pathname !== "/api/notifications/attention") return actualFetch(input, init);
        if ((init?.method ?? "GET") === "GET") {
          return fixtureJson(snapshot(JSON.parse(url.searchParams.get("targets") ?? "[]")));
        }
        expect(init?.method).toBe("PATCH");
        const body = JSON.parse(String(init?.body)) as {
          target: NotificationAttentionTarget;
          through: string;
        };
        expect(new Headers(init?.headers).get("authorization")).toBe(
          "Bearer fixture-session-token",
        );
        expect(body.target).toEqual({ kind: "contacts", id: section });
        expect(body.through).toBe("2030-01-01T00:00:00.000Z");
        acknowledged.push(body);
        unread.delete(section);
        return fixtureJson({ snapshot: snapshot([body.target]), read: 1 });
      }),
    );
    await renderContacts();
    await contactsReady();
    await waitFor(() => expect(screen.getAllByLabelText("Needs attention")).toHaveLength(3));
    expect(acknowledged).toEqual([]);
    expect(socialWrites()).toEqual([]);
    const routeConsumptions = contactsBoundary.setParams.mock.calls.length;
    await contactTab(section);
    expect(screen.getByTestId(`top-tab-${section}`)).toBeSelected();
    await waitFor(() => expect(acknowledged).toHaveLength(1));
    expect([...unread]).toEqual(sections.filter((candidate) => candidate !== section));
    await waitFor(() => expect(screen.getAllByLabelText("Needs attention")).toHaveLength(2));
    expect(contactsBoundary.setParams).toHaveBeenCalledTimes(routeConsumptions);
    expect(contactsBoundary.push).not.toHaveBeenCalled();
    expect(socialWrites()).toEqual([]);
    expect(
      contactsFixture.writes.filter((write) => write.path.includes("friend-requests")),
    ).toEqual([]);
  },
);
