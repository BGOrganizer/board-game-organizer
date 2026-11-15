/** Explicit runtime descriptors: this API-hosted page does not use a Babel macro transform. */
export const inviteMessages = {
  title: { id: "invite.title", message: "You have been invited" },
  sessionLoading: { id: "invite.sessionLoading", message: "Loading your session…" },
  loading: { id: "invite.loading", message: "Loading invitation…" },
  signInHint: {
    id: "invite.signInHint",
    message: "Sign in to claim this invite and connect with the inviter.",
  },
  signIn: { id: "invite.signIn", message: "Sign in to claim" },
  claimHint: {
    id: "invite.claimHint",
    message: "Claiming this invite connects you with the inviter.",
  },
  claim: { id: "invite.claim", message: "Claim invite" },
  claiming: { id: "invite.claiming", message: "Claiming…" },
  friendSuccess: {
    id: "invite.friendSuccess",
    message: "Invite claimed — you are now friends with the inviter!",
  },
  claimFailure: { id: "invite.claimFailure", message: "Could not claim this invite. Try again." },
  unavailable: { id: "invite.unavailable", message: "Invitation unavailable" },
  readFailure: { id: "invite.readFailure", message: "Could not load this invitation." },
  retry: { id: "invite.retry", message: "Try again" },
  tableTitle: { id: "invite.tableTitle", message: "Review table invitation" },
  tableConsent: {
    id: "invite.tableConsent",
    message:
      "Accepting makes you friends with {inviter}, joins the private group {group}, and accepts your participation at {table}.",
  },
  queueHint: {
    id: "invite.queueHint",
    message: "If the table is full, you will join its waiting list.",
  },
  currentParticipation: {
    id: "invite.currentParticipation",
    message: "You already participate at this table. Your place and choices will be kept.",
  },
  availabilityKept: {
    id: "invite.availabilityKept",
    message: "Your existing event availability will be kept.",
  },
  voteHint: {
    id: "invite.voteHint",
    message:
      "Joining accepts single options. For sections with multiple options, answer every option and choose at least one Yes or If needed.",
  },
  validation: {
    id: "invite.validation",
    message: "Answer every option and choose at least one Yes or If needed in each section.",
  },
  accept: { id: "invite.accept", message: "Accept invitation" },
  accepting: { id: "invite.accepting", message: "Accepting invitation…" },
  acceptFailure: {
    id: "invite.acceptFailure",
    message: "Could not accept this invitation. Refresh the details and try again.",
  },
  expiry: { id: "invite.expiry", message: "Single-use invitation. Expires on {date}." },
  players: { id: "invite.players", message: "Players: {minimum}–{maximum}" },
  rated: { id: "invite.rated", message: "Rated table" },
  unrated: { id: "invite.unrated", message: "Unrated table" },
  manual: { id: "invite.manual", message: "Manual planning" },
  assisted: { id: "invite.assisted", message: "Assisted planning" },
  morePlayers: { id: "invite.morePlayers", message: "Maximize players" },
  bestPlayers: { id: "invite.bestPlayers", message: "Best BGG player count" },
  dates: { id: "invite.dates", message: "Dates" },
  locations: { id: "invite.locations", message: "Locations" },
  games: { id: "invite.games", message: "Games" },
  yes: { id: "invite.yes", message: "Yes" },
  ifNeeded: { id: "invite.ifNeeded", message: "If needed" },
  no: { id: "invite.no", message: "No" },
  unknown: { id: "invite.unknown", message: "Unknown" },
  successTitle: { id: "invite.successTitle", message: "Invitation accepted" },
  tableSuccess: {
    id: "invite.tableSuccess",
    message: "You are now connected with the inviter and have joined the group.",
  },
  seated: { id: "invite.seated", message: "You have a place at the table." },
  waiting: { id: "invite.waiting", message: "You joined the waiting list." },
  settingsUnavailable: {
    id: "invite.settingsUnavailable",
    message: "The table settings are incomplete. Ask the inviter to update them.",
  },
} as const;
