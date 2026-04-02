import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const API_URL = process.env.API_URL || "http://localhost:8000";

export async function POST(req: NextRequest) {
    const cookieStore = await cookies();
    const token = cookieStore.get("sb-access-token")?.value;
    if (!token) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Rebuild FormData for the backend
    const backendForm = new FormData();
    backendForm.append("file", file);

    const res = await fetch(`${API_URL}/api/auth/profile/avatar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: backendForm,
    });

    const text = await res.text();
    let body;
    try {
        body = JSON.parse(text);
    } catch {
        body = { error: text || `Backend error ${res.status}` };
    }

    return NextResponse.json(body, { status: res.status });
}

export async function DELETE() {
    const cookieStore = await cookies();
    const token = cookieStore.get("sb-access-token")?.value;
    if (!token) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const res = await fetch(`${API_URL}/api/auth/profile/avatar`, {
        method: "DELETE",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
    });

    const text = await res.text();
    let body;
    try {
        body = JSON.parse(text);
    } catch {
        body = { error: text || `Backend error ${res.status}` };
    }

    return NextResponse.json(body, { status: res.status });
}
