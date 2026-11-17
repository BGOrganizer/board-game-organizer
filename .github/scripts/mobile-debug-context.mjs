import { developmentApiUrl } from "./development-api-alias.mjs";

/** Debug binaries stay on the current, same-repository Development PR. */
export function mobileDebugContext({ repository, branch, sha, clerkKey }, pulls) {
  if (
    repository !== "BGOrganizer/board-game-organizer" ||
    !branch ||
    branch === "main" ||
    !/^[a-f0-9]{40}$/i.test(sha ?? "") ||
    !clerkKey?.startsWith("pk_test_") ||
    !Array.isArray(pulls)
  )
    throw new Error("Trusted Development debug context required");
  const matches = pulls.filter(
    (pr) =>
      pr?.state === "open" &&
      pr.base?.ref === "main" &&
      pr.head?.ref === branch &&
      pr.head?.repo?.full_name === repository &&
      pr.head?.sha === sha,
  );
  if (matches.length !== 1) throw new Error("Exactly one current Development PR required");
  return { number: matches[0].number, apiUrl: developmentApiUrl(matches[0].number) };
}
