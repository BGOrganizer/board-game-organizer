/* Explicit owned Preview account, eligible friendship and preloaded system-picker photo only. */
if (
  GROUP_CREATE_FIXTURE_ACK !== "owned-friends-and-photo" ||
  GROUP_CREATE_BUILD_ACK !== "owned-preview-build" ||
  GROUP_CREATE_WRITE_ACK !== "stage-owned-logo-only"
)
  throw new Error("Owned Preview fixtures/build and explicit logo staging acknowledgment required");
if (
  !/^(?:https?:\/\/(?:localhost|127\.0\.0\.1)(?::[0-9]+)?|https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.vercel\.app)\/?$/i.test(
    GROUP_CREATE_API_URL,
  )
)
  throw new Error("Local/Preview API only, never Production");
if (
  ["en", "it"].indexOf(GROUP_CREATE_LOCALE) < 0 ||
  ["light", "dark"].indexOf(GROUP_CREATE_THEME) < 0
)
  throw new Error("Explicit EN/IT locale and light/dark theme required");
var p = JSON.parse(GROUP_CREATE_INPUT);
if (
  ![p.friendName, p.friendQuery, p.imagePickerLabel].every(
    (value) => typeof value === "string" && value.trim(),
  ) ||
  p.friendQuery.trim().length < 4
)
  throw new Error(
    "Eligible friend name/query and exact verified system photo-picker label required",
  );
function exact(value) {
  return "^" + value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$";
}
var it = GROUP_CREATE_LOCALE === "it";
output.groupCreate = {
  visibilityHelp: exact(
    (it ? "Visibilità del gruppo" : "Group visibility") +
      ": " +
      (it ? "Guida al campo" : "Field help"),
  ),
  legend: exact(
    it
      ? "I gruppi privati sono solo su invito. I gruppi pubblici sono ricercabili e visibili a tutti gli utenti iscritti dopo l’approvazione."
      : "Private groups are invitation-only. Public groups are searchable and visible to all registered users after approval.",
  ),
  logoHelp: exact(
    (it ? "Logo del gruppo" : "Group logo") + ": " + (it ? "Guida al campo" : "Field help"),
  ),
  upload: exact(it ? "Carica il logo del gruppo" : "Upload group logo"),
  change: exact(it ? "Cambia logo" : "Change logo"),
  remove: exact(it ? "Rimuovi logo" : "Remove logo"),
  empty: exact(it ? "Nessun logo selezionato" : "No logo selected"),
  hint: exact(it ? "JPEG, PNG o WebP, fino a 5 MB." : "JPEG, PNG or WebP, up to 5 MB."),
  library: exact(it ? "Libreria fotografica" : "Photo library"),
  image: exact(p.imagePickerLabel),
  add: exact(it ? "Aggiungi amico" : "Add friend"),
  query: p.friendQuery,
  select: exact((it ? "Seleziona utente" : "Select user") + ": " + p.friendName),
  removeInvite: exact((it ? "Rimuovi invito" : "Remove invite") + ": " + p.friendName),
  submit: exact(it ? "Invia per approvazione" : "Submit for review"),
  create: exact(it ? "Crea gruppo" : "Create group"),
};
