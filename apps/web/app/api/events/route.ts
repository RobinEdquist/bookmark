import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy SSE endpoint from backend with proper streaming support.
 * Next.js rewrites buffer responses which breaks SSE - this route handler
 * properly streams the response.
 */
export async function GET(request: NextRequest) {
  // Get session cookie for authentication
  const sessionToken = request.cookies.get("better-auth.session_token");

  if (!sessionToken?.value) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Connect to backend SSE endpoint
    const response = await fetch(
      `${process.env.API_URL || "http://localhost:3000"}/api/events`,
      {
        method: "GET",
        headers: {
          Accept: "text/event-stream",
          Connection: "keep-alive",
          "Cache-Control": "no-cache",
          // Forward session cookie for authentication
          Cookie: `better-auth.session_token=${sessionToken.value}`,
        },
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to connect to events stream" },
        { status: response.status }
      );
    }

    if (!response.body) {
      return NextResponse.json(
        { error: "No response body from backend" },
        { status: 500 }
      );
    }

    // Create a TransformStream to pass through the response
    const { readable, writable } = new TransformStream();

    // Pipe backend response to client
    response.body.pipeTo(writable);

    // Return streaming response with SSE headers
    return new NextResponse(readable, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no", // Disable buffering in nginx/proxies
      },
    });
  } catch (error) {
    console.error("SSE proxy error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Use Node.js runtime for proper streaming support
export const runtime = "nodejs";

// Disable static generation
export const dynamic = "force-dynamic";
