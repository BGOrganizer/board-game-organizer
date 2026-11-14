import { z } from "zod";
import { corsJson } from "../cors";
export function badFavoriteRequest(request: Request, error = "Invalid request", status = 400) {
  return corsJson({ error }, { status }, request);
}
export function hasValidFavoriteQuery(request: Request) {
  const params = new URL(request.url).searchParams;
  return (
    protectionQuerySchema.safeParse(Object.fromEntries(params)).success &&
    params.getAll("x-vercel-protection-bypass").length <= 1
  );
}
export async function parseFavoriteJson(
  request: Request,
): Promise<{ data: unknown } | { response: Response }> {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== "application/json")
    return { response: badFavoriteRequest(request, "Content-Type must be application/json", 415) };
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 16384)
    return { response: badFavoriteRequest(request, "Request body too large", 413) };
  try {
    return { data: JSON.parse(raw) };
  } catch {
    return { response: badFavoriteRequest(request, "Invalid JSON") };
  }
}
const protectionQuerySchema = z
  .object({ "x-vercel-protection-bypass": z.string().trim().min(1).max(512).optional() })
  .strict();
