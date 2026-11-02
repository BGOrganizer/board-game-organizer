import { notificationItemId } from "@board-game-organizer/schemas";
import { expect, it } from "vitest";
import { itemFacet, itemOwnerIds } from "../notification-item-pipeline";

const id = "11111111-1111-4111-8111-111111111111";
it("decodes only canonical entity identity, not ancestry or historical tableIds", () => {
  for (const resource of ["event", "table", "group"] as const) {
    const expression = itemOwnerIds("$_items", resource);
    expect(expression.$reduce.input).toBe("$_items");
    const rule = expression.$reduce.in.$let.vars.owner.$regexFind;
    const regex = new RegExp(rule.regex, rule.options);
    expect(regex.exec(notificationItemId(id, "overview", undefined, resource))?.[1]).toBe(id);
    expect(regex.exec(JSON.stringify([resource, id, "overview", null], null, 1))?.[1]).toBe(id);
    expect(
      regex.test(
        notificationItemId(id, "overview", undefined, resource === "table" ? "event" : "table"),
      ),
    ).toBe(false);
    expect(regex.test('["table","foreign-scope","game","1"]')).toBe(false);
    expect(regex.test(`prefix${notificationItemId(id, "overview", undefined, resource)}`)).toBe(
      false,
    );
  }
});
it("builds independent per-entity completion effects without nested facets or parent propagation", () => {
  const point = notificationItemId(id, "date", id),
    facets = itemFacet(point);
  const total = JSON.stringify(facets.total),
    effects = JSON.stringify(facets.effects);
  expect(total).toContain(JSON.stringify(point));
  expect(total).toContain("$_afterEvents");
  expect(total).toContain("$_afterGroups");
  expect(effects).toContain('"$setDifference":["$_ownerEvents","$_afterEvents"]');
  expect(effects).toContain('"$setDifference":["$_ownerGroups","$_afterGroups"]');
  expect(effects).not.toContain('"$facet"');
  expect(effects).not.toContain("$_groupId");
  expect(effects).not.toContain("$_eventId");
});
