/** biome-ignore-all lint/suspicious/noThenProperty: MongoDB $switch uses literal then fields. */
import {
  NOTIFICATION_KINDS,
  type Notification,
  type NotificationAttentionTarget,
  type NotificationChangeReference,
  type NotificationChangeRow,
  type NotificationChangesPage,
  type NotificationChangesQuery,
  type NotificationChangesScope,
  type ReadNotificationChangesInput,
} from "@board-game-organizer/schemas";
import {
  notificationChangeFieldTabs,
  notificationChangeMessage,
  notificationChangesReadEffect,
  notificationChangeTab,
} from "@board-game-organizer/shared";
import { type ClientSession, type Db, type Document, ObjectId } from "mongodb";
import { COLLECTIONS } from "../db";
import { NotificationAttentionRepository } from "./notification-attention.repository";
import { notificationRequiresResponse } from "./notification-response-protection";

type SourceRow = Notification & {
  _item?: { id: string; revision?: number; sectionId?: string };
  _lists: NotificationAttentionTarget[];
  _effectiveAt: Date;
  _tab: string;
};

export class NotificationChangesRepository {
  constructor(
    private db: Db,
    private session?: ClientSession,
  ) {}
  private get opts() {
    return this.session ? { session: this.session } : {};
  }
  private async source(
    userId: string,
    scope: NotificationChangesScope,
    asOf: string,
    filter: Document = {},
    eligibilityAt?: string,
  ): Promise<Document[]> {
    const attention = new NotificationAttentionRepository(this.db, this.session);
    const owner = { kind: scope.kind, id: scope.id };
    const pattern = `^\\[\\s*"${scope.kind}"\\s*,\\s*"${scope.id}"\\s*,\\s*"([^"\\\\]+)"`;
    return [
      ...(await attention.authorizedSource(userId, asOf, filter, eligibilityAt)),
      {
        $match: {
          ...attention.sourceMatches(owner),
          _kind: { $ne: null },
          $or: [
            { "_items.0": { $exists: true } },
            { attentionItems: { $exists: false }, "_items.0": { $exists: false } },
          ],
        },
      },
      {
        $set: { _changeItems: { $cond: [{ $gt: [{ $size: "$_items" }, 0] }, "$_items", [null]] } },
      },
      { $unwind: "$_changeItems" },
      {
        $set: {
          _item: "$_changeItems",
          _fieldMatch: {
            $regexFind: { input: { $ifNull: ["$_changeItems.id", ""] }, regex: pattern },
          },
        },
      },
      {
        $match: {
          $or: [
            { _fieldMatch: { $ne: null } },
            { _item: null, _kind: scope.kind, _idTarget: scope.id },
          ],
        },
      },
      {
        $set: {
          _field: { $arrayElemAt: ["$_fieldMatch.captures", 0] },
          _itemId: { $ifNull: ["$_item.id", ""] },
          _effectiveAt: { $ifNull: ["$_item.changedAt", "$createdAt"] },
        },
      },
      { $match: { _effectiveAt: { $lte: new Date(asOf) } } },
      {
        $set: {
          _tab: {
            $cond: [
              { $ne: ["$_itemId", ""] },
              {
                $switch: {
                  branches: Object.entries(notificationChangeFieldTabs[scope.kind]).map(
                    ([field, tab]) => ({ case: { $eq: ["$_field", field] }, then: tab }),
                  ),
                  default: null,
                },
              },
              {
                $switch: {
                  branches: NOTIFICATION_KINDS.map((kind) => ({
                    case: { $eq: ["$kind", kind] },
                    then: notificationChangeTab(scope, kind),
                  })),
                  default: "details",
                },
              },
            ],
          },
        },
      },
      { $match: { _tab: { $ne: null } } },
    ];
  }
  private async row(
    note: SourceRow,
    scope: NotificationChangesScope,
  ): Promise<NotificationChangeRow> {
    const reference: NotificationChangeReference = {
      notificationId: note._id.toHexString(),
      ...(note._item?.id ? { itemId: note._item.id } : {}),
      ...(note._item?.revision !== undefined ? { revision: note._item.revision } : {}),
      effectiveAt: note._effectiveAt.toISOString(),
    };
    return {
      ...reference,
      messageCode: notificationChangeMessage(scope, note.kind, reference.itemId),
      requiresResponse: await notificationRequiresResponse(this.db, note, this.session),
      readReference: reference,
    };
  }
  async list(
    userId: string,
    query: NotificationChangesQuery,
    at?: string,
  ): Promise<NotificationChangesPage> {
    const asOf = new Date(
      Math.min(Date.parse(at ?? query.cursor?.asOf ?? new Date().toISOString()), Date.now()),
    ).toISOString();
    const after: Document[] = query.cursor
      ? [
          {
            $match: {
              $or: [
                { _effectiveAt: { $lt: new Date(query.cursor.effectiveAt) } },
                {
                  _effectiveAt: new Date(query.cursor.effectiveAt),
                  _id: { $lt: new ObjectId(query.cursor.notificationId) },
                },
                {
                  _effectiveAt: new Date(query.cursor.effectiveAt),
                  _id: new ObjectId(query.cursor.notificationId),
                  _itemId: { $gt: query.cursor.itemId },
                },
              ],
            },
          },
        ]
      : [];
    const [result] = await this.db
      .collection(COLLECTIONS.NOTIFICATIONS)
      .aggregate<{ counts: { _id: string; count: number }[]; rows: SourceRow[] }>(
        [
          ...(await this.source(userId, query, asOf, {}, at)),
          {
            $facet: {
              counts: [{ $group: { _id: "$_tab", count: { $sum: 1 } } }],
              rows: [
                { $match: { _tab: query.tab } },
                ...after,
                { $sort: { _effectiveAt: -1, _id: -1, _itemId: 1 } },
                { $limit: query.limit + 1 },
                { $project: { recipientUserId: 1, kind: 1, href: 1, _item: 1, _effectiveAt: 1 } },
              ],
            },
          },
        ],
        this.opts,
      )
      .toArray();
    const rows = (result?.rows ?? []).slice(0, query.limit);
    const changes: NotificationChangeRow[] = [];
    for (const note of rows) changes.push(await this.row(note, query));
    const last = changes.at(-1);
    return {
      asOf,
      changes,
      nextCursor:
        (result?.rows.length ?? 0) > query.limit && last
          ? JSON.stringify({
              asOf,
              notificationId: last.notificationId,
              itemId: last.itemId ?? "",
              effectiveAt: last.effectiveAt,
            })
          : null,
      tabCounts: {
        details: 0,
        members: 0,
        tables: 0,
        participants: 0,
        ...Object.fromEntries((result?.counts ?? []).map((row) => [row._id, row.count])),
      },
    };
  }
  /** Exact displayed captures only. Reauthorization and writes run sequentially in the caller's domain transaction. */
  async read(userId: string, input: ReadNotificationChangesInput) {
    const through = new Date(Math.min(Date.parse(input.through), Date.now())).toISOString();
    let updated = 0;
    const targets: NotificationAttentionTarget[] = [{ kind: input.scope.kind, id: input.scope.id }];
    const readReferences: NotificationChangeReference[] = [];
    const selected: { note: SourceRow; reference: NotificationChangeReference }[] = [];
    for (const reference of input.references) {
      const candidates = await this.db
        .collection(COLLECTIONS.NOTIFICATIONS)
        .aggregate<SourceRow>(
          [
            ...(await this.source(userId, input.scope, through, {
              _id: new ObjectId(reference.notificationId),
            })),
            {
              $match: {
                _tab: input.scope.tab,
                _itemId: reference.itemId ?? "",
                _effectiveAt: new Date(reference.effectiveAt),
                ...(reference.revision !== undefined
                  ? { "_item.revision": reference.revision }
                  : { "_item.revision": { $exists: false } }),
              },
            },
            { $limit: 1 },
          ],
          this.opts,
        )
        .toArray();
      const note = candidates[0];
      if (!note || (await notificationRequiresResponse(this.db, note, this.session))) continue;
      readReferences.push(reference);
      if (reference.itemId) targets.push({ kind: "item", id: reference.itemId });
      if (note._item?.sectionId && (JSON.parse(note._item.id) as string[])[2] !== "overview")
        targets.push({ kind: "item", id: note._item.sectionId });
      targets.push(...note._lists);
      selected.push({ note, reference });
    }
    const unique = [
      ...new Map(targets.map((target) => [`${target.kind}:${target.id}`, target])).values(),
    ];
    const attention = new NotificationAttentionRepository(this.db, this.session);
    const at = new Date().toISOString();
    const counts = { ...input.scope, tab: "none" as const, limit: 8 };
    const before = {
      snapshot: (await attention.snapshot(userId, unique, [], at)).snapshot,
      tabCounts: (await this.list(userId, counts, at)).tabCounts,
    };
    for (const { note, reference } of selected) {
      const filter = { _id: note._id, recipientUserId: userId, readAt: { $exists: false } };
      if (!note.attentionItems) {
        const result = await this.db
          .collection(COLLECTIONS.NOTIFICATIONS)
          .updateOne(filter, { $set: { readAt: new Date() } }, this.opts);
        updated += result.modifiedCount;
      } else {
        const result = await this.db.collection(COLLECTIONS.NOTIFICATIONS).updateOne(
          filter,
          [
            {
              $set: {
                attentionItems: {
                  $map: {
                    input: "$attentionItems",
                    as: "item",
                    in: {
                      $cond: [
                        {
                          $and: [
                            { $eq: ["$$item.id", reference.itemId] },
                            {
                              $eq: [
                                { $ifNull: ["$$item.revision", null] },
                                reference.revision ?? null,
                              ],
                            },
                            {
                              $eq: [
                                { $ifNull: ["$$item.changedAt", "$createdAt"] },
                                new Date(reference.effectiveAt),
                              ],
                            },
                            { $eq: [{ $ifNull: ["$$item.readAt", null] }, null] },
                          ],
                        },
                        { $mergeObjects: ["$$item", { readAt: "$$NOW" }] },
                        "$$item",
                      ],
                    },
                  },
                },
              },
            },
            {
              $set: {
                readAt: {
                  $cond: [
                    {
                      $allElementsTrue: {
                        $map: {
                          input: "$attentionItems",
                          as: "item",
                          in: { $ne: [{ $ifNull: ["$$item.readAt", null] }, null] },
                        },
                      },
                    },
                    "$$NOW",
                    "$$REMOVE",
                  ],
                },
              },
            },
          ],
          this.opts,
        );
        updated += result.modifiedCount;
      }
    }
    // Same transaction and eligibility time: only this selected union's effects, not absolute
    // totals that could overwrite a disjoint invitation decision while this response is delayed.
    const after = {
      snapshot: (await attention.snapshot(userId, unique, [], at)).snapshot,
      tabCounts: (await this.list(userId, counts, at)).tabCounts,
    };
    return {
      updated,
      readReferences,
      ...after,
      effects: notificationChangesReadEffect(before, after),
    };
  }
}
