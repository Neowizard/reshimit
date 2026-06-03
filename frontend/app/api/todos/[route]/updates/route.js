import { NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;


if (!BACKEND_URL) {
    console.log(`No backend URL set`);
}

export async function GET(request, { params }) {
    const { route } = params;
    const clientId = request.headers.get("X-Client-ID");
    console.log(`Proxying SSE for route: ${route}`);

    const response = fetch(`${BACKEND_URL}/${route}/updates`, {
        headers: {
            "Accept": "text/event-stream",
            "X-Client-ID": clientId,
        },
    }).then(res => {
        if (!res.ok) {
            console.error(`Backend responded with status: ${res.status}`);
            throw new Error(`Failed to proxy SSE: ${res.status}`);
        }
        console.log(`Response from ${BACKEND_URL}/${route}/updates received`);
        return res.body;
    }).catch(err => {
        console.error("Fetch error:", err);
        throw err;
    });

    return new NextResponse(response, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    });
}