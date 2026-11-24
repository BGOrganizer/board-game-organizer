// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { createGroupRecordSchema } from "@board-game-organizer/schemas";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import type { App } from "@modelcontextprotocol/ext-apps";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { groupRecord } from "@/test-fixtures/eventRecords";
import { GroupCreation } from "./GroupCreation";

const i18n = setupI18n({ locale: "en" });
afterEach(() => cleanup());

it("deduplicates native form submissions and allocates a new request ID after a rejected draft changes", async () => {
  const operation = "create_group";
  const gate = Promise.withResolvers<Awaited<ReturnType<App["callServerTool"]>>>();
  const callServerTool = vi
    .fn<App["callServerTool"]>()
    .mockReturnValueOnce(gate.promise)
    .mockResolvedValueOnce({
      content: [],
      structuredContent: {
        operation,
        data: { id: groupRecord.id, name: "Renamed group" },
      },
    });
  const app = { callServerTool } as unknown as App;
  render(
    <I18nProvider i18n={i18n}>
      <GroupCreation app={app} data={{ name: "Tiny" }} />
    </I18nProvider>,
  );
  const name = screen.getByRole<HTMLInputElement>("textbox", { name: "Group name" });
  const form = name.form;
  if (!form) throw new Error("Missing group form");
  expect(screen.getByText("Choose a name, from 5 to 30 characters.")).toBeVisible();
  fireEvent.submit(form);
  expect(callServerTool).not.toHaveBeenCalled();

  fireEvent.change(name, { target: { value: "Friday group" } });
  fireEvent.submit(form);
  expect(screen.getByRole("button", { name: "Create group" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Upload group logo" })).toBeDisabled();
  fireEvent.submit(form);
  expect(callServerTool).toHaveBeenCalledTimes(1);
  gate.resolve({ content: [], isError: true, structuredContent: { status: 400 } });
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not create group");

  fireEvent.change(name, { target: { value: "Renamed group" } });
  fireEvent.submit(form);
  expect(await screen.findByText("Group created")).toHaveAttribute("role", "status");
  expect(callServerTool).toHaveBeenCalledTimes(2);
  const [first, next] = callServerTool.mock.calls.map(([request]) =>
    createGroupRecordSchema.parse(request.arguments?.body),
  );
  expect(first).toMatchObject({
    type: "PRIVATE",
    name: "Friday group",
    clientRequestId: expect.any(String),
  });
  expect(next).toMatchObject({
    type: "PRIVATE",
    name: "Renamed group",
    clientRequestId: expect.any(String),
  });
  expect(next.clientRequestId).not.toBe(first.clientRequestId);
});
