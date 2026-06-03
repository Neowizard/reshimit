"use client";
import { useState, useRef, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import Sidebar from "../../components/Sidebar";
import TodoList from "../../components/TodoList";
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;

if (!BACKEND_URL) {
    console.log(`No backend URL set`);
} else {
    console.log(`Backend URL: ${BACKEND_URL}`)
}
export default function TodoPage({ params }) {
    const [lists, setLists] = useState([]);
    const [selectedList, setSelectedList] = useState(0);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [clientId] = useState(uuidv4());
    const inputRef = useRef(null);
    const { route } = params;

    const fetchTodos = async () => {
        console.log(`Fetching lists from: ${BACKEND_URL}/${route}`);
        try {
            const res = await fetch(`${BACKEND_URL}/${route}`);
            if (!res.ok) throw new Error(`Failed to fetch lists: ${res.status}`);
            const data = await res.json();
            console.log("Fetched lists:", data);
            setLists(data || []);
            if (selectedList >= data.length) {
                setSelectedList(0);
            }
        } catch (err) {
            console.error(`Failed to fetch lists ${route}:`, err);
            setLists([]);
        }
    };

    useEffect(() => {
        fetchTodos();

        const source = new EventSource(`${BACKEND_URL}/${route}/updates?client_id=${clientId}`);

        source.onopen = () => {
            console.log("SSE connection opened");
        };

        source.onmessage = (event) => {
            console.log(`Received SSE: ${event.data}`); // Debug raw data
            try {
                const message = JSON.parse(event.data);
                const { clientID } = message;
                if (clientID !== clientId) {
                    console.log(`Update from ${clientID}, fetching new data...`);
                    fetchTodos();
                } else {
                    console.log("Ignoring update from self");
                }
            } catch (e) {
                console.error("Parse error:", e, "Raw data:", event.data);
            }
        };

        source.onerror = (err) => {
            console.error("SSE error:", err);
            // Optional: source.close() or retry logic
        };

        return () => {
            source.close();
            console.log("SSE connection closed");
        };
    }, [route, clientId]);

    if (lists.length === 0) {
        return <div>Loading...</div>;
    }

    return (
        <div className="flex flex-col md:flex-row min-h-screen">
            <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="md:hidden p-2 bg-gray-300 text-black rounded m-4"
            >
                {isSidebarOpen ? "Close" : "Menu"}
            </button>
            <Sidebar
                lists={lists}
                setLists={setLists}
                selectedList={selectedList}
                setSelectedList={setSelectedList}
                isSidebarOpen={isSidebarOpen}
                setIsSidebarOpen={setIsSidebarOpen}
                route={route}
                clientId={clientId}
                onListAdded={() => inputRef.current?.focus()}
            />
            <TodoList
                lists={lists}
                setLists={setLists}
                selectedList={selectedList}
                inputRef={inputRef}
                route={route}
                clientId={clientId}
            />
        </div>
    );
}