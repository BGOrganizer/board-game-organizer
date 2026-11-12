const source = db.getCollection("_bggImport");
const next = db.getCollection("_boardGamesNext");
const updatedAt = new Date().toISOString();

next.drop();
source.aggregate(
  [
    { $match: { is_expansion: { $in: ["0", "1", 0, 1] } } },
    {
      $project: {
        _id: 0,
        id: { $convert: { input: "$id", to: "int", onError: null, onNull: null } },
        name: {
          $trim: {
            input: { $convert: { input: "$name", to: "string", onError: "", onNull: "" } },
          },
        },
        yearPublished: { $convert: { input: "$yearpublished", to: "int", onError: null, onNull: null } },
        rank: { $convert: { input: "$rank", to: "int", onError: null, onNull: null } },
        bayesAverage: {
          $convert: { input: "$bayesaverage", to: "double", onError: null, onNull: null },
        },
        average: { $convert: { input: "$average", to: "double", onError: null, onNull: null } },
        usersRated: { $convert: { input: "$usersrated", to: "int", onError: null, onNull: null } },
        isExpansion: {
          $eq: [{ $convert: { input: "$is_expansion", to: "int", onError: null, onNull: null } }, 1],
        },
        abstractsRank: { $convert: { input: "$abstracts_rank", to: "int", onError: null, onNull: null } },
        cgsRank: { $convert: { input: "$cgs_rank", to: "int", onError: null, onNull: null } },
        childrensGamesRank: {
          $convert: { input: "$childrensgames_rank", to: "int", onError: null, onNull: null },
        },
        familyGamesRank: {
          $convert: { input: "$familygames_rank", to: "int", onError: null, onNull: null },
        },
        partyGamesRank: { $convert: { input: "$partygames_rank", to: "int", onError: null, onNull: null } },
        strategyGamesRank: {
          $convert: { input: "$strategygames_rank", to: "int", onError: null, onNull: null },
        },
        thematicRank: { $convert: { input: "$thematic_rank", to: "int", onError: null, onNull: null } },
        warGamesRank: { $convert: { input: "$wargames_rank", to: "int", onError: null, onNull: null } },
        updatedAt: { $literal: updatedAt },
      },
    },
    { $match: { id: { $gt: 0 }, name: { $ne: "" }, yearPublished: { $ne: null }, rank: { $ne: null }, bayesAverage: { $ne: null }, average: { $ne: null }, usersRated: { $ne: null } } },
    { $out: "_boardGamesNext" },
  ],
  { allowDiskUse: true },
);

const count = next.countDocuments();
if (count === 0 || count !== source.countDocuments()) {
  throw new Error("BGG import has invalid rows; existing catalog preserved.");
}

next.createIndex({ id: 1 }, { unique: true });
const catalog = db.getCollection("boardGames");
catalog.createIndex({ id: 1 }, { unique: true });
catalog.createIndex({ name: 1 });
next.aggregate(
  [
    { $project: { _id: 0 } },
    { $merge: { into: "boardGames", on: "id", whenMatched: "merge", whenNotMatched: "insert" } },
  ],
  { allowDiskUse: true },
);
catalog.updateMany({ thumbnail: { $exists: true } }, { $unset: { thumbnail: "" } });
next.drop();
source.drop();

print(`BGG import complete: ${count} CSV games, ${catalog.countDocuments()} catalog games.`);
