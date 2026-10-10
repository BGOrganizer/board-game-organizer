import { Button, Label } from "@heroui/react";
import { fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { SearchHelpLabel } from "../SearchHelpLabel";
import { SearchInput } from "../SearchInput";

it("forwards field attributes, changes immediately, clears, and retains an independent trailing action", () => {
  const change = vi.fn();
  const locate = vi.fn();
  function Harness() {
    const [value, setValue] = useState("");
    return (
      <SearchInput
        value={value}
        onChange={(next) => {
          setValue(next);
          change(next);
        }}
        name="location-query"
        label={<Label htmlFor="address-query">Address</Label>}
        placeholder="Search address"
        inputProps={{ id: "address-query", name: "address", autoComplete: "off", maxLength: 120 }}
      >
        <Button slot={null} aria-label="Locate" onPress={locate}>
          Locate
        </Button>
      </SearchInput>
    );
  }
  renderWithI18n(<Harness />);
  const input = screen.getByRole("searchbox", { name: "Address" }) as HTMLInputElement;
  expect(input.placeholder).toBe("Search address");
  expect(input.name).toBe("address");
  expect(input.maxLength).toBe(120);
  expect(input.autocomplete).toBe("off");
  expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
  fireEvent.change(input, { target: { value: "a" } });
  expect(change).toHaveBeenLastCalledWith("a");
  expect(input.value).toBe("a");
  fireEvent.click(screen.getByRole("button", { name: "Locate" }));
  expect(locate).toHaveBeenCalledOnce();
  expect(input.value).toBe("a");
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  expect(change).toHaveBeenLastCalledWith("");
  expect(input.value).toBe("");
  expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
});

it("opening help inside the field does not inherit the clear-button action", () => {
  const change = vi.fn();
  renderWithI18n(
    <SearchInput
      value="Cascadia"
      onChange={change}
      placeholder="Search board games"
      label={<SearchHelpLabel label="Games" help="Type at least 4 characters to search" />}
    />,
  );
  const input = screen.getByRole("searchbox", { name: "Games" }) as HTMLInputElement;
  fireEvent.click(screen.getByRole("button", { name: "Games: Search help" }));
  expect(screen.getByText("Type at least 4 characters to search")).toBeTruthy();
  expect(change).not.toHaveBeenCalled();
  expect(input.value).toBe("Cascadia");
});

it("does not impose a query length limit or threshold on local pickers", () => {
  renderWithI18n(
    <SearchInput
      value="I"
      onChange={vi.fn()}
      label={<Label>Countries</Label>}
      placeholder="Search countries"
    />,
  );
  const input = screen.getByRole("searchbox", { name: "Countries" }) as HTMLInputElement;
  expect(input.getAttribute("maxlength")).toBeNull();
  expect(input.value).toBe("I");
  expect(screen.queryByText("Enter at least 4 characters to search")).toBeNull();
});
