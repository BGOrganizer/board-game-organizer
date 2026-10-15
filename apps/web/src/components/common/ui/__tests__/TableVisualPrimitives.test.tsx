import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { expect, it } from "vitest";
import { GameListRow } from "@/components/games/GameListRow";
import { LocationListRow } from "@/components/locations/LocationListRow";
import { MatchPlayerLimits } from "@/components/matches/MatchPlayerLimits";
import { messages } from "../../../../../../../messages/en.js";

function renderWithI18n(ui: ReactElement) {
  const i18n = setupI18n({ locale: "en", messages: { en: messages } });
  return render(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <I18nProvider i18n={i18n}>{children}</I18nProvider>
    ),
  });
}

import { AnimatedDicebearArtwork } from "../AnimatedDicebearArtwork";
import { DateTimeInfo } from "../DateTimeInfo";

it("generates local SVG artwork for all four styles, retaining ordinary match hooks", () => {
  for (const variant of ["landscape", "planets", "shapes", "waves"] as const) {
    const view = renderWithI18n(<AnimatedDicebearArtwork seed="Same title" variant={variant} />);
    const image = view.container.querySelector("img");
    const initialSrc = image?.getAttribute("src");
    expect(image?.getAttribute("src")).toMatch(/^data:image\/svg\+xml,/);
    expect(decodeURIComponent(image?.getAttribute("src") ?? "")).toContain("<svg");
    expect(image?.alt).toBe("");
    expect(image?.parentElement?.getAttribute("aria-hidden")).toBe("true");
    expect(image?.classList.contains("match-waves")).toBe(variant === "waves");
    expect(image?.classList.contains("table-shapes")).toBe(variant === "shapes");
    view.rerender(<AnimatedDicebearArtwork seed="Another title" variant={variant} size={80} />);
    expect(view.container.querySelector("img")?.width).toBe(88);
    expect(view.container.querySelector("img")?.getAttribute("src")).not.toBe(initialSrc);
    view.unmount();
  }
});
it("labels the start/end times, uses the event's zone/day, and omits absent end times", () => {
  const view = renderWithI18n(
    <DateTimeInfo
      startsAt="2030-06-12T22:00:00Z"
      endsAt="2030-06-12T23:00:00Z"
      timeZone="Europe/Rome"
    />,
  );
  const rows = view.container.querySelectorAll("time");
  expect(rows[0].textContent).toBe("06/13/30");
  expect(rows[1].textContent).toMatch(/12:00 AM/);
  expect(rows[2].textContent).toMatch(/1:00 AM/);
  expect(screen.getByText("Start time:")).toBeTruthy();
  expect(screen.getByText("End time:")).toBeTruthy();
  view.rerender(<DateTimeInfo startsAt="2030-06-12T22:00:00Z" />);
  expect(view.container.querySelectorAll("time")).toHaveLength(2);
  expect(screen.queryByText("End time:")).toBeNull();
});
it("reuses game cover/metadata/content/actions, with a decorative fallback", () => {
  let acted = false;
  const view = renderWithI18n(
    <GameListRow
      name="Azul"
      imageUrl="https://example.test/cover"
      year={2017}
      average={7.8}
      rank={85}
      actions={
        <button
          type="button"
          onClick={() => {
            acted = true;
          }}
        >
          Vote
        </button>
      }
    >
      <span>Existing votes</span>
    </GameListRow>,
  );
  expect(screen.getByText("Azul").getAttribute("title")).toBe("Azul");
  expect(view.container.querySelector("img")?.src).toBe("https://example.test/cover");
  expect(screen.getByRole("img", { name: "Average: 7.80" })).toBeTruthy();
  expect(screen.getByRole("img", { name: "Rank: 85" })).toBeTruthy();
  expect(screen.getByText("Existing votes")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Vote" }));
  expect(acted).toBe(true);
  view.rerender(<GameListRow name="No cover" />);
  expect(view.container.querySelector("img")).toBeNull();
  expect(view.container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
});
it("reuses venue/address rows and optional voting/favorite content without hiding either", () => {
  const view = renderWithI18n(<LocationListRow name="Club" address="Via Roma, Milano" />);
  expect(screen.getByText("Club").getAttribute("title")).toBe("Club");
  expect(screen.getByText("Via Roma, Milano").getAttribute("title")).toBe("Via Roma, Milano");
  view.rerender(
    <LocationListRow
      name="Club"
      address="Via Roma, Milano"
      leading={<span>Favorite</span>}
      actions={<button type="button">Vote</button>}
    />,
  );
  expect(screen.getByText("Favorite")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Vote" })).toBeTruthy();
});
it("shows identical participant limits for ordinary matches and tables", () => {
  renderWithI18n(<MatchPlayerLimits minPlayers={2} maxPlayers={6} />);
  expect(screen.getByText("Minimum players").parentElement?.textContent).toBe("Minimum players2");
  expect(screen.getByText("Maximum players").parentElement?.textContent).toBe("Maximum players6");
});
