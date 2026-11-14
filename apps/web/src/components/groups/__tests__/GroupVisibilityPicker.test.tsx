import { fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { GroupVisibilityPicker } from "../GroupVisibilityPicker";

it("shows two labelled radio Cards, with the selected secondary surface and semantic border", () => {
  const onChange = vi.fn();
  const q = renderWithI18n(
    <GroupVisibilityPicker value="PRIVATE" disabled={false} onChange={onChange} />,
  );
  const privateChoice = screen.getByRole("radio", { name: "Private" });
  const publicChoice = screen.getByRole("radio", { name: "Public" });
  expect((privateChoice as HTMLInputElement).checked).toBe(true);
  expect(privateChoice.closest(".card")?.className).toContain("card--secondary");
  expect(privateChoice.closest(".card")?.className).toContain("border-accent");
  expect(privateChoice.closest(".card")?.querySelector("svg.lucide-lock-keyhole")).not.toBeNull();
  expect(publicChoice.closest(".card")?.querySelector("svg.lucide-globe")).not.toBeNull();
  fireEvent.click(publicChoice);
  expect(onChange).toHaveBeenCalledWith("PUBLIC");
  q.rerender(<GroupVisibilityPicker value="PUBLIC" disabled={false} onChange={onChange} />);
  expect((screen.getByRole("radio", { name: "Public" }) as HTMLInputElement).checked).toBe(true);
  expect(screen.getByRole("radio", { name: "Public" }).closest(".card")?.className).toContain(
    "card--secondary",
  );
  fireEvent.click(screen.getByRole("radio", { name: "Private" }));
  expect(onChange).toHaveBeenLastCalledWith("PRIVATE");
});
it("explains invitation-only privacy and registered-user public discovery in help", async () => {
  renderWithI18n(<GroupVisibilityPicker value="PRIVATE" disabled={false} onChange={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Group visibility: Field help" }));
  expect(
    await screen.findByText(
      "Private groups are invitation-only. Public groups are searchable and visible to all registered users after approval.",
    ),
  ).not.toBeNull();
});
it("keeps both choices disabled while submitting", () => {
  const onChange = vi.fn();
  renderWithI18n(<GroupVisibilityPicker value="PRIVATE" disabled onChange={onChange} />);
  for (const radio of screen.getAllByRole("radio")) {
    expect((radio as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(radio);
  }
  expect(onChange).not.toHaveBeenCalled();
});
