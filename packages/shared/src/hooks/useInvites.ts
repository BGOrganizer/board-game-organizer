import { apiHeaders, withProtectionBypass } from "@board-game-organizer/shared";
import { useMutation } from "@tanstack/react-query";

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
}

export interface UseInvitesOptions {
  apiUrl: string;
  token: string | null | undefined;
  /** Fresh-session-token provider (Clerk getToken) — see useContacts. */
  getToken?: () => Promise<string | null>;
  /** Vercel preview protection-bypass token (web passes it explicitly). */
  protectionBypass?: string | null;
}

async function resolveToken(
  token: string | null | undefined,
  getToken?: () => Promise<string | null>,
): Promise<string> {
  if (getToken) {
    const fresh = await getToken().catch(() => null);
    if (fresh) return fresh;
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
): Promise<InviteRow> {
  return fetch(withProtectionBypass(`${apiUrl}/api/invites`, protectionBypass), {
    method: "POST",
    headers: apiHeaders(sessionToken),
    body: JSON.stringify({}),
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
  const token = inviteLinkOrToken.trim().split("/invite/").pop() ?? "";
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
export function useInvites({ apiUrl, token, getToken, protectionBypass }: UseInvitesOptions) {
  return useMutation({
    mutationFn: async () =>
      createInvite(apiUrl, await resolveToken(token, getToken), protectionBypass),
  });
}
