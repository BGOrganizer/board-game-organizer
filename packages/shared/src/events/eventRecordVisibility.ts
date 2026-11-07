/** Legacy Events inherit their Group's access, never its scheduling rules from this field. */
export function eventRecordVisibility(
  event: { visibility?: "PRIVATE" | "PUBLIC" },
  groupType: "PRIVATE" | "PUBLIC" | null,
): "PRIVATE" | "PUBLIC" {
  return groupType === "PUBLIC" && event.visibility !== "PRIVATE" ? "PUBLIC" : "PRIVATE";
}
