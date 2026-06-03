"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL


if (!BACKEND_URL) {
    console.log(`No backend URL set`);
} else {
    console.log(`Backend URL: ${BACKEND_URL}`)
}
export default function Home() {
    const router = useRouter();

    useEffect(() => {
        console.log("Fetching new route...");
        fetch(`${BACKEND_URL}/new`)
            .then((res) => {
                console.log("Status:", res.status);
                if (!res.ok) {
                    throw new Error(`HTTP error! Status: ${res.status}`);
                }
                return res.json();
            })
            .then((data) => {
                console.log("New route:", data.route);
                router.push(`/${data.route}`);
            })
            .catch((err) => {
                console.error("Fetch failed:", err);
                console.error("Error name:", err.name);
                console.error("Error message:", err.message);
            });
    }, [router]);

    return <div>Redirecting...</div>;
}