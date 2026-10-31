import { expect, it, vi } from "vitest";
import { goBackFromEventWizard } from "../goBackFromEventWizard";

it("leaves every wizard step through native history when available", () => {
  const router = { canGoBack: () => true, back: vi.fn(), replace: vi.fn() };
  goBackFromEventWizard(router, "event", "org");
  expect(router.back).toHaveBeenCalledOnce();
  expect(router.replace).not.toHaveBeenCalled();
});
it.each([
  ["event", "org", { pathname: "/event/[eventId]", params: { eventId: "event" } }],
  [
    undefined,
    "org",
    {
      pathname: "/organization/[organizationId]",
      params: { organizationId: "org", tab: "events" },
    },
  ],
  [undefined, undefined, "/(tabs)/events"],
] as const)(
  "uses contextual deep-link fallback for event=%s organization=%s",
  (event, org, target) => {
    const router = { canGoBack: () => false, back: vi.fn(), replace: vi.fn() };
    goBackFromEventWizard(router, event, org);
    expect(router.replace).toHaveBeenCalledWith(target);
    expect(router.back).not.toHaveBeenCalled();
  },
);
