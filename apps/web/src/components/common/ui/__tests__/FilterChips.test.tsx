import { fireEvent, screen } from "@testing-library/react";
import { LibraryBig, Search } from "lucide-react";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { FilterChips } from "../FilterChips";

it("reflects controlled selection, uses semantic variants and forwards each toggle", () => {
  const toggle = vi.fn();
  function Harness() {
    const [selected, setSelected] = useState<string[]>(["search"]);
    return (
      <FilterChips
        options={[
          { key: "search", label: "Search", icon: Search },
          { key: "collection", label: "Collection", icon: LibraryBig },
        ]}
        selected={selected}
        onToggle={(key) => {
          toggle(key);
          setSelected((previous) =>
            previous.includes(key) ? previous.filter((item) => item !== key) : [...previous, key],
          );
        }}
      />
    );
  }
  renderWithI18n(<Harness />);
  const search = screen.getByRole("button", { name: "Search", pressed: true });
  const collection = screen.getByRole("button", { name: "Collection", pressed: false });
  expect(search.className).toContain("button--primary");
  expect(collection.className).toContain("button--secondary");
  expect(search.querySelector('[aria-hidden="true"]')).toBeTruthy();
  fireEvent.click(search);
  expect(toggle).toHaveBeenLastCalledWith("search");
  expect(search.getAttribute("aria-pressed")).toBe("false");
  expect(search.className).toContain("button--secondary");
  fireEvent.click(collection);
  expect(toggle).toHaveBeenLastCalledWith("collection");
  expect(collection.getAttribute("aria-pressed")).toBe("true");
  expect(collection.className).toContain("button--primary");
});

it("does not render a filter container for an empty option set", () => {
  const { container } = renderWithI18n(
    <FilterChips options={[]} selected={[]} onToggle={vi.fn()} />,
  );
  expect(container.children).toHaveLength(0);
});
