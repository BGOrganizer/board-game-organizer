import type { NameCategory } from "@board-game-organizer/shared";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { fireEvent, screen } from "@testing-library/react";
import type { FormEvent } from "react";
import { expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { messages as italian } from "../../../../../../../messages/it.js";
import { NameInput } from "../NameInput";

const generate = vi.hoisted(() => vi.fn(() => "Generated draft name"));
vi.mock("@board-game-organizer/shared", async (original) => ({
  ...(await original<typeof import("@board-game-organizer/shared")>()),
  generateName: generate,
}));
it.each<NameCategory>(["tavolo", "evento", "gruppo"])(
  "uses a compact ghost action with an unchanged accent icon for %s without submitting",
  (category) => {
    const onGenerate = vi.fn(),
      submit = vi.fn((event: FormEvent) => event.preventDefault());
    renderWithI18n(
      <form onSubmit={submit}>
        <NameInput category={category} onGenerate={onGenerate} maxLength={10} aria-label="Name" />
      </form>,
    );
    const button = screen.getByRole("button", { name: "Generate a random name" });
    expect(button.className).toContain("button--sm");
    expect(button.className).toContain("button--ghost");
    expect(button.querySelector("svg")?.classList.contains("text-accent")).toBe(true);
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
  expect(screen.getByRole("textbox", { name: "Name" }).getAttribute("minlength")).toBe("5");
  expect(screen.getByRole("textbox", { name: "Name" }).getAttribute("maxlength")).toBe("30");
});
it("generates the active Italian name within the default thirty-character input limit", () => {
  const onGenerate = vi.fn();
  renderWithI18n(
    <I18nProvider i18n={setupI18n({ locale: "it", messages: { it: italian } })}>
      <NameInput category="evento" onGenerate={onGenerate} aria-label="Name" />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Genera un nome casuale" }));
  expect(generate).toHaveBeenLastCalledWith("evento", "it");
  expect(onGenerate).toHaveBeenCalledWith("Generated draft name");
});
