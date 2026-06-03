import { NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;

if (!BACKEND_URL) {
  console.log(`No backend URL set`);
}

export async function GET(request, { params }) {
  const { route } = params;
  console.log(`Fetching todos for route: ${route}`);
  const response = await fetch(`${BACKEND_URL}/${route}`);
  if (!response.ok) {
    console.error(`Backend responded with status: ${response.status}`);
    return NextResponse.json({ error: "Failed to fetch todos" }, { status: response.status });
  }
  const data = await response.json();
  return NextResponse.json(data);
}

export async function PUT(request, { params }) {
  const { route } = params;
  const body = await request.json();
  const clientId = request.headers.get("X-Client-ID");
  console.log(`Updating todos for route: ${route}`);
  const response = await fetch(`${BACKEND_URL}/${route}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Client-ID": clientId,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    console.error(`Backend responded with status: ${response.status}`);
    return NextResponse.json({ error: "Failed to update todos" }, { status: response.status });
  }
  const data = await response.json();
  return NextResponse.json(data);
}