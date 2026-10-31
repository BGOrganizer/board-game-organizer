import type { ClientSession, Db, ObjectId } from "mongodb";
import { RelationshipRepository } from "../contacts/relationship.repository";
import { EventRecordsRepository } from "../events/event-records.repository";
import { EventRecordsService } from "../events/event-records.service";
import { BoardGamesRepository } from "../games/boardGames.repository";
import { GroupAssetsRepository } from "../groups/group-assets.repository";
import { GroupAssetsService } from "../groups/group-assets.service";
import { GroupLeaderboardRepository } from "../groups/group-leaderboard.repository";
import { GroupRecordsRepository } from "../groups/group-records.repository";
import { GroupRecordsService } from "../groups/group-records.service";
import { FavoriteLocationsRepository } from "../locations/favorite-locations.repository";
import { NotificationsRepository } from "../notifications/notifications.repository";
import { RatingsRepository } from "../ratings/ratings.repository";
import { UsersRepository } from "../users/users.repository";
/** One transaction/session for membership, agreement, results and notification writes. */
export function recordServices(db: Db, session?: ClientSession, notificationIds?: ObjectId[]) {
  const users = new UsersRepository(db, session),
    relationships = new RelationshipRepository(db, session),
    notifications = new NotificationsRepository(db, session, notificationIds);
  const groupRecords = new GroupRecordsRepository(db, session),
    groupAssets = new GroupAssetsRepository(db, session),
    eventRecords = new EventRecordsRepository(db, session),
    ratings = new RatingsRepository(db, session);
  const events = new EventRecordsService(
    eventRecords,
    groupRecords,
    new BoardGamesRepository(db, session),
    users,
    relationships,
    notifications,
    ratings,
  );
  const groups = new GroupRecordsService(
    groupRecords,
    groupAssets,
    users,
    relationships,
    notifications,
    (id, user, reason) => events.membershipDeparted(id, user, reason),
    (id, user) => events.assertBanAllowed(id, user),
    new GroupLeaderboardRepository(db, session),
  );
  return {
    groups,
    events,
    assets: new GroupAssetsService(groupAssets, groupRecords, users),
    ratings,
    favorites: new FavoriteLocationsRepository(db, session),
  };
}
