import { z } from "zod";
import type { BggSearchItem } from "../../matches/dto/matches";
import type { BggIdentity } from "../models/bggCollection";

export const bggUsernameSchema = z.string().trim().min(1).max(64);

export interface BggAccountResponse {
  active: (BggIdentity & { snapshot: string; syncedAt: string }) | null;
  pending:
    | (BggIdentity & {
        status: "syncing" | "failed";
        nextAttemptAt: string | null;
        error: string | null;
      })
    | null;
}

export interface BggPickerItem extends BggSearchItem {
  source: "collection" | "search";
}

export interface BggPickerResponse {
  items: BggPickerItem[];
  nextCursor: string | null;
}
