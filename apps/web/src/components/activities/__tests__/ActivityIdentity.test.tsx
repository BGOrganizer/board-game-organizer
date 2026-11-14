import type { ProfileActivity } from "@board-game-organizer/schemas";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { renderWithI18n } from "@/test-utils";
import { messages as en } from "../../../../../../messages/en.js";
import { messages as itMessages } from "../../../../../../messages/it.js";
import { ActivityRow } from "../ActivityRow";

const item: ProfileActivity = {
  id: "row",
  kind: "played",
  occurredAt: "2030-01-01T00:00:00.000Z",
  context: "<Table>",
  href: "/events/event/tables/table",
  author: { id: "viewer", name: "Full name", username: "username", avatarUrl: null },
};
it.each([
  ["en", en, "You played at table <Table>."],
  ["it", itMessages, "Tu hai giocato al tavolo <Table>."],
] as const)(
  "renders localized self narration without self links in %s",
  (locale, messages, sentence) => {
    const i18n = setupI18n({ locale, messages: { [locale]: messages } });
    const view = renderWithI18n(
      <I18nProvider i18n={i18n}>
        <GroupedList>
          <ActivityRow item={item} viewerId="viewer" />
        </GroupedList>
      </I18nProvider>,
    );
    expect(view.container.querySelector("li p")?.textContent).toBe(sentence);
    expect(screen.queryByRole("link", { name: "username" })).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "<Table>" })).toBeTruthy();
  },
);
it("uses the real follower as actor when the viewer is the followee", () => {
  const i18n = setupI18n({ locale: "it", messages: { it: itMessages } });
  const view = renderWithI18n(
    <I18nProvider i18n={i18n}>
      <GroupedList>
        <ActivityRow
          item={{
            ...item,
            kind: "follower",
            context: "Caio",
            href: "/profiles/caio",
            otherUserId: "caio",
          }}
          viewerId="viewer"
        />
      </GroupedList>
    </I18nProvider>,
  );
  expect(view.container.querySelector("li p")?.textContent).toBe("Caio ha iniziato a seguirti.");
  expect(screen.getAllByRole("link")).toHaveLength(1);
});
