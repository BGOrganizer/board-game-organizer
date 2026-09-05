const source = db.getCollection("_bggImport");
const next = db.getCollection("_boardGamesNext");
const updatedAt = new Date().toISOString();

next.drop();
source.aggregate(
  [
    {
      $project: {
        _id: 0,
        id: { $convert: { input: "$id", to: "int", onError: null, onNull: null } },
        name: { $trim: { input: { $ifNull: ["$name", ""] } } },
        yearPublished: {
          $convert: { input: "$yearpublished", to: "int", onError: null, onNull: null },
        },
        updatedAt: { $literal: updatedAt },
      },
    },
    { $match: { id: { $ne: null }, name: { $ne: "" } } },
    {
      $set: {
        thumbnail: {
          $concat: ["https://cf.geekdo-static.com/covers/", { $toString: "$id" }, ".jpg"],
        },
      },
    },
    { $out: "_boardGamesNext" },
  ],
  { allowDiskUse: true },
);

const count = next.countDocuments();
if (count === 0) throw new Error("BGG import produced no valid games; existing catalog preserved.");

next.createIndex({ id: 1 }, { unique: true });
next.createIndex({ name: 1 });
next.renameCollection("boardGames", true);
source.drop();

print(`BGG import complete: ${count} games.`);
