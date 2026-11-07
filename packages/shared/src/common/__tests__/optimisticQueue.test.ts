import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  beginOptimisticOperation,
  cancelOptimisticResource,
  clearSessionQueryCache,
  optimisticMutationSignal,
  updateOptimisticBase,
} from "../optimisticOperation";

const root = ["events", "api", "actor", "event"];
const key = [...root, "data"];
const mutationKey = [...root, "mutation"];
const client = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const apply = (vote: string) => (data: unknown) => ({ ...(data as object), vote });
const begin = (c: QueryClient, vote: string, queue = "event-scope") =>
  beginOptimisticOperation(c, root, { queryKey: root }, apply(vote), [], undefined, queue);

describe("non-blocking optimistic FIFO", () => {
  it("parent dependencies cancel children, not unrelated writers or parent deletion; dependencies never acquire a lock", async () => {
    const c = client(),
      parent = ["groups", "api", "actor", "group"];
    const child = await beginOptimisticOperation(
      c,
      root,
      { queryKey: root },
      apply("YES"),
      [],
      undefined,
      "queue",
      [parent],
    );
    const queued = await beginOptimisticOperation(
      c,
      root,
      { queryKey: root },
      apply("NO"),
      [],
      undefined,
      "queue",
      [parent],
    );
    const waiting = queued.prepare();
    const rejected = expect(waiting).rejects.toThrow("MUTATION_OWNER_CHANGED");
    const removal = await beginOptimisticOperation(c, parent, { queryKey: parent });
    const other = await beginOptimisticOperation(c, ["events", "api", "actor", "other"], {
      queryKey: ["other"],
    });
    cancelOptimisticResource(c, parent, true);
    await rejected;
    expect(child.signal.aborted).toBe(true);
    expect(removal.active).toBe(true);
    expect(other.active).toBe(true);
    const later = await beginOptimisticOperation(
      c,
      root,
      { queryKey: root },
      undefined,
      [],
      undefined,
      "queue",
      [parent],
    );
    cancelOptimisticResource(c, parent);
    expect(later.signal.aborted).toBe(true);
    expect(removal.active).toBe(false);
    expect(other.active).toBe(true);
    other.rollback();
    clearSessionQueryCache(c);
  });
  it("serializes dynamic resource queues without a global SDK scope, leaving another resource free", async () => {
    const c = client();
    const first = await beginOptimisticOperation(
      c,
      [...root, "one", "person", "a"],
      { queryKey: root },
      apply("YES"),
      [],
      undefined,
      "one",
    );
    const later = await beginOptimisticOperation(
      c,
      [...root, "one", "person", "b"],
      { queryKey: root },
      apply("NO"),
      [],
      undefined,
      "one",
    );
    const other = await beginOptimisticOperation(
      c,
      [...root, "two"],
      { queryKey: root },
      undefined,
      [],
      undefined,
      "two",
    );
    const sent = vi.fn();
    const waiting = later.prepare().then(() => sent("later"));
    await other.prepare();
    sent("other");
    await first.prepare();
    expect(sent.mock.calls).toEqual([["other"]]);
    first.commit();
    await waiting;
    expect(sent.mock.calls).toEqual([["other"], ["later"]]);
    later.commit();
    other.commit();
  });
  it("aborts a queued prepare immediately when its owner is cancelled, even if the preceding request is held", async () => {
    const c = client();
    const first = await begin(c, "YES");
    const second = await begin(c, "NO");
    const waiting = second.prepare();
    const rejected = expect(waiting).rejects.toThrow("MUTATION_OWNER_CHANGED");
    second.rollback();
    await rejected;
    expect(first.active).toBe(true);
    first.rollback();
  });
  it("projects rapid same-resource intents immediately, retaining later intent over earlier ACK and failure", async () => {
    const c = client();
    c.setQueryData(key, { vote: "NO" });
    const first = await begin(c, "YES");
    const second = await begin(c, "IF_NEEDED");
    expect(first.resource).not.toEqual(second.resource);
    expect(c.getQueryData(key)).toEqual({ vote: "IF_NEEDED" });
    updateOptimisticBase(c, key, () => ({ vote: "YES", canonical: true }));
    first.commit((_data, queryKey) =>
      queryKey === key ? { vote: "YES", canonical: true } : _data,
    );
    expect(c.getQueryData(key)).toEqual({ vote: "IF_NEEDED", canonical: true });
    await second.reject(Object.assign(new Error("Rejected"), { status: 409 }));
    expect(c.getQueryData(key)).toEqual({ vote: "YES", canonical: true });
  });

  it("only permits overlapping intents in the same explicit SDK scope", async () => {
    const c = client();
    c.setQueryData(key, { vote: "NO" });
    const first = await begin(c, "YES");
    await expect(begin(c, "NO", "other-scope")).rejects.toThrow("MUTATION_IN_PROGRESS");
    await expect(beginOptimisticOperation(c, root, { queryKey: root })).rejects.toThrow(
      "MUTATION_IN_PROGRESS",
    );
    const done = first.wait();
    first.rollback();
    await done;
    await first.wait();
  });

  it("uses real SDK scope FIFO without delaying optimistic state or toast, even for reused variable objects", async () => {
    const c = client();
    c.setQueryData(key, { vote: "NO" });
    const response = deferred<string>();
    const sent = vi.fn();
    const toast = vi.fn();
    const variables = { selected: "same reference" };
    function options(vote: string) {
      return {
        mutationKey,
        scope: { id: "event-scope" },
        networkMode: "always" as const,
        onMutate: async () => {
          const operation = await begin(c, vote);
          toast(vote);
          return { operation };
        },
        mutationFn: async (input: typeof variables) => {
          const signal = await optimisticMutationSignal(c, mutationKey, input);
          expect(signal.aborted).toBe(false);
          sent(vote);
          return vote === "YES" ? response.promise : vote;
        },
        onSuccess: (
          _value: string,
          _input: typeof variables,
          context: { operation: Awaited<ReturnType<typeof begin>> },
        ) => context.operation.commit(),
      };
    }
    const first = c.getMutationCache().build(c, options("YES"));
    const second = c.getMutationCache().build(c, options("IF_NEEDED"));
    const a = first.execute(variables);
    await vi.waitFor(() => expect(sent).toHaveBeenCalledWith("YES"));
    const b = second.execute(variables);
    await vi.waitFor(() => expect(toast).toHaveBeenCalledWith("IF_NEEDED"));
    expect(c.getQueryData(key)).toEqual({ vote: "IF_NEEDED" });
    expect(sent).toHaveBeenCalledTimes(1);
    response.resolve("YES");
    await a;
    await b;
    expect(sent.mock.calls).toEqual([["YES"], ["IF_NEEDED"]]);
    expect(c.getQueryData(key)).toEqual({ vote: "IF_NEEDED" });
  });

  it("clears private state and rejects queued old-owner requests without sending HTTP", async () => {
    const c = client();
    c.setQueryData(key, { vote: "NO" });
    const response = deferred<string>();
    const sent = vi.fn();
    const options = {
      mutationKey,
      scope: { id: "event-scope" },
      networkMode: "always" as const,
      onMutate: async (input: string) => ({ operation: await begin(c, input) }),
      mutationFn: async (input: string) => {
        await optimisticMutationSignal(c, mutationKey, input);
        sent(input);
        return response.promise;
      },
    };
    const first = c.getMutationCache().build(c, options);
    const second = c.getMutationCache().build(c, options);
    const a = first.execute("YES");
    await vi.waitFor(() => expect(sent).toHaveBeenCalledTimes(1));
    const b = second.execute("NO").catch((error: Error) => error.message);
    await vi.waitFor(() => expect(second.state.context?.operation.active).toBe(true));
    const settled = second.state.context!.operation.wait();
    clearSessionQueryCache(c);
    await settled;
    expect(await b).toBe("MUTATION_OWNER_CHANGED");
    response.resolve("YES");
    await a;
    expect(sent).toHaveBeenCalledTimes(1);
    expect(c.getQueryCache().getAll()).toHaveLength(0);
  });

  it("guards absent contexts/keys and supports direct operation contexts", async () => {
    const c = client();
    await expect(optimisticMutationSignal(c, undefined, {})).rejects.toThrow(
      "MUTATION_OWNER_CHANGED",
    );
    await expect(optimisticMutationSignal(c, mutationKey, {})).rejects.toThrow(
      "MUTATION_OWNER_CHANGED",
    );
    c.setQueryData(key, { vote: "NO" });
    const mutation = c.getMutationCache().build(c, {
      mutationKey,
      onMutate: () => begin(c, "YES"),
      mutationFn: async (input: string) => {
        expect((await optimisticMutationSignal(c, mutationKey, input)).aborted).toBe(false);
        return "YES";
      },
      onSuccess: (_value, _input, operation) => operation.commit(),
    });
    await mutation.execute("YES");
  });

  it("never prepares a completed or cancelled owner, including a session change while read cancellation is awaited", async () => {
    const c = client();
    c.setQueryData(key, { vote: "NO" });
    const completed = await begin(c, "YES");
    completed.commit();
    await expect(completed.prepare()).rejects.toThrow("MUTATION_OWNER_CHANGED");
    const queued = await begin(c, "NO");
    const cancelled = deferred<void>();
    const cancel = vi.spyOn(c, "cancelQueries").mockReturnValueOnce(cancelled.promise);
    const prepared = queued.prepare();
    const rejected = expect(prepared).rejects.toThrow("MUTATION_OWNER_CHANGED");
    clearSessionQueryCache(c);
    cancelled.resolve();
    await rejected;
    expect(queued.signal.aborted).toBe(true);
    expect(c.getQueryCache().getAll()).toHaveLength(0);
    cancel.mockRestore();
  });
});
