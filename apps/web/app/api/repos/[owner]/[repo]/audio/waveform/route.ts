import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * Proxy client-side waveform peak requests to the FastAPI backend.
 * Route: GET /api/repos/[owner]/[repo]/audio/waveform?file_path=...&ref=...&resolution=...
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ owner: string; repo: string }> }
) {
    const { owner, repo } = await params;
    const { searchParams } = request.nextUrl;

    const filePath = searchParams.get("file_path");
    const ref = searchParams.get("ref");
    const resolution = searchParams.get("resolution") || "1024";

    if (!filePath) {
        return NextResponse.json(
            { error: "file_path query parameter is required" },
            { status: 400 }
        );
    }

    const API_BASE_URL = process.env.API_URL || "http://localhost:8000";
    const backendUrl = new URL(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/audio/waveform`,
        API_BASE_URL
    );
    backendUrl.searchParams.set("file_path", filePath);
    if (ref) backendUrl.searchParams.set("ref", ref);
    backendUrl.searchParams.set("resolution", resolution);

    // Forward the auth token from cookies
    const cookieStore = await cookies();
    const token = cookieStore.get("sb-access-token")?.value;

    const headers: Record<string, string> = {};
    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    try {
        const backendRes = await fetch(backendUrl.toString(), { headers });

        if (!backendRes.ok) {
            const text = await backendRes.text();
            return NextResponse.json(
                { error: text || `Backend returned ${backendRes.status}` },
                { status: backendRes.status }
            );
        }

        const data = await backendRes.json();
        return NextResponse.json(data);
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Failed to fetch waveform" },
            { status: 502 }
        );
    }
}
