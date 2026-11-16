import { createResourceArtwork } from "@board-game-organizer/shared/artwork";
import { fireEvent, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { groupRecord } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { GroupArtwork } from "../GroupArtwork";

it.each(["thumbnail", "cover", "background"] as const)(
  "keeps a valid custom logo ahead of generated %s artwork without recoloring or cropping",
  (presentation) => {
    const group = { ...groupRecord, logo: "data:image/png;base64,approved-logo" };
    const view = renderWithI18n(
      <GroupArtwork group={group} size={96} presentation={presentation} status="none" />,
    );
    const image = view.container.querySelector("img")!;
    expect(image.getAttribute("src")).toBe(group.logo);
    expect(image.className).toContain("object-contain");
    expect(image.closest('[data-theme="light"]')).toBeNull();
    expect(image.style.maxWidth).toBe(presentation === "cover" ? "calc(100% - 8px)" : "100%");
    expect(view.container.querySelector('[data-slot="resource-artwork"]')).toBeNull();
    expect(view.container.querySelector('[role="img"]')).toBeNull();
  },
);
it.each([
  ["admin", "Group admin"],
  ["invited", "Invitation received"],
  ["requested", "Membership requested"],
] as const)("preserves the %s overlay beside generated fallback", (role, label) => {
  const group = { ...groupRecord, logo: null, role };
  const view = renderWithI18n(<GroupArtwork group={group} />);
  expect(view.container.querySelector("img")?.getAttribute("src")).toBe(
    `data:image/svg+xml,${encodeURIComponent(createResourceArtwork("groups", group.id).svg)}`,
  );
  expect(screen.getByRole("img", { name: label }).closest('[data-theme="light"]')).toBeNull();
  const frame = view.container.firstElementChild as HTMLElement;
  expect([frame.style.width, frame.style.height]).toEqual(["64px", "64px"]);
});
it("uses the same resource fallback for absent or failed logos and isolates delayed image errors", () => {
  const group = { ...groupRecord, role: "none" as const, logo: "data:image/png;base64,broken" };
  const view = renderWithI18n(<GroupArtwork group={group} />);
  const oldImage = view.container.querySelector("img")!;
  const replacement = "data:image/png;base64,replacement";
  view.rerender(<GroupArtwork group={{ ...group, logo: replacement }} />);
  expect(view.container.querySelector("img")).not.toBe(oldImage);
  fireEvent.error(oldImage);
  expect(view.container.querySelector("img")?.getAttribute("src")).toBe(replacement);
  fireEvent.error(view.container.querySelector("img")!);
  expect(view.container.querySelector("img")?.getAttribute("src")).toBe(
    `data:image/svg+xml,${encodeURIComponent(createResourceArtwork("groups", group.id).svg)}`,
  );
  view.rerender(<GroupArtwork group={{ ...group, logo: group.logo }} />);
  fireEvent.error(oldImage);
  expect(view.container.querySelector("img")?.getAttribute("src")).toBe(group.logo);
  view.rerender(<GroupArtwork group={{ ...group, logo: null }} />);
  expect(view.container.querySelector('[data-artwork-kind="groups"]')).not.toBeNull();
});
