import type { FavoriteLocationsState } from "@board-game-organizer/shared";
import {
  createResourceArtwork,
  type ResourceArtworkKind,
} from "@board-game-organizer/shared/artwork";
import { act, fireEvent, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { GameListRow } from "@/components/games/GameListRow";
import { LocationFavoriteButton } from "@/components/locations/LocationFavoriteButton";
import { plannedEvent } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { AnimatedDicebearArtwork } from "../AnimatedDicebearArtwork";
import { DateTimeInfo } from "../DateTimeInfo";

it("renders motion-free server artwork and responds to the system motion preference", () => {
  expect(renderToString(<AnimatedDicebearArtwork seed="ssr" variant="events" />)).toContain(
    encodeURIComponent(createResourceArtwork("events", "ssr", "none").svg),
  );
  const previous = window.matchMedia;
  let matches = true;
  let change = () => {};
  const remove = vi.fn();
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches,
    addEventListener: (_: string, listener: () => void) => {
      change = listener;
    },
    removeEventListener: remove,
  }));
  try {
    const view = renderWithI18n(<AnimatedDicebearArtwork seed="system" variant="tables" />);
    const source = () => view.container.querySelector("img")?.getAttribute("src");
    expect(source()).toBe(
      `data:image/svg+xml,${encodeURIComponent(createResourceArtwork("tables", "system", "none").svg)}`,
    );
    act(() => {
      matches = false;
      change();
    });
    expect(source()).toBe(
      `data:image/svg+xml,${encodeURIComponent(createResourceArtwork("tables", "system").svg)}`,
    );
    act(() => {
      matches = true;
      change();
    });
    expect(source()).toBe(
      `data:image/svg+xml,${encodeURIComponent(createResourceArtwork("tables", "system", "none").svg)}`,
    );
    view.unmount();
    expect(remove).toHaveBeenCalledWith("change", change);
  } finally {
    window.matchMedia = previous;
  }
});

it.each(["events", "tables", "groups"] as const)(
  "uses the approved %s drawing, palette and embedded motion at real frame sizes",
  (variant) => {
    for (const size of [40, 64, 96]) {
      const view = renderWithI18n(
        <AnimatedDicebearArtwork seed="resource-id" variant={variant} size={size} />,
      );
      const image = view.container.querySelector("img")!;
      const frame = image.parentElement!;
      expect(image.getAttribute("src")).toBe(
        `data:image/svg+xml,${encodeURIComponent(createResourceArtwork(variant, "resource-id").svg)}`,
      );
      expect([image.width, image.height]).toEqual([240, 240]);
      expect(image.className).toContain("object-contain");
      expect(image.className).not.toContain("object-cover");
      expect(image.getAttribute("loading")).toBe("lazy");
      expect(image.getAttribute("decoding")).toBe("async");
      expect(frame.getAttribute("data-theme")).toBe("light");
      expect(frame.getAttribute("data-artwork-kind")).toBe(variant);
      expect(frame.getAttribute("aria-hidden")).toBe("true");
      expect([frame.style.width, frame.style.height]).toEqual([`${size}px`, `${size}px`]);
      expect(frame.className).toContain("bg-surface");
      expect(frame.className).not.toContain("bg-accent/10");
      const svg = new DOMParser().parseFromString(
        decodeURIComponent(image.src.split(",")[1]),
        "image/svg+xml",
      );
      expect(svg.documentElement.getAttribute("viewBox")).toBe("0 0 240 240");
      expect(svg.querySelector("style")?.textContent).toContain(
        "prefers-reduced-motion: no-preference",
      );
      view.unmount();
    }
  },
);
it.each(["cover", "background", "thumbnail"] as const)(
  "keeps the complete illustration and resource seed in %s composition",
  (presentation) => {
    const view = renderWithI18n(
      <AnimatedDicebearArtwork seed="same-resource" variant="events" presentation={presentation} />,
    );
    const image = view.container.querySelector("img")!;
    const src = image.getAttribute("src");
    expect(image.className).toContain("object-contain");
    expect(image.className).not.toMatch(/object-cover|(?:top|left)-/);
    expect(image.className.includes("p-1")).toBe(presentation === "cover");
    expect(image.parentElement?.className.includes("absolute inset-0")).toBe(
      presentation !== "thumbnail",
    );
    expect(image.parentElement?.style.width).toBe(presentation === "thumbnail" ? "64px" : "");
    view.rerender(
      <AnimatedDicebearArtwork
        seed="same-resource"
        variant="events"
        presentation={presentation}
        size={96}
      />,
    );
    expect(view.container.querySelector("img")?.getAttribute("src")).toBe(src);
    for (const variant of ["tables", "groups"] satisfies ResourceArtworkKind[]) {
      view.rerender(
        <AnimatedDicebearArtwork
          seed="other-resource"
          variant={variant}
          presentation={presentation}
        />,
      );
      expect(view.container.querySelector("img")?.getAttribute("src")).toBe(
        `data:image/svg+xml,${encodeURIComponent(createResourceArtwork(variant, "other-resource").svg)}`,
      );
    }
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
