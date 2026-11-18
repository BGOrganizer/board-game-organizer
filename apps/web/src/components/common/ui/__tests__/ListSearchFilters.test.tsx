import type { ListRole } from "@board-game-organizer/shared";
import { fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { ListSearchFilters } from "../ListSearchFilters";

function RoleSearch() {
  const [query, setQuery] = useState("");
  const [roles, setRoles] = useState<ListRole[]>(["admin"]);
  return (
    <ListSearchFilters
      query={query}
      onQueryChange={setQuery}
      roles={roles}
      onToggle={(role) =>
        setRoles((previous) =>
          previous.includes(role)
            ? previous.filter((selected) => selected !== role)
            : [...previous, role],
        )
      }
      label="Find members"
      placeholder="Member name"
    />
  );
}

it("controls all three role filters independently and preserves the selected role identities", () => {
  renderWithI18n(<RoleSearch />);
  const admin = screen.getByRole("button", { name: "Admin" });
  const invited = screen.getByRole("button", { name: "Invited" });
  const accepted = screen.getByRole("button", { name: "Accepted" });
  expect(admin.getAttribute("aria-pressed")).toBe("true");
  expect(invited.getAttribute("aria-pressed")).toBe("false");
  expect(accepted.getAttribute("aria-pressed")).toBe("false");
  fireEvent.click(invited);
  fireEvent.click(accepted);
  expect(invited.getAttribute("aria-pressed")).toBe("true");
  expect(accepted.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(admin);
  expect(admin.getAttribute("aria-pressed")).toBe("false");
  expect(invited.getAttribute("aria-pressed")).toBe("true");
  expect(accepted.getAttribute("aria-pressed")).toBe("true");
});

it("keeps labeled discovery input, minimum-length guidance, clear action and live controlled props", async () => {
  const change = vi.fn();
  const toggle = vi.fn();
  const view = renderWithI18n(
    <ListSearchFilters
      query="abc"
      onQueryChange={change}
      roles={[]}
      onToggle={toggle}
      label="Find members"
      placeholder="Member name"
    />,
  );
  const input = screen.getByRole("searchbox", { name: "Find members" });
  expect(input.getAttribute("placeholder")).toBe("Member name");
  expect(screen.getByText("Enter at least 4 characters to search")).toBeTruthy();
  fireEvent.change(input, { target: { value: "alice" } });
  expect(change).toHaveBeenCalledWith("alice");
  fireEvent.click(screen.getByRole("button", { name: "Accepted" }));
  expect(toggle).toHaveBeenCalledWith("accepted");
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  expect(change).toHaveBeenLastCalledWith("");
  view.rerender(
    <ListSearchFilters
      query="alice"
      onQueryChange={change}
      roles={["invited"]}
      onToggle={toggle}
      label="Find members"
      placeholder="Member name"
    />,
  );
  expect((input as HTMLInputElement).value).toBe("alice");
  expect(screen.queryByText("Enter at least 4 characters to search")).toBeNull();
  expect(screen.getByRole("button", { name: "Invited" }).getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Find members: Search help" }));
  expect(await screen.findByText("Type at least 4 characters to search")).toBeTruthy();
});
