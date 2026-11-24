import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { render, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { messages } from "../../../../../../messages/en.js";
import { LeaderboardView } from "../LeaderboardView";

it("renders the desktop ranking structure for a server-rendered read-only widget", () => {
  const i18n = setupI18n({ locale: "en", messages: { en: messages } });
  const html = renderToString(
    <I18nProvider i18n={i18n}>
      <LeaderboardView
        gameId={1}
        players={{
          items: [
            {
              userId: "viewer",
              name: "Account name",
              username: "sable",
              avatarUrl: null,
              position: 1,
              gamesPlayed: 3,
              gamesWon: 2,
              nd: 0,
              rating: 510,
              provisional: false,
            },
          ],
          isPending: false,
          isError: false,
          hasNextPage: false,
          isFetchingNextPage: false,
          onRetry: vi.fn(),
          onMore: vi.fn(),
        }}
      />
    </I18nProvider>,
  );
  const result = render(<div />);
  const documentContent = new DOMParser().parseFromString(html, "text/html");
  for (const child of [...documentContent.body.children]) result.container.appendChild(child);
  const table = within(result.container).getByRole("grid", { name: "Rankings" });
  expect(table).toBeVisible();
  expect(within(table).getByRole("columnheader", { name: "Played" })).toBeVisible();
  expect(within(table).getByText("@sable")).toBeVisible();
  expect(within(table).queryByText("Account name")).toBeNull();
});
