import { describe, expect, it } from "vitest";
import { widgetTarget } from "./widgetRoutes";

describe("BGO widget destinations", () => {
  it.each([
    ["/events/", "list_events", {}],
    ["/events/event?fromGroup=group", "get_event", { params: { eventId: "event" } }],
    ["/events/event?tab=tables", "get_event", { params: { eventId: "event" } }, "tables"],
    [
      "/events/event?tab=participants",
      "get_event",
      { params: { eventId: "event" } },
      "participants",
    ],
    [
      "/events/event/tables/table?fromEvent=event",
      "get_table",
      { params: { eventId: "event", tableId: "table" } },
    ],
    [
      "/events/event/tables/table/results",
      "get_table",
      { params: { eventId: "event", tableId: "table" } },
      "results",
    ],
    [
      "/events/event/tables/table?tab=results",
      "get_table",
      { params: { eventId: "event", tableId: "table" } },
      "results",
    ],
    [
      "/events/event/tables/table?tab=participants",
      "get_table",
      { params: { eventId: "event", tableId: "table" } },
      "participants",
    ],
    ["/groups", "list_groups", {}],
    ["/groups/new", "prepare_group_creation", {}],
    ["/groups/grp", "get_group", { params: { groupId: "grp" } }],
    [
      "/groups/grp?tab=members#attention-target",
      "get_group",
      { params: { groupId: "grp" } },
      "members",
    ],
    ["/groups/grp?tab=events", "get_group", { params: { groupId: "grp" } }, "events"],
    ["/groups/grp?tab=leaderboard", "get_group", { params: { groupId: "grp" } }, "rankings"],
    ["/moderation", "list_groups", { query: { scope: "moderation" } }],
    ["/moderation/grp", "get_group_moderation_review", { params: { groupId: "grp" } }],
    ["/tables", "list_table_history", {}],
    ["/community", "list_community_activity", {}],
    ["/community?tab=leaderboard", "list_global_leaderboard", {}],
    ["/contacts", "list_friends", {}],
    ["/contacts?tab=requests", "list_friend_requests", { query: { direction: "incoming" } }],
    ["/notifications", "list_notifications", {}],
    ["/profile", "get_my_profile", {}],
    ["/profiles/user%5Falice", "get_user_profile", { params: { userId: "user_alice" } }],
    [
      "/profiles/user_alice?tab=activity",
      "list_profile_activity",
      { params: { userId: "user_alice" } },
    ],
    ["/profiles/user_alice?tab=games", "list_profile_games", { params: { userId: "user_alice" } }],
  ])(
    "maps %s to the authorized tool and the initial tab, where relevant",
    (path, operation, args, detailTab?: string) => {
      expect(widgetTarget(path)).toEqual({ operation, args, ...(detailTab ? { detailTab } : {}) });
    },
  );

  it.each([
    "/events/new",
    "/invite/abc",
    "/profiles/%E0%A4%A",
    "//elsewhere.example/events",
    "https://boardgamegeek.com",
  ])("leaves %s outside widget navigation", (path) => {
    expect(widgetTarget(path)).toBeUndefined();
  });
});
