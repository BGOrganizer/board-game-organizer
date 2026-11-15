// The API-hosted browser flow runs separately; this native flow only reads its real result.
if (
  typeof INVITE_CLAIM_NATIVE_ACK === "undefined" ||
  INVITE_CLAIM_NATIVE_ACK !== "owned-browser-invite-result-two-users" ||
  typeof INVITE_CLAIM_NATIVE_INPUT === "undefined"
)
  throw new Error(
    "Owned Development users and an externally completed browser invite case required",
  );
var value = JSON.parse(INVITE_CLAIM_NATIVE_INPUT);
if (
  !["claimed", "pending"].includes(value.state) ||
  !["en", "it"].includes(value.locale) ||
  ![value.inviterName, value.inviteeName].every(
    (v) => typeof v === "string" && v.trim().length > 0,
  ) ||
  ![value.inviterUsername, value.inviteeUsername].every(
    (v) => typeof v === "string" && /^@[A-Za-z0-9_.-]+$/.test(v),
  )
)
  throw new Error(
    "Exact owned names/@usernames, claimed|pending browser result and configured EN/IT required",
  );
function literal(text) {
  return `^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;
}
output.inviteClaim = {
  claimed: value.state === "claimed",
  inviter: literal(value.inviterName),
  inviterUsername: literal(value.inviterUsername),
  invitee: literal(value.inviteeName),
  inviteeUsername: literal(value.inviteeUsername),
  friends: value.locale === "it" ? "Amici" : "Friends",
  empty: value.locale === "it" ? "Nessuna connessione" : "No connections yet",
};
