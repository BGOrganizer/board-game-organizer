import { describe, expect, it } from "vitest";
import { widgetTarget } from "./widgetRoutes";

describe("BGO widget destinations", () => {
  it.each([
    ["/events/", "list_events", {}],
    ["/events/event?fromGroup=group", "get_event", { params: { eventId: "event" } }],
    ["/events/event?tab=tables", "list_event_tables", { params: { eventId: "event" } }],
    ["/events/event?tab=participants", "list_event_participants", { params: { eventId: "event" } }],
    [
      "/events/event/tables/table?fromEvent=event",
      "get_table",
      { params: { eventId: "event", tableId: "table" } },
    ],
    [
      "/events/event/tables/table/results",
      "get_table",
      { params: { eventId: "event", tableId: "table" } },
    ],
    [
      "/events/event/tables/table?tab=participants",
      "list_table_seats",
      { params: { eventId: "event", tableId: "table" } },
    ],
    ["/groups", "list_groups", {}],
    ["/groups/new", "prepare_group_creation", {}],
    ["/groups/grp", "get_group", { params: { groupId: "grp" } }],
    [
      "/groups/grp?tab=members#attention-target",
      "list_group_members",
      { params: { groupId: "grp" } },
    ],
    ["/groups/grp?tab=events", "list_events", { query: { groupId: "grp" } }],
    ["/groups/grp?tab=leaderboard", "list_group_leaderboard", { params: { groupId: "grp" } }],
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
  ])("maps %s to the authorized tool and arguments", (path, operation, args) => {
    expect(widgetTarget(path)).toEqual({ operation, args });
  });

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
