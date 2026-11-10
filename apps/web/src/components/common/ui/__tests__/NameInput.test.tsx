import type { NameCategory } from "@board-game-organizer/shared";
import { fireEvent, screen } from "@testing-library/react";
import type { FormEvent } from "react";
import { expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { NameInput } from "../NameInput";

const generate = vi.hoisted(() => vi.fn(() => "Generated draft name"));
vi.mock("@board-game-organizer/shared", async (original) => ({
  ...(await original<typeof import("@board-game-organizer/shared")>()),
  generateName: generate,
}));
it.each<NameCategory>(["tavolo", "evento", "gruppo"])(
  "uses the larger accent action for %s without submitting the form",
  (category) => {
    const onGenerate = vi.fn(),
      submit = vi.fn((event: FormEvent) => event.preventDefault());
    renderWithI18n(
      <form onSubmit={submit}>
        <NameInput category={category} onGenerate={onGenerate} maxLength={10} aria-label="Name" />
      </form>,
    );
    const button = screen.getByRole("button", { name: "Generate a random name" });
    expect(button.className).toContain("button--md");
    expect(button.className).toContain("button--primary");
    expect(button.querySelector("svg")?.classList.contains("size-5")).toBe(true);
    fireEvent.click(button);
    expect(generate).toHaveBeenLastCalledWith(category, "en");
    expect(onGenerate).toHaveBeenCalledWith("Generated ");
    expect(submit).not.toHaveBeenCalled();
  },
);
it("keeps generation disabled with the actual input", () => {
  const onGenerate = vi.fn();
  renderWithI18n(
    <NameInput category="tavolo" onGenerate={onGenerate} isDisabled aria-label="Name" />,
  );
  const button = screen.getByRole("button", { name: "Generate a random name" });
  expect((button as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(button);
  expect(onGenerate).not.toHaveBeenCalled();
  expect((screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement).disabled).toBe(true);
});
