// Requires a pre-existing owned Preview fixture; no account/resource provisioning.
if (
  typeof TABLE_INVITE_NATIVE_ACK === "undefined" ||
  TABLE_INVITE_NATIVE_ACK !== "owned-preview-table-invite" ||
  typeof TABLE_INVITE_NATIVE_INPUT === "undefined"
)
  throw new Error("Owned Preview Table invite fixture and installed API verification required");
var value = JSON.parse(TABLE_INVITE_NATIVE_INPUT);
if (
  !["success", "create-offline", "forbidden"].includes(value.mode) ||
  !["en", "it"].includes(value.locale) ||
  ![value.eventId, value.tableId].every(
    (id) => typeof id === "string" && /^[a-zA-Z0-9_-]+$/.test(id),
  )
)
  throw new Error("Exact owned Event/Table IDs, EN/IT and generation case required");
output.tableInvite = {
  link:
    "bgo-dev:///event/invite?eventId=" +
    encodeURIComponent(value.eventId) +
    "&tableId=" +
    encodeURIComponent(value.tableId),
  forbidden: value.mode === "forbidden",
  ready:
    value.locale === "it"
      ? "Invita giocatori|Inviti non disponibili.*"
      : "Invite players|Invitations are unavailable.*",
  offline: value.mode === "create-offline",
  failure:
    value.locale === "it"
      ? "Impossibile creare l'invito. Riprova."
      : "Could not create the invite. Try again.",
};
