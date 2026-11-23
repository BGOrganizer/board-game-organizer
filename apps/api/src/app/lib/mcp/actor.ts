import { AsyncLocalStorage } from "node:async_hooks";
import { auth } from "@clerk/nextjs/server";

const actor = new AsyncLocalStorage<string>();

// Only the authenticated MCP route enters this context. REST handlers still use Clerk sessions.
export function withMcpActor<T>(userId: string, operation: () => T): T {
  return actor.run(userId, operation);
}

export async function bgoAuth(): Promise<{ userId: string | null; isAuthenticated: boolean }> {
  const userId = actor.getStore();
  return userId ? { userId, isAuthenticated: true } : auth();
}
