import { randomUUID } from "node:crypto";

export type RequestDiagnosticOperation =
  | "group.create"
  | "group.update"
  | "group.logo.start"
  | "group.logo.chunk"
  | "group.logo.complete"
  | "group.logo.preview"
  | "location.search"
  | "location.favorites.list"
  | "location.favorites.save"
  | "location.favorites.remove";
export type RequestDiagnosticTrace = ReturnType<typeof createRequestDiagnostics>;

/** Only fixed operation/stage labels and normalized codes; never pass request data. */
export function createRequestDiagnostics(operation?: RequestDiagnosticOperation) {
  const requestId = operation ? randomUUID() : undefined;
  const trace = (
    phase: "received" | "starting" | "completed" | "rejected" | "failed",
    stage:
      | "auth"
      | "query"
      | "body"
      | "validation"
      | "services"
      | "user_sync"
      | "transaction"
      | "lookup"
      | "storage",
    status?: number,
    code?: string,
  ) => {
    if (!operation) return;
    console.info(operation.startsWith("group.") ? "[bgo.group-write]" : "[bgo.location-write]", {
      operation,
      requestId,
      phase,
      stage,
      status,
      code:
        code === undefined
          ? undefined
          : /^[A-Z][A-Z0-9_]{0,79}$/.test(code)
            ? code
            : "REQUEST_REJECTED",
    });
  };
  trace("received", "auth");
  return trace;
}
