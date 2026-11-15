import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  clientMutationSuperseded,
  creationState,
  mergeCreationIntents,
  withClientRequestId,
} from "../clientMutation";
import { beginOptimisticOperation } from "../optimisticOperation";

const cid = "11111111-1111-4111-8111-111111111111";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("local request drafts, never API resource identities", () => {
  it("requires a strictly newer valid canonical epoch; absence and unchanged data prove nothing", () => {
    for (const variables of [
      undefined,
      {},
      { input: {} },
      { version: 0 },
      { version: -1 },
      { version: 1.5 },
      { version: Number.NaN },
      { version: "1" },
    ])
      expect(clientMutationSuperseded(variables, 2)).toBe(false);
    for (const epoch of [undefined, Number.NaN, 1.5, 0, 1])
      expect(clientMutationSuperseded({ version: 1 }, epoch)).toBe(false);
    expect(clientMutationSuperseded({ version: 1 }, 2)).toBe(true);
    expect(clientMutationSuperseded({ input: { version: 1 } }, 2)).toBe(true);
  });
  it("allocates one correlation without mutating input and keeps a definite-rejection retry identity", () => {
    const randomUUID = vi.fn(() => cid);
    vi.stubGlobal("crypto", { randomUUID });
    const input: { clientRequestId?: string; name: string } = { name: "Friday games" };
    const tagged = withClientRequestId(input);
    expect(tagged).toEqual({ ...input, clientRequestId: cid });
    expect(input).not.toHaveProperty("clientRequestId");
    expect(withClientRequestId(tagged)).toBe(tagged);
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });
  it.each([undefined, {}])(
    "supports native runtimes without randomUUID (%s); nonce is not a credential",
    (crypto) => {
      vi.stubGlobal("crypto", crypto);
      vi.spyOn(Math, "random").mockReturnValue(0.25);
      const input = withClientRequestId<{ clientRequestId?: string }>({});
      expect(z.uuid().parse(input.clientRequestId)).toBe("44444444-4444-4444-8444-444444444444");
    },
  );
  it("separates sending, definite rejection and unverified outcomes", () => {
    const input = {
      draftId: "1",
      submittedAt: 1,
      variables: {},
      status: "pending" as const,
      error: null,
    };
    expect(creationState(input)).toEqual({ draftId: "1", phase: "saving" });
    expect(creationState({ ...input, context: { operation: { uncertain: false } } }).phase).toBe(
      "saving",
    );
    expect(creationState({ ...input, context: { operation: { uncertain: true } } }).phase).toBe(
      "verifying",
    );
    expect(
      creationState({
        ...input,
        status: "error",
        error: Object.assign(new Error("Rejected"), { status: 400 }),
      }).phase,
    ).toBe("failed");
    expect(
      creationState({ ...input, status: "error", error: new Error("Connection lost") }).phase,
    ).toBe("verifying");
    expect(creationState({ ...input, status: "error" }).phase).toBe("verifying");
  });
  it("drops correlated receipts, canonical IDs and older duplicate local rows without changing API pages", () => {
    const records = [{ id: "real", clientRequestId: cid }, { id: "old" }];
    const local = [
      { id: "client", clientRequestId: cid },
      { id: "old" },
      { id: "new", clientRequestId: "second" },
      { id: "older", clientRequestId: "second" },
      { id: "without-cid" },
      { id: "without-cid" },
    ];
    expect(mergeCreationIntents(records, local)).toEqual([
      { id: "new", clientRequestId: "second" },
      { id: "without-cid" },
      ...records,
    ]);
    expect(records).toEqual([{ id: "real", clientRequestId: cid }, { id: "old" }]);
    expect(mergeCreationIntents([], [])).toEqual([]);
  });
  it("exposes operation verification status without a second server-state store", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
    const key = ["events", "https://api.test", "owner", "list"];
    client.setQueryData(key, []);
    const operation = await beginOptimisticOperation(
      client,
      [...key, "write"],
      { queryKey: key },
      (data) => data,
    );
    expect(operation.uncertain).toBe(false);
    operation.commit();
    client.clear();
  });
});
