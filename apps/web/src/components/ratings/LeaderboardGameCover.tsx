import { Gamepad2 } from "lucide-react";

export function LeaderboardGameCover({ imageUrl }: { imageUrl: string | null }) {
  return imageUrl ? (
    // biome-ignore lint/performance/noImgElement: BGG cover URLs are discovered at runtime.
    <img src={imageUrl} alt="" className="size-5 shrink-0 rounded object-cover" />
  ) : (
    <Gamepad2 className="size-5 shrink-0 text-default-500" aria-hidden="true" />
  );
}
