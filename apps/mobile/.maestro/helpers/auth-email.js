// Literal fixture identifiers must not act as regexes or select a provider button.
if (typeof AUTH_EMAIL !== "string" || !/^[^\s@]+@[^\s@]+$/.test(AUTH_EMAIL)) {
  throw new Error("A valid owned fixture AUTH_EMAIL is required");
}
if (typeof AUTH_PASSWORD !== "string" || AUTH_PASSWORD.length === 0) {
  throw new Error("Owned fixture AUTH_PASSWORD is required");
}
output.authEmailPattern = `^${AUTH_EMAIL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;
