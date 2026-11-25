/** Chronological sort key for the confirmed option or the earliest proposed local start. */
export const eventListDate = {
  $ifNull: [
    {
      $dateFromString: {
        dateString: {
          $min: {
            $map: {
              input: {
                $filter: {
                  input: "$dates",
                  as: "option",
                  cond: {
                    $or: [
                      { $eq: ["$status", "PLANNING"] },
                      { $eq: ["$$option.id", "$confirmed.dateId"] },
                    ],
                  },
                },
              },
              as: "option",
              in: {
                $concat: ["$$option.day", "T", { $ifNull: ["$$option.startTime", "$startTime"] }],
              },
            },
          },
        },
        format: "%Y-%m-%dT%H:%M",
        timezone: "$timeZone",
        onError: null,
        onNull: null,
      },
    },
    { $toDate: "$createdAt" },
  ],
};
