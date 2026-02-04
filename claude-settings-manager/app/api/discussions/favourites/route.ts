import { NextResponse } from "next/server";
import { loadFavourites, toggleFavourite } from "@/lib/discussions";

export async function GET() {
  try {
    const favourites = await loadFavourites();
    return NextResponse.json({ favourites });
  } catch (error) {
    console.error("Error loading favourites:", error);
    return NextResponse.json(
      { error: "Failed to load favourites" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sessionId } = body;

    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 }
      );
    }

    const favourites = await toggleFavourite(sessionId);
    return NextResponse.json({ favourites });
  } catch (error) {
    console.error("Error toggling favourite:", error);
    return NextResponse.json(
      { error: "Failed to toggle favourite" },
      { status: 500 }
    );
  }
}
