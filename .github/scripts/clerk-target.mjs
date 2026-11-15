export function requireClerkTarget(target, value, kind) {
  if (
    !["preview", "production"].includes(target) ||
    !["pk", "sk"].includes(kind) ||
    typeof value !== "string" ||
    !value.startsWith(`${kind}_${target === "production" ? "live" : "test"}_`) ||
    value.length <= `${kind}_${target === "production" ? "live" : "test"}_`.length
  )
    throw new Error("Matching Clerk configuration required; no cross-environment fallback");
  return value;
}
