import { expect, it } from "vitest";
import EditPage from "../(tabs)/events/[eventId]/edit/page";
import EventPage from "../(tabs)/events/[eventId]/page";
import TablePage from "../(tabs)/events/[eventId]/tables/[tableId]/page";

it.each([undefined, "event", "foreign", ["event", "foreign"]])(
  "accepts only the matching scalar Table origin (%j)",
  async (fromEvent) => {
    const page = await TablePage({
      params: Promise.resolve({ eventId: "event", tableId: "table" }),
      searchParams: Promise.resolve({ fromEvent }),
    });
    expect(page.props).toMatchObject({
      eventId: "event",
      tableId: "table",
      context: fromEvent === "event" ? "event" : "personal",
    });
  },
);
it.each([undefined, "group", ["group", "foreign"]])(
  "forwards scalar Group origin through Event and edit entry without trusting duplicate values (%j)",
  async (fromGroup) => {
    const args = {
      params: Promise.resolve({ eventId: "event" }),
      searchParams: Promise.resolve({ fromGroup }),
    };
    expect((await EventPage(args)).props.fromGroup).toBe(
      typeof fromGroup === "string" ? fromGroup : undefined,
    );
    expect((await EditPage(args)).props.fromGroup).toBe(
      typeof fromGroup === "string" ? fromGroup : undefined,
    );
  },
);
it("keeps direct URLs and older callers valid without origin parameters", async () => {
  const params = Promise.resolve({ eventId: "event", tableId: "table" });
  expect((await TablePage({ params })).props.context).toBe("personal");
  expect((await EventPage({ params })).props.fromGroup).toBeUndefined();
  expect((await EditPage({ params })).props.fromGroup).toBeUndefined();
});
