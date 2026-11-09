import type { FavoriteLocationsState } from "@board-game-organizer/shared";
import { fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { GameListRow } from "@/components/games/GameListRow";
import { LocationFavoriteButton } from "@/components/locations/LocationFavoriteButton";
import { plannedEvent } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { AnimatedDicebearArtwork } from "../AnimatedDicebearArtwork";
import { DateTimeInfo } from "../DateTimeInfo";

it("keeps generated artwork motion variants and default/explicit dimensions", () => {
  for (const variant of ["landscape", "planets", "constellation", "waves", "shapes"] as const) {
    const q = renderWithI18n(
        <AnimatedDicebearArtwork
          seed="A group"
          variant={variant}
          size={variant === "landscape" ? undefined : 48}
        />,
      ),
      img = q.container.querySelector("img");
    expect(img?.getAttribute("src")).toMatch(/^data:image\/svg\+xml,/);
    expect(img?.getAttribute("width")).toBe(variant === "landscape" ? "72" : "56");
    expect(img?.className).toContain(
      variant === "waves"
        ? "match-waves"
        : variant === "shapes"
          ? "table-shapes"
          : "dicebear-artwork",
    );
    q.unmount();
  }
});
it.each(["planets", "constellation", "landscape"] as const)(
  "preserves complete %s illustration and its original colored sky on the Card surface",
  (variant) => {
    const q = renderWithI18n(
      <AnimatedDicebearArtwork seed="stable" variant={variant} presentation="cover" />,
    );
    const image = q.container.querySelector("img");
    expect(image?.className).toContain("object-contain p-1");
    expect(image?.className).not.toContain("object-cover");
    expect(image?.parentElement?.className).not.toContain("bg-accent/10");
    const svg = () =>
      new DOMParser().parseFromString(
        decodeURIComponent(
          q.container.querySelector("img")?.getAttribute("src")?.split(",")[1] ?? "",
        ),
        "image/svg+xml",
      );
    expect(svg().querySelector("rect[fill]")).not.toBeNull();
    const cover = image?.getAttribute("src");
    q.rerender(
      <AnimatedDicebearArtwork seed="stable" variant={variant} presentation="background" />,
    );
    expect(q.container.querySelector("img")?.className).toContain("object-cover");
    expect(svg().querySelector("rect[fill]")).not.toBeNull();
    expect(q.container.querySelector("img")?.getAttribute("src")).toBe(cover);
  },
);
it("formats accessible date/start/end metadata in the explicit event zone", () => {
  const q = renderWithI18n(<DateTimeInfo startsAt="2030-06-03T18:00:00Z" />);
  expect(q.container.querySelectorAll("time")).toHaveLength(2);
  q.rerender(
    <DateTimeInfo
      startsAt="2030-06-03T18:00:00Z"
      endsAt="2030-06-04T01:00:00Z"
      timeZone="Europe/Rome"
    />,
  );
  expect(q.container.querySelectorAll("time")).toHaveLength(3);
  expect(screen.getByText("End time:")).not.toBeNull();
});
it("shows discovered game covers without losing metadata", () => {
  const q = renderWithI18n(
    <GameListRow
      name="Chess"
      imageUrl="https://example.test/chess.jpg"
      year={2000}
      average={7}
      rank={1}
    />,
  );
  expect(q.container.querySelector("img")?.getAttribute("src")).toBe(
    "https://example.test/chess.jpg",
  );
});
it("keeps favorite actions explicit and disables only pending/uncached errors", () => {
  const mutate = vi.fn(),
    location = plannedEvent.locations[0];
  const state = (favorite: boolean, pending = false, error = false, cached = false) =>
    ({
      isFavorite: () => favorite,
      isBusy: () => pending,
      toggle: { isPending: pending, mutate },
      status: { isPending: false, isError: error, data: cached ? {} : undefined },
    }) as unknown as FavoriteLocationsState;
  const q = renderWithI18n(<LocationFavoriteButton location={location} favorites={state(false)} />);
  fireEvent.click(screen.getByRole("button", { name: "Add location to favorites" }));
  expect(mutate).toHaveBeenCalledWith({ location, favorite: false, matchId: undefined });
  q.rerender(<LocationFavoriteButton location={location} favorites={state(true, true)} />);
  expect(
    (screen.getByRole("button", { name: "Remove location from favorites" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  q.rerender(<LocationFavoriteButton location={location} favorites={state(true, false, true)} />);
  expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  q.rerender(
    <LocationFavoriteButton location={location} favorites={state(true, false, true, true)} />,
  );
  expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(false);
});
