import { NextResponse } from "next/server";
import { loadFavourites, saveFavourites, toggleFavourite } from "@/lib/discussions";
import { getOrBuildIndex, getSessionsByIds } from "@/lib/discussions-index";

export async function GET() {
  try {
    const [favourites, index] = await Promise.all([
      loadFavourites(),
      getOrBuildIndex(),
    ]);

    const sessions = getSessionsByIds(index, favourites);

    // Clean up stale favourites (IDs no longer in the index)
    const validIds = new Set(sessions.map((s) => s.sessionId));
    const cleanedFavourites = favourites.filter((id) => validIds.has(id));
    if (cleanedFavourites.length < favourites.length) {
      await saveFavourites(cleanedFavourites);
    }

    return NextResponse.json({ favourites: cleanedFavourites, sessions });
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
    const index = await getOrBuildIndex();
    const sessions = getSessionsByIds(index, favourites);
    return NextResponse.json({ favourites, sessions });
  } catch (error) {
    console.error("Error toggling favourite:", error);
    return NextResponse.json(
      { error: "Failed to toggle favourite" },
      { status: 500 }
    );
  }
}
