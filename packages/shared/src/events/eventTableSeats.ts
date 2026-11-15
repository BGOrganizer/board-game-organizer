export type TableSeatUser = {
  id: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  secondary?: string | null;
};
export type TableSeat = { index: number; user?: TableSeatUser; reserved: boolean };

/** Anonymous places, not physical seat assignments. A local hint retains the clicked row. */
export function eventTableSeats({
  users,
  reservedCount,
  maxPlayers,
  limit,
  pin,
}: {
  users: readonly TableSeatUser[];
  reservedCount: number;
  maxPlayers: number;
  limit: number;
  pin?: { userId: string; index: number };
}): TableSeat[] {
  const known = [...new Map(users.map((user) => [user.id, user])).values()];
  const occupied = new Map<number, TableSeatUser>();
  const pinned =
    pin && Number.isInteger(pin.index) && pin.index >= 0 && pin.index < maxPlayers
      ? known.find((user) => user.userId === pin.userId)
      : undefined;
  if (pin && pinned) occupied.set(pin.index, pinned);
  let index = 0;
  for (const user of known) {
    if (user === pinned) continue;
    while (occupied.has(index)) index++;
    occupied.set(index++, user);
  }
  let hidden = Math.max(0, reservedCount - known.length);
  return Array.from({ length: Math.max(0, Math.min(maxPlayers, limit)) }, (_, seat) => {
    const user = occupied.get(seat);
    const reserved = Boolean(user) || hidden > 0;
    if (!user && hidden > 0) hidden--;
    return { index: seat, user, reserved };
  });
}
