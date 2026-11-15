import { communityFeedbackMessages, organizationActionMessage } from "@board-game-organizer/shared";
import { setupI18n } from "@lingui/core";
import { expect, it } from "vitest";
import { messages as en } from "../../../../../messages/en.js";
import { messages as itMessages } from "../../../../../messages/it.js";

it("translates every community operation and action with stable catalog ids", () => {
  const english = setupI18n({ locale: "en", messages: { en } });
  const italian = setupI18n({ locale: "it", messages: { it: itMessages } });
  const translated = communityFeedbackMessages((id, message) => {
    expect(english._({ id, message })).toBe(message);
    const value = italian._({ id, message });
    expect(value).not.toBe(id);
    expect(value).not.toBe(message);
    return value;
  });
  expect(translated.request_organization_join.success).toBe(
    "Richiesta di adesione all'organizzazione inviata",
  );
  for (const action of [
    "request",
    "accept",
    "decline",
    "approve",
    "reject",
    "remove",
    "ban",
    "revoke",
    "cancel",
  ] as const) {
    const descriptor = organizationActionMessage(action);
    expect(english._(descriptor)).toBe(descriptor.message);
    expect(italian._(descriptor)).not.toBe(descriptor.message);
  }
  expect(italian._(organizationActionMessage("cancel", "requested"))).toBe("Annulla richiesta");
});
