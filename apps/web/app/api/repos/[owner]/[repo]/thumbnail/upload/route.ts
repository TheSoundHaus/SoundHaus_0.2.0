import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const API_BASE_URL = process.env.API_URL || "http://localhost:8000";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  const { owner, repo } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get("sb-access-token")?.value;
  if (!token) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
  }

  // Forward the multipart upload to FastAPI
  const upstreamForm = new FormData();
  upstreamForm.append("file", file);

  const res = await fetch(
    `${API_BASE_URL}/repos/${owner}/${repo}/thumbnail/upload`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: upstreamForm,
    },
  );

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
