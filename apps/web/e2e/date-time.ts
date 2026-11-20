import { expect, type Locator } from "@playwright/test";

/** HeroUI date/time fields expose editable spinbuttons, not browser date inputs. */
export async function enterDateTime(field: Locator, wall: string) {
  const [date, time] = wall.split("T");
  const values = time
    ? {
        year: date.slice(0, 4),
        month: date.slice(5, 7),
        day: date.slice(8, 10),
        hour: time.slice(0, 2),
        minute: time.slice(3, 5),
      }
    : { hour: wall.slice(0, 2), minute: wall.slice(3, 5) };
  for (const [type, value] of Object.entries(values)) {
    const segment = field.locator(`[role="spinbutton"][data-type="${type}"]`);
    await segment.fill(value);
    await expect(segment).toHaveAttribute("aria-valuenow", String(Number(value)));
  }
}
