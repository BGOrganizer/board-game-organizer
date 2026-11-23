import {
  addTableGuestSchema,
  changeEventStateSchema,
  changeEventVoteSchema,
  createPlannedEventSchema,
  decideTableRegistrationSchema,
  deletePlannedRecordSchema,
  editPlannedEventSchema,
  finalizeSavedEventSchema,
  inviteTablePlayerSchema,
  joinTableSchema,
  reviewEventProposalSchema,
  saveTableGuestVotesSchema,
  saveTableResultSchema,
  submitEventProposalSchema,
  tableSeatOrderSchema,
} from "@board-game-organizer/schemas";
import { z } from "zod";
import * as eventsEventIdParticipantsUserIdRoute from "@/app/api/events/[eventId]/participants/[userId]/route";
import * as eventsEventIdParticipantsRoute from "@/app/api/events/[eventId]/participants/route";
import * as eventsEventIdProposalsProposalIdRoute from "@/app/api/events/[eventId]/proposals/[proposalId]/route";
import * as eventsEventIdProposalsRoute from "@/app/api/events/[eventId]/proposals/route";
import * as eventsEventIdResultsRoute from "@/app/api/events/[eventId]/results/route";
import * as eventsEventIdRoute from "@/app/api/events/[eventId]/route";
import * as eventsEventIdStateRoute from "@/app/api/events/[eventId]/state/route";
import * as eventsEventIdTablesTableIdGuestsRegistrationIdRoute from "@/app/api/events/[eventId]/tables/[tableId]/guests/[registrationId]/route";
import * as eventsEventIdTablesTableIdGuestsRegistrationIdVotesRoute from "@/app/api/events/[eventId]/tables/[tableId]/guests/[registrationId]/votes/route";
import * as eventsEventIdTablesTableIdGuestsRoute from "@/app/api/events/[eventId]/tables/[tableId]/guests/route";
import * as eventsEventIdTablesTableIdInvitationsRoute from "@/app/api/events/[eventId]/tables/[tableId]/invitations/route";
import * as eventsEventIdTablesTableIdLeaderboardRoute from "@/app/api/events/[eventId]/tables/[tableId]/leaderboard/route";
import * as eventsEventIdTablesTableIdRegistrationsRoute from "@/app/api/events/[eventId]/tables/[tableId]/registrations/route";
import * as eventsEventIdTablesTableIdResultsRoute from "@/app/api/events/[eventId]/tables/[tableId]/results/route";
import * as eventsEventIdTablesTableIdRoute from "@/app/api/events/[eventId]/tables/[tableId]/route";
import * as eventsEventIdTablesTableIdSeatsOrderRoute from "@/app/api/events/[eventId]/tables/[tableId]/seats/order/route";
import * as eventsEventIdTablesTableIdSeatsRoute from "@/app/api/events/[eventId]/tables/[tableId]/seats/route";
import * as eventsEventIdTablesRoute from "@/app/api/events/[eventId]/tables/route";
import * as eventsEventIdVotesRoute from "@/app/api/events/[eventId]/votes/route";
import * as eventsRoute from "@/app/api/events/route";
import * as tableRegistrationsRegistrationIdRoute from "@/app/api/table-registrations/[registrationId]/route";
import * as tablesRoute from "@/app/api/tables/route";
import {
  eventListQuery,
  eventParticipantsQuery,
  eventProposalsQuery,
  eventSeatsQuery,
  eventTablesQuery,
  groupInviteesQuery,
  personalTablesQuery,
  tableLeaderboardQuery,
} from "@/app/lib/community/record-query";
import { defineOperation } from "./operation";

const guestVoteBody = z.union([saveTableGuestVotesSchema, changeEventVoteSchema]);

