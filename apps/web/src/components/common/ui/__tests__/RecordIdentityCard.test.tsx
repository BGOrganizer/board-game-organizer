import { screen } from "@testing-library/react";
import { Dices } from "lucide-react";
import { expect, it } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { RecordIdentityCard } from "../RecordIdentityCard";

it("keeps the resource notification action in the title band, separate from card actions", () => {
  renderWithI18n(
    <RecordIdentityCard
      title="Owned resource"
      icon={Dices}
      background={null}
      titleAction={<button type="button">Resource notices</button>}
    >
      <button type="button">Edit resource</button>
    </RecordIdentityCard>,
  );
  const band = screen.getByRole("heading", { name: "Owned resource" }).parentElement;
  expect(band?.contains(screen.getByRole("button", { name: "Resource notices" }))).toBe(true);
  expect(band?.contains(screen.getByRole("button", { name: "Edit resource" }))).toBe(false);
});

it.each([undefined, "h2"] as const)(
  "keeps the complete title in a top-left semantic band and controls bottom-right (%s)",
  (heading) => {
    const title = "A full multiline title with no truncation ".repeat(10);
    const view = renderWithI18n(
      <RecordIdentityCard
        title={title}
        heading={heading}
        icon={Dices}
        background={<span>Artwork</span>}
        titleAccessory={<span>Title information</span>}
      >
        <button type="button">Admin</button>
        <button type="button">Accepted participant</button>
      </RecordIdentityCard>,
    );
    const label = screen.getByRole("heading", { name: title.trim(), level: heading ? 2 : 1 });
    const band = label.parentElement;
    const content = band?.parentElement;
    const row = screen.getByRole("button", { name: "Admin" }).parentElement;
    const controls = row?.parentElement;
    expect(band?.className).toContain("dark");
    expect(band?.className).toContain("bg-background/80");
    expect(band?.className).toContain("w-full");
    expect(band?.className).toContain("items-start");
    expect(band?.textContent).toContain(title);
    expect(label.className).not.toMatch(/shadow|truncate|line-clamp/u);
    expect(label.className).toContain("[overflow-wrap:anywhere]");
    expect(content?.firstElementChild).toBe(band);
    expect(content?.lastElementChild).toBe(controls);
    expect(content?.className).toContain("grow");
    expect(controls?.className).toContain("mt-auto");
    expect(controls?.className).toContain("overflow-x-auto");
    expect(row?.className).toContain("justify-end");
    expect(row?.className).toContain("flex-nowrap");
    expect(row?.className).toContain("[&>*]:shrink-0");
    expect(controls?.className).not.toContain("absolute");
    expect(controls?.contains(screen.getByRole("button", { name: "Accepted participant" }))).toBe(
      true,
    );
    const card = label.closest(".card");
    expect(card?.contains(controls ?? null)).toBe(true);
    expect(card?.className).toContain("overflow-hidden");
    expect(view.container.querySelector("[class*='gradient']")).toBeNull();
    expect(view.container.querySelector("[class*='mask-image']")).toBeNull();
  },
);
