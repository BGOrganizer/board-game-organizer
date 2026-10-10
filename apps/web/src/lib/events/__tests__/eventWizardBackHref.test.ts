import { expect, it } from "vitest";
import { eventWizardBackHref } from "../eventWizardBackHref";

it("leaves create/edit context without confusing header Back with step Back", () => {
  expect(eventWizardBackHref("event", "org")).toBe("/events/event");
  expect(eventWizardBackHref(undefined, "org")).toBe("/organizations/org?tab=events");
  expect(eventWizardBackHref()).toBe("/events");
  expect(eventWizardBackHref("a/b?x")).toBe("/events/a%2Fb%3Fx");
  expect(eventWizardBackHref(undefined, "a/b?x")).toBe("/organizations/a%2Fb%3Fx?tab=events");
});