export const recordsOperations = [
  defineOperation({
    name: "list_events",
    description:
      "List your scheduled, available or completed events, or the visible events in a group.",
    path: "/api/events",
    method: "GET",
    handler: eventsRoute.GET,
    query: eventListQuery,
  }),
  defineOperation({
    name: "create_event",
    description: "Create a planned event with its tables, dates, locations and planning settings.",
    path: "/api/events",
    method: "POST",
    handler: eventsRoute.POST,
    body: createPlannedEventSchema,
  }),
  defineOperation({
    name: "get_event",
    description: "Get an event, its current state and the actions available to you.",
    path: "/api/events/[eventId]",
    method: "GET",
    handler: eventsEventIdRoute.GET,
  }),
  defineOperation({
    name: "update_event",
    description: "Edit a planned event and its configured options and tables.",
    path: "/api/events/[eventId]",
    method: "PATCH",
    handler: eventsEventIdRoute.PATCH,
    body: editPlannedEventSchema,
  }),
  defineOperation({
    name: "delete_event",
    description: "Delete an event that you can manage, subject to the event state and revision.",
    path: "/api/events/[eventId]",
    method: "DELETE",
    handler: eventsEventIdRoute.DELETE,
    body: deletePlannedRecordSchema,
  }),
  defineOperation({
    name: "change_event_state",
    description: "Confirm an event or reopen planning according to its state and your permissions.",
    path: "/api/events/[eventId]/state",
    method: "PATCH",
    handler: eventsEventIdStateRoute.PATCH,
    body: changeEventStateSchema,
  }),
  defineOperation({
    name: "finalize_event_results",
    description: "Finalize the saved results for an event when its required results are complete.",
    path: "/api/events/[eventId]/results",
    method: "POST",
    handler: eventsEventIdResultsRoute.POST,
    body: finalizeSavedEventSchema,
  }),
  defineOperation({
    name: "change_event_vote",
    description: "Set or remove your preference for a date, location or game in a planned event.",
    path: "/api/events/[eventId]/votes",
    method: "PATCH",
    handler: eventsEventIdVotesRoute.PATCH,
    body: changeEventVoteSchema,
  }),
  defineOperation({
    name: "list_event_participants",
    description: "List visible players, waitlisted users and other participant roles in an event.",
    path: "/api/events/[eventId]/participants",
    method: "GET",
    handler: eventsEventIdParticipantsRoute.GET,
    query: eventParticipantsQuery,
  }),
  defineOperation({
    name: "remove_event_participant",
    description: "Remove a participant from an event that you manage.",
    path: "/api/events/[eventId]/participants/[userId]",
    method: "DELETE",
    handler: eventsEventIdParticipantsUserIdRoute.DELETE,
    body: deletePlannedRecordSchema,
  }),
  defineOperation({
    name: "list_event_proposals",
    description:
      "List proposals for dates, locations or games submitted by you or available for management review.",
    path: "/api/events/[eventId]/proposals",
    method: "GET",
    handler: eventsEventIdProposalsRoute.GET,
    query: eventProposalsQuery,
  }),
  defineOperation({
    name: "submit_event_proposal",
    description: "Propose a date, location or game when the event allows participant proposals.",
    path: "/api/events/[eventId]/proposals",
    method: "POST",
    handler: eventsEventIdProposalsRoute.POST,
    body: submitEventProposalSchema,
  }),
  defineOperation({
    name: "get_event_proposal",
    description: "Get a proposal you submitted or are authorized to review.",
    path: "/api/events/[eventId]/proposals/[proposalId]",
    method: "GET",
    handler: eventsEventIdProposalsProposalIdRoute.GET,
  }),
  defineOperation({
    name: "review_event_proposal",
    description: "Accept or reject one proposal for an event that you can manage.",
    path: "/api/events/[eventId]/proposals/[proposalId]",
    method: "POST",
    handler: eventsEventIdProposalsProposalIdRoute.POST,
    body: reviewEventProposalSchema,
  }),
  defineOperation({
    name: "list_event_tables",
    description: "List the visible tables in an event.",
    path: "/api/events/[eventId]/tables",
    method: "GET",
    handler: eventsEventIdTablesRoute.GET,
    query: eventTablesQuery,
  }),
  defineOperation({
    name: "get_table",
    description: "Get a table, its game choices, confirmed play and results when available.",
    path: "/api/events/[eventId]/tables/[tableId]",
    method: "GET",
    handler: eventsEventIdTablesTableIdRoute.GET,
  }),
  defineOperation({
    name: "delete_table",
    description: "Remove a table from a planned event that you can manage.",
    path: "/api/events/[eventId]/tables/[tableId]",
    method: "DELETE",
    handler: eventsEventIdTablesTableIdRoute.DELETE,
    body: deletePlannedRecordSchema,
  }),
  defineOperation({
    name: "list_table_leaderboard",
    description: "Read the published leaderboard for a completed table.",
    path: "/api/events/[eventId]/tables/[tableId]/leaderboard",
    method: "GET",
    handler: eventsEventIdTablesTableIdLeaderboardRoute.GET,
    query: tableLeaderboardQuery,
  }),
  defineOperation({
    name: "save_table_result",
    description: "Save the outcome and scores for a confirmed table you can manage.",
    path: "/api/events/[eventId]/tables/[tableId]/results",
    method: "PUT",
    handler: eventsEventIdTablesTableIdResultsRoute.PUT,
    body: saveTableResultSchema,
  }),
  defineOperation({
    name: "list_table_seats",
    description: "List a table's visible seats, waitlist or outstanding invitations.",
    path: "/api/events/[eventId]/tables/[tableId]/seats",
    method: "GET",
    handler: eventsEventIdTablesTableIdSeatsRoute.GET,
    query: eventSeatsQuery,
  }),
  defineOperation({
    name: "get_table_seat_order",
    description: "Read the current editable seat and waitlist order for a managed table.",
    path: "/api/events/[eventId]/tables/[tableId]/seats/order",
    method: "GET",
    handler: eventsEventIdTablesTableIdSeatsOrderRoute.GET,
  }),
  defineOperation({
    name: "update_table_seat_order",
    description: "Update the order and locks for seats and waitlist entries at a managed table.",
    path: "/api/events/[eventId]/tables/[tableId]/seats/order",
    method: "PATCH",
    handler: eventsEventIdTablesTableIdSeatsOrderRoute.PATCH,
    body: tableSeatOrderSchema,
  }),
  defineOperation({
    name: "join_table",
    description: "Join a table with any preferences required for that table.",
    path: "/api/events/[eventId]/tables/[tableId]/registrations",
    method: "POST",
    handler: eventsEventIdTablesTableIdRegistrationsRoute.POST,
    body: joinTableSchema,
  }),
  defineOperation({
    name: "list_table_invitees",
    description: "Find people you are allowed to invite to a managed table.",
    path: "/api/events/[eventId]/tables/[tableId]/invitations",
    method: "GET",
    handler: eventsEventIdTablesTableIdInvitationsRoute.GET,
    query: groupInviteesQuery,
  }),
  defineOperation({
    name: "invite_table_player",
    description: "Invite a registered user to a table you can manage.",
    path: "/api/events/[eventId]/tables/[tableId]/invitations",
    method: "POST",
    handler: eventsEventIdTablesTableIdInvitationsRoute.POST,
    body: inviteTablePlayerSchema,
  }),
  defineOperation({
    name: "add_table_guest",
    description:
      "Seat or waitlist a guest without a BGO account when the managed table allows guests.",
    path: "/api/events/[eventId]/tables/[tableId]/guests",
    method: "POST",
    handler: eventsEventIdTablesTableIdGuestsRoute.POST,
    body: addTableGuestSchema,
  }),
  defineOperation({
    name: "get_table_guest_votes",
    description: "Read the preference choices already saved for a guest at a managed table.",
    path: "/api/events/[eventId]/tables/[tableId]/guests/[registrationId]",
    method: "GET",
    handler: eventsEventIdTablesTableIdGuestsRegistrationIdRoute.GET,
  }),
  defineOperation({
    name: "save_table_guest_votes",
    description: "Submit a set of preferences, or update a single preference, on a guest's behalf.",
    path: "/api/events/[eventId]/tables/[tableId]/guests/[registrationId]/votes",
    method: "POST",
    handler: eventsEventIdTablesTableIdGuestsRegistrationIdVotesRoute.POST,
    body: guestVoteBody,
  }),
  defineOperation({
    name: "respond_to_table_registration",
    description: "Respond to a table invitation or change a registration according to your role.",
    path: "/api/table-registrations/[registrationId]",
    method: "PATCH",
    handler: tableRegistrationsRegistrationIdRoute.PATCH,
    body: decideTableRegistrationSchema,
  }),
  defineOperation({
    name: "list_table_history",
    description:
      "List completed tables where you played, demonstrated or managed. To see active participation, set section to mine or waiting.",
    path: "/api/tables",
    method: "GET",
    handler: tablesRoute.GET,
    query: personalTablesQuery,
  }),
];
