// DATE is MM/DD/YYYY. Read Android's actual displayed English month, not host time.
const parts = /^([0-9]{2})\/([0-9]{2})\/([0-9]{4})$/.exec(DATE);
if (!parts) throw new Error("Event fixture DATE must be MM/DD/YYYY");
const month = Number(parts[1]);
const day = Number(parts[2]);
const year = Number(parts[3]);
const date = new Date(Date.UTC(year, month - 1, day));
if (
  year < 2000 ||
  date.getUTCFullYear() !== year ||
  date.getUTCMonth() !== month - 1 ||
  date.getUTCDate() !== day
) {
  throw new Error("Event fixture DATE is not a valid calendar date");
}
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const displayed = months.findIndex((name) =>
  new RegExp(`\\b${name}(?:[a-z]+)?\\b`).test(maestro.copiedText),
);
if (displayed < 0) throw new Error("Native date picker must expose an English calendar month");
output.eventCalendarYear = parts[3];
output.eventCalendarMonthOffset = month - 1 - displayed;
const fullMonths = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
output.eventCalendarDay = `${day} ${fullMonths[month - 1]} ${year}`;
