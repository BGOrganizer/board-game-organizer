import { SearchField } from "@heroui/react";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SearchHelpLabel } from "@/components/SearchHelpLabel";
import { renderWithI18n } from "@/test-utils";

describe("SearchHelpLabel", () => {
  it("labels search and shows full, wrapping instructions on demand", () => {
    renderWithI18n(
      <SearchField>
        <SearchHelpLabel label="Search matches" help="Type at least 4 characters to search" />
        <SearchField.Group>
          <SearchField.Input placeholder="Search matches" />
        </SearchField.Group>
      </SearchField>,
    );
    expect(screen.getByRole("searchbox", { name: "Search matches" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Search matches: Search help" }));
    const help = screen.getByText("Type at least 4 characters to search");
    expect(help.closest("[class*=whitespace-normal]")).toBeTruthy();
  });
});
