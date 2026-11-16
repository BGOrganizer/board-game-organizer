import { isDevelopmentInviteOrigin } from "@board-game-organizer/shared";
import { z } from "zod";

const repository = "BGOrganizer/board-game-organizer";
const ownedRepo = z.object({ full_name: z.literal(repository) });
const pullRequest = z
  .object({
    number: z.number().int().positive(),
    state: z.enum(["open", "closed"]),
    merged: z.boolean(),
    base: z.object({ ref: z.literal("main"), repo: ownedRepo }),
    head: z.object({ sha: z.string().regex(/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/), repo: ownedRepo }),
  })
  .refine((pr) => (pr.state === "open" ? !pr.merged : pr.merged));
const publicRelease = z.object({
  draft: z.literal(false),
  prerelease: z.literal(true),
  tag_name: z.string(),
  target_commitish: z.string(),
  body: z.string(),
});

/** Official CI verifies the alias before publishing this public ownership receipt. */
export async function developmentInvitePublication(
  origin: string,
  cached = false,
): Promise<"eligible" | "ineligible" | "unavailable"> {
  if (!isDevelopmentInviteOrigin(origin)) return "ineligible";
  const number = origin.slice("https://api-development-pr-".length).split("-")[0];
  const tag = `development-pr-${number}`;
  try {
    const responses = await Promise.all(
      [`pulls/${number}`, `releases/tags/${tag}`].map((path) =>
        fetch(`https://api.github.com/repos/${repository}/${path}`, {
          credentials: "omit",
          redirect: "error",
          signal: AbortSignal.timeout(1500),
          ...(cached ? { next: { revalidate: 300 } } : { cache: "no-store" }),
          headers: { Accept: "application/vnd.github+json" },
        }),
      ),
    );
    if (responses.some((response) => response.status !== 200 && response.status !== 404))
      return "unavailable";
    if (responses.some((response) => response.status === 404)) return "ineligible";
    const [prBody, releaseBody] = await Promise.all(responses.map((response) => response.json()));
    const pr = pullRequest.safeParse(prBody);
    const release = publicRelease.safeParse(releaseBody);
    if (!pr.success || !release.success) return "ineligible";
    const lines = release.data.body.split("\n");
    return pr.data.number === Number(number) &&
      release.data.tag_name === tag &&
      release.data.target_commitish === pr.data.head.sha &&
      lines.includes(`<!-- bgo:development-pr=${number} -->`) &&
      lines.includes(`- **API:** [API endpoint](${origin}/)`)
      ? "eligible"
      : "ineligible";
  } catch {
    return "unavailable";
  }
}
