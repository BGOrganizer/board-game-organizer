import { apiHeaders, withProtectionBypass } from "../common/api";
import type { MutationFeedback } from "../common/mutationFeedback";

export interface CommunityApiOptions {
  apiUrl: string;
  userId: string | null | undefined;
  getToken: () => Promise<string | null>;
  enabled?: boolean;
  protectionBypass?: string | null;
  feedback?: MutationFeedback;
}
export class CommunityApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
export function communityAccessDenied(error: unknown): boolean {
  return (
    error instanceof CommunityApiError &&
    (error.status === 401 || error.status === 403 || error.status === 404)
  );
}
export async function communityRequest<T>(
  options: CommunityApiOptions,
  path: string,
  method = "GET",
  input?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  if (!options.userId) throw new CommunityApiError(401, "Unauthorized");
  const token = await options.getToken();
  if (signal?.aborted) throw Object.assign(new Error("Aborted"), { name: "AbortError" });
  if (!token) throw new CommunityApiError(401, "Unauthorized");
  const response = await fetch(
    withProtectionBypass(`${options.apiUrl}/api/${path}`, options.protectionBypass),
    {
      method,
      headers: apiHeaders(token),
      signal,
      ...(input === undefined ? {} : { body: JSON.stringify(input) }),
    },
  );
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const code =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : `HTTP ${response.status}`;
    throw new CommunityApiError(response.status, code);
  }
  return response.json();
}
export function communityPagePath(path: string, query: string, cursor: string) {
  const params = new URLSearchParams({ limit: "20" });
  if (query.length >= 4) params.set("query", query);
  if (cursor) params.set("cursor", cursor);
  return `${path}${path.includes("?") ? "&" : "?"}${params}`;
}
