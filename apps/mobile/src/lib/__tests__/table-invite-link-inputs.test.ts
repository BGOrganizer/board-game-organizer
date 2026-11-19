import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

// Execute the unchanged shipped Maestro input validation, independently of native rendering.
it.each(["success", "create-offline", "forbidden"])(
  "validates owned native generation input: %s",
  (mode) => {
    const source = readFileSync(
      new URL("../../../.maestro/helpers/table-invite-link-inputs.js", import.meta.url),
      "utf8",
    );
    const input = { mode, locale: "en", eventId: "event", tableId: "table" };
    const run = (overrides: Record<string, unknown> = {}) => {
      const context = {
        output: {},
        TABLE_INVITE_NATIVE_ACK: "owned-preview-table-invite",
        TABLE_INVITE_NATIVE_INPUT: JSON.stringify(input),
        ...overrides,
      };
      runInNewContext(source, context);
      return context.output as {
        tableInvite: { link: string; offline: boolean; forbidden: boolean };
      };
    };
    const result = run().tableInvite;
    expect(result).toMatchObject({
      link: "bgo-dev:///event/invite?eventId=event&tableId=table",
      offline: mode === "create-offline",
      forbidden: mode === "forbidden",
    });
    expect(() => run({ TABLE_INVITE_NATIVE_ACK: "" })).toThrow();
    for (const field of ["mode", "locale", "eventId", "tableId"]) {
      expect(() =>
        run({ TABLE_INVITE_NATIVE_INPUT: JSON.stringify({ ...input, [field]: "?" }) }),
      ).toThrow();
    }
  },
);
