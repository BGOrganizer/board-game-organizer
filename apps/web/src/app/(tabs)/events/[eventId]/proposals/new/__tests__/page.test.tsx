import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { EventProposalEditor } from "@/components/events/EventProposalEditor";
import Page from "../page";

const editorBoundary = vi.hoisted(() => ({
  render: vi.fn<(props: ComponentProps<typeof EventProposalEditor>) => void>(),
}));
// Input-normalization unit only: the real async route is exercised, while its
// child editor is a boundary. Editor flows have their own real RTL integration.
vi.mock("@/components/events/EventProposalEditor", () => ({
  EventProposalEditor: (props: ComponentProps<typeof EventProposalEditor>) => {
    editorBoundary.render(props);
    return <output aria-label="Proposal route destination">{props.eventId}</output>;
  },
}));
const eventId = "11111111-1111-4111-8111-111111111111";
const tableId = "22222222-2222-4222-8222-222222222222";
const draftId = "local-unsent-proposal";
type Search = Awaited<Parameters<typeof Page>[0]["searchParams"]>;
async function mount(search: Search) {
  const result = await Page({
    params: Promise.resolve({ eventId }),
    searchParams: Promise.resolve(search),
  });
  render(result);
  expect(screen.getByLabelText("Proposal route destination")).toHaveTextContent(eventId);
}
beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

it.each(["date", "location", "game"])(
  "passes a scalar %s route and its exact table/draft identity to the editor boundary",
  async (kind) => {
    await mount({ kind, tableId, draftId });
    expect(editorBoundary.render).toHaveBeenCalledExactlyOnceWith({
      eventId,
      kind,
      tableId,
      draftId,
    });
  },
);

it("normalizes absent optional query values without inventing a category, table or draft", async () => {
  await mount({});
  expect(editorBoundary.render).toHaveBeenCalledExactlyOnceWith({
    eventId,
    kind: "",
    tableId: undefined,
    draftId: undefined,
  });
});

it.each([
  {
    search: { kind: ["date", "game"], tableId, draftId },
    expected: { kind: "", tableId, draftId },
  },
  {
    search: { kind: "game", tableId: [tableId], draftId },
    expected: { kind: "game", tableId: undefined, draftId },
  },
  {
    search: { kind: "date", tableId, draftId: [draftId, "another-draft"] },
    expected: { kind: "date", tableId, draftId: undefined },
  },
])("does not choose an arbitrary repeated query value: $search", async ({ search, expected }) => {
  await mount(search);
  expect(editorBoundary.render).toHaveBeenCalledExactlyOnceWith({ eventId, ...expected });
});

it("treats empty query arrays as absent rather than coercing them into scalar identifiers", async () => {
  await mount({ kind: [], tableId: [], draftId: [] });
  expect(editorBoundary.render).toHaveBeenCalledExactlyOnceWith({
    eventId,
    kind: "",
    tableId: undefined,
    draftId: undefined,
  });
});

it("preserves scalar values for the editor's own validation instead of trimming or guessing a supported category", async () => {
  await mount({ kind: " unrecognized ", tableId: "", draftId: "" });
  expect(editorBoundary.render).toHaveBeenCalledExactlyOnceWith({
    eventId,
    kind: " unrecognized ",
    tableId: "",
    draftId: "",
  });
});

it.each(["params", "searchParams"] as const)(
  "propagates rejected asynchronous %s without rendering an editor for a substitute resource",
  async (source) => {
    const failure = new Error("Framework route input unavailable");
    await expect(
      Page({
        params: source === "params" ? Promise.reject(failure) : Promise.resolve({ eventId }),
        searchParams:
          source === "searchParams" ? Promise.reject(failure) : Promise.resolve({ kind: "date" }),
      }),
    ).rejects.toBe(failure);
    expect(editorBoundary.render).not.toHaveBeenCalled();
  },
);
