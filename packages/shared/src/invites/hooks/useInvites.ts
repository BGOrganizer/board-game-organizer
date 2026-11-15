import type { TableInviteClaimReceipt } from "@board-game-organizer/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiHeaders, withProtectionBypass } from "../../common/api";
import type { MutationFeedback } from "../../common/mutationFeedback";
import {
  beginOptimisticOperation,
  optimisticMutationSignal,
} from "../../common/optimisticOperation";

/** A shareable invite returned by the API. */
export interface InviteRow {
  token: string;
  link: string;
  email: string | null;
  expiresAt: string;
}

/** Result of claiming an invite. */
export interface ClaimResult {
  success: boolean;
  inviter: { id: string; name: string; email: string; avatarUrl: string | null } | null;
  table?: TableInviteClaimReceipt;
}

export interface UseInvitesOptions {
  apiUrl: string;
  token: string | null | undefined;
  /** Fresh-session-token provider (Clerk getToken) — see useContacts. */
  getToken?: () => Promise<string | null>;
  /** Vercel preview protection-bypass token (web passes it explicitly). */
  protectionBypass?: string | null;
  feedback?: MutationFeedback;
  userId?: string | null;
  tableId?: string;
}

async function resolveToken(
  token: string | null | undefined,
  getToken?: () => Promise<string | null>,
): Promise<string> {
  if (getToken) {
    const fresh = await getToken().catch(() => null);
    if (!fresh) throw new Error("No session token");
    return fresh;
  }
  if (!token) throw new Error("No session token");
  return token;
}

/**
 * Creates an invite (POST /api/invites). The API builds the shareable link
 * from the origin that received the request, so it always points at the API
 * that created it (preview vs production) — no origin needed from clients.
 */
export async function createInvite(
  apiUrl: string,
  sessionToken: string,
  protectionBypass?: string | null,
  tableId?: string,
  signal?: AbortSignal,
): Promise<InviteRow> {
  return fetch(withProtectionBypass(`${apiUrl}/api/invites`, protectionBypass), {
    method: "POST",
    headers: apiHeaders(sessionToken),
    body: JSON.stringify(tableId ? { tableId } : {}),
    signal,
  }).then(async (res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as InviteRow;
  });
}

/** Claims an invite (POST /api/invites/claim) from a full link or a bare token. */
export async function claimInvite(
  apiUrl: string,
  sessionToken: string,
  inviteLinkOrToken: string,
  protectionBypass?: string | null,
): Promise<ClaimResult> {
  const token = inviteLinkOrToken.trim().replace(/^.*\/invite\//, "");
  return fetch(withProtectionBypass(`${apiUrl}/api/invites/claim`, protectionBypass), {
    method: "POST",
    headers: apiHeaders(sessionToken),
    body: JSON.stringify({ token }),
  }).then(async (res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as ClaimResult;
  });
}

/**
 * Create-invite mutation, shared web/mobile. The generated link is returned
 * and shared/copied by the UI (no email form — a single button in a card).
 */
export function useInvites({
  apiUrl,
  token,
  getToken,
  protectionBypass,
  feedback,
  userId,
  tableId,
}: UseInvitesOptions) {
  const client = useQueryClient();
  const mutationKey = ["invites", apiUrl, userId, "create", tableId] as const;
  return useMutation<InviteRow, Error, void, Awaited<ReturnType<typeof beginOptimisticOperation>>>({
    mutationKey,
    retry: false,
    mutationFn: async (variables, context) => {
      const signal = await optimisticMutationSignal(client, context.mutationKey, variables);
      const sessionToken = await resolveToken(token, getToken);
      if (signal.aborted) throw new Error("MUTATION_OWNER_CHANGED");
      const created = await createInvite(apiUrl, sessionToken, protectionBypass, tableId, signal);
      if (signal.aborted) throw new Error("MUTATION_OWNER_CHANGED");
      return created;
    },
    onMutate: async () => {
      if (!userId) throw new Error("No session owner");
      return beginOptimisticOperation(
        client,
        mutationKey,
        { queryKey: mutationKey },
        (data) => data,
      );
    },
    onSuccess: (_created, _variables, operation) => {
      if (!operation?.active) return;
      operation.commit();
      feedback?.onSuccess?.("create_invite");
    },
    onError: (error: Error, _variables, operation) => {
      if (!operation?.active) return;
      operation.rollback();
      feedback?.onError?.(error, "create_invite");
    },
  });
}
