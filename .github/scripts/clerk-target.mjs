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

export function clerkFrontendOrigin(target, key) {
  const encodedHost = requireClerkTarget(target, key, "pk").replace(/^pk_(test|live)_/, "");
  const decodedHost = Buffer.from(encodedHost, "base64url").toString("utf8");
  const origin = `https://${decodedHost.slice(0, -1)}`;
  if (!/^[a-z\d-]+(?:\.[a-z\d-]+)+\$$/.test(decodedHost) || URL.parse(origin)?.origin !== origin) {
    throw new Error("Expected the Clerk Frontend API host");
  }
  return origin;
}
