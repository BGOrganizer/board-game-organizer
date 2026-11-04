import type { ActivityAuthor, ProfileActivity } from "@board-game-organizer/schemas";
import { setupI18n } from "@lingui/core";
import { expect, it } from "vitest";
import { messages as en } from "../../../../../messages/en.js";
import { messages as itMessages } from "../../../../../messages/it.js";
import { activityNarrative } from "../activityNarrative";

const author: ActivityAuthor = { id: "subject", name: "Name", username: "alice", avatarUrl: null };
const base: ProfileActivity = {
  id: "row",
  kind: "played",
  occurredAt: "2030-06-03T12:00:00.000Z",
  context: "PincoPallo",
  href: "/tables/table",
  author,
};
it.each([
  ["played", "played at table", "ha giocato al tavolo"],
  ["friendship", "became friends with", "ha stretto amicizia con"],
  ["table_join", "joined table", "si è unito al tavolo"],
  ["event_join", "joined event", "si è unito all'evento"],
  ["group_join", "is now part of group", "fa ora parte del gruppo"],
  ["follower", "started following", "ha iniziato a seguire"],
] as const)(
  "localizes complete %s sentences with correctly directed linked identities",
  (kind, english, italian) => {
    const story = activityNarrative({ ...base, kind }, undefined, "Unknown", "Missing");
    for (const [locale, messages, phrase] of [
      ["en", en, english],
      ["it", itMessages, italian],
    ] as const) {
      const i18n = setupI18n({ locale, messages: { [locale]: messages } });
      const text = i18n._(story.id, { actor: story.actor.name, target: story.target.name });
      expect(text).toContain(phrase);
      expect(text).toContain("<actor/>");
      expect(story.actor.name).toBe(kind === "follower" ? "PincoPallo" : "alice");
    }
    expect(story.actor.href).toBe(kind === "follower" ? base.href : "/profiles/subject");
    expect(story.target.href).toBe(kind === "follower" ? "/profiles/subject" : base.href);
  },
);
it("retains wins and truthful milestone plurals without inventing missing counts", () => {
  expect(activityNarrative({ ...base, outcome: "won" }, author, "?", "?").id).toContain(
    "played and won",
  );
  for (const count of [1, 5, undefined]) {
    const story = activityNarrative(
      { ...base, kind: "milestone", milestone: count },
      author,
      "?",
      "?",
    );
    for (const [locale, messages] of [
      ["en", en],
      ["it", itMessages],
    ] as const) {
      const text = setupI18n({ locale, messages: { [locale]: messages } })._(story.id, {
        actor: story.actor.name,
        target: story.target.name,
        count: story.count,
      });
      expect(text).toContain(
        count === undefined ? (locale === "it" ? "traguardo" : "milestone") : String(count),
      );
      if (count === 1) expect(text).toContain(locale === "it" ? "1 vittoria" : "1 victory");
      if (count === 5) expect(text).toContain(locale === "it" ? "5 vittorie" : "5 victories");
    }
  }
});
it("uses canonical/cached subject fallbacks and never fabricates a missing link", () => {
  expect(activityNarrative(base, { ...author, id: "x/y", username: null }, "?", "?").actor).toEqual(
    { name: "Name", href: "/profiles/x%2Fy" },
  );
  expect(
    activityNarrative({ ...base, author: undefined }, undefined, "Unknown", "Missing").actor,
  ).toEqual({ name: "Unknown", href: null });
  expect(
    activityNarrative(base, { ...author, username: null, name: "" }, "Unknown", "Missing").actor
      .name,
  ).toBe("Unknown");
  for (const kind of ["played", "friendship", "follower"] as const) {
    const story = activityNarrative(
      { ...base, kind, context: null, href: null },
      author,
      "Unknown",
      "Missing",
    );
    const missing = kind === "follower" ? story.actor : story.target;
    expect(missing).toEqual({ name: kind === "played" ? "Missing" : "Unknown", href: null });
  }
});
