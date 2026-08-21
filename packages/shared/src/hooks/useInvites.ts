import { apiHeaders, withProtectionBypass } from "@board-game-organizer/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

/** A shareable invite owned by the viewer. */
export interface InviteRow {
  token: string;
  link: string;
  email: string | null;
  status: "pending" | "claimed" | "expired" | "revoked";
  createdAt: string;
  expiresAt: string;
  claimedAt: string | null;
}

/** Result of claiming an invite. */
export interface ClaimResult {
  success: boolean;
  autoAccepted: boolean;
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

export function fetchMyInvites(
  apiUrl: string,
  token: string,
  protectionBypass?: string | null,
): Promise<{ invites: InviteRow[] }> {
  return fetch(withProtectionBypass(`${apiUrl}/api/invites`, protectionBypass), {
    headers: apiHeaders(token),
  }).then(async (res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as { invites: InviteRow[] };
  });
}

export function createInvite(
  apiUrl: string,
  token: string,
  email: string | undefined,
  protectionBypass?: string | null,
): Promise<InviteRow> {
  return fetch(withProtectionBypass(`${apiUrl}/api/invites`, protectionBypass), {
    method: "POST",
    headers: apiHeaders(token),
    body: JSON.stringify(email ? { email } : {}),
  }).then(async (res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as InviteRow;
  });
}

export function claimInvite(
  apiUrl: string,
  sessionToken: string,
  inviteLinkOrToken: string,
  protectionBypass?: string | null,
): Promise<ClaimResult> {
  // Accept both a full link (https://…/invite/<token>) and a bare token.
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

/** Invites: my created invites + create + claim. Shared web/mobile. */
export function useInvites({ apiUrl, token, getToken, protectionBypass }: UseInvitesOptions) {
  const queryClient = useQueryClient();
  const enabled = Boolean(apiUrl) && Boolean(token);

  const invites = useQuery({
    queryKey: ["invites", apiUrl, token],
    queryFn: () => fetchMyInvites(apiUrl, token as string, protectionBypass),
    enabled,
    staleTime: 30_000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["invites"] });

  const create = useMutation({
    mutationFn: ({ email }: { email?: string }) =>
      createInvite(apiUrl, token as string, email, protectionBypass),
    onSuccess: () => refresh(),
  });

  const claim = useMutation({
    mutationFn: ({ inviteLinkOrToken }: { inviteLinkOrToken: string }) =>
      claimInvite(apiUrl, token as string, inviteLinkOrToken, protectionBypass),
    onSuccess: () => {
      // Claiming connects people: refresh contacts too.
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      refresh();
    },
  });

  return useMemo(() => ({ invites, create, claim, refresh }), [invites, create, claim, refresh]);
}
