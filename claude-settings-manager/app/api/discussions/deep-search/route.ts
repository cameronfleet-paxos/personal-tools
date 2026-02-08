import { NextRequest } from "next/server";
import { getOrBuildIndex } from "@/lib/discussions-index";
import { deepSearchProject } from "@/lib/discussions-deep-search";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const project = searchParams.get("project");
  const search = searchParams.get("search");

  if (!project) {
    return new Response(
      JSON.stringify({ error: "project parameter is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!search || search.length < 3) {
    return new Response(
      JSON.stringify({ error: "search parameter must be at least 3 characters" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const index = await getOrBuildIndex();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      try {
        for await (const event of deepSearchProject(
          project,
          search,
          request.signal,
          index
        )) {
          if (request.signal.aborted) break;

          const data = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(data));
        }
      } catch (err) {
        if (!request.signal.aborted) {
          const errorEvent = `data: ${JSON.stringify({
            type: "error",
            message: err instanceof Error ? err.message : "Unknown error",
          })}\n\n`;
          controller.enqueue(encoder.encode(errorEvent));
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
