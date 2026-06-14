import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  return Response.json({ status: "ok", name: "board-game-organizer-api" });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  return Response.json({ received: body }, { status: 201 });
}
