import { developmentInviteNativePath } from "@board-game-organizer/shared";

export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  return developmentInviteNativePath(path) ?? path;
}
