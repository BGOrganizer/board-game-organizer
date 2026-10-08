import type { Event, EventBooking, EventTable } from "../models/events";
import type {
  Organization,
  OrganizationMembership,
  OrganizationRevision,
} from "../models/organizations";
export type CommunityPageResponse<T> = { items: T[]; nextCursor: string | null };
export type OrganizationResponse = {
  id: string;
  adminUserId: string;
  name: string;
  location: OrganizationRevision["location"];
  logoAssetId: string;
  logo: string;
  status: Organization["status"];
  memberCount: number;
  role: "admin" | "accepted" | "invited" | "requested" | "none" | "excluded";
  myMembership: OrganizationMembership | null;
  approved?: OrganizationRevision;
  proposal?: OrganizationRevision;
  reviewStatus?: Organization["reviewStatus"];
  rejectionReason?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};
export type OrganizationMemberResponse = {
  userId: string;
  username: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  membership: OrganizationMembership | null;
};
export type EventResponse = Event & {
  organizationName: string;
  logo: string;
  tableCount: number;
  role: "admin" | "member" | "visitor";
  canModify: boolean;
  canPublish: boolean;
};
export type EventTableResponse = EventTable & {
  gameName: string;
  image: string | null;
  confirmedCount: number;
  reservedCount: number;
  myBooking: EventBooking | null;
  canBook: boolean;
  demonstrator: { userId: string; username: string | null; avatarUrl: string | null } | null;
};
export type EventBookingResponse = EventBooking & {
  username: string | null;
  avatarUrl: string | null;
};
