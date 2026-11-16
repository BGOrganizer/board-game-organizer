// Real owned Preview recipient fixtures only; no account/resource provisioning.
if (
  typeof NATIVE_TABLE_INVITE_ACK === "undefined" ||
  NATIVE_TABLE_INVITE_ACK !== "owned-preview-native-invite" ||
  typeof NATIVE_TABLE_INVITE_INPUT === "undefined"
)
  throw new Error("Owned Preview native invitation inputs required");
var input = JSON.parse(NATIVE_TABLE_INVITE_INPUT);
if (
  !/^[A-Za-z0-9_-]{22}$/.test(input.token) ||
  !["en", "it"].includes(input.locale) ||
  ![
    "success",
    "waiting",
    "incomplete",
    "expired",
    "revoked",
    "offline",
    "auth",
    "onboarding",
  ].includes(input.mode) ||
  typeof input.tableName !== "string" ||
  !input.tableName.trim() ||
  !Array.isArray(input.optionLabels) ||
  input.optionLabels.some((label) => typeof label !== "string" || !label.trim())
)
  throw new Error("Exact token, locale, case, table name and vote labels required");
var link = "bgo-dev:///invite/" + input.token;
if (input.openWithAppLink) {
  if (
    input.openWithAppLink !== true ||
    !Number.isInteger(input.prNumber) ||
    input.prNumber < 1 ||
    input.shareLink !==
      "https://api.board-game-organizer.com/development/invite/" +
        input.token +
        "?web=" +
        encodeURIComponent(
          "https://api-development-pr-" +
            input.prNumber +
            "-board-game-organizers-projects.vercel.app/invite/" +
            input.token,
        )
  )
    throw new Error("The actual owned stable Development share link is required");
  link = input.shareLink;
}
output.nativeTableInvite = {
  link: link,
  cold: input.coldOpen === true,
  mode: input.mode,
  table: input.tableName,
  votes: input.optionLabels.map(
    (label) => "^" + label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ": .*$",
  ),
  yes: input.locale === "it" ? "Sì" : "Yes",
  index: 0,
  unavailable: input.mode === "expired" || input.mode === "revoked",
  unavailableText: input.locale === "it" ? "Invito non disponibile" : "Invitation unavailable",
  validation: input.locale === "it" ? "Rispondi a ogni opzione.*" : "Answer every option.*",
  failure:
    input.locale === "it"
      ? "Impossibile accettare questo invito.*"
      : "Could not accept this invitation.*",
};
