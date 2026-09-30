import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { EmptyList } from "@/components/EmptyList";
import { GroupedList, GroupedRow } from "@/components/GroupedList";

it("keeps minimum height only for empty states, without padding populated lists", () => {
  const { container } = render(
    <>
      <EmptyList icon={<span aria-hidden="true">★</span>}>No entries</EmptyList>
      <GroupedList>
        <GroupedRow>One entry</GroupedRow>
      </GroupedList>
    </>,
  );
  expect(screen.getByText("No entries").parentElement?.className).toContain("min-h-36");
  expect(container.querySelector("ul")?.className).not.toContain("min-h-36");
});
