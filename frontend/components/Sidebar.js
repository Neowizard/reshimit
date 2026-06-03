"use client";
import {useState, useEffect} from "react";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;
if (!BACKEND_URL) {
    console.log(`No backend URL set`);
}

export default function Sidebar({
                                    lists,
                                    setLists,
                                    selectedList,
                                    setSelectedList,
                                    isSidebarOpen,
                                    setIsSidebarOpen,
                                    route,
                                    clientId,
                                    onListAdded,
                                }) {
    const [listInput, setListInput] = useState("");

    useEffect(() => {
        console.log(`Loading selected list from local storage at selectedList_${route}`);
        const storedSelectedList = localStorage.getItem(`selectedList_${route}`);
        console.log(`Local storage data: ${storedSelectedList}`)
        if (storedSelectedList !== null && lists && lists.length > 0) {
            const parsedIndex = parseInt(storedSelectedList, 10);
            if (parsedIndex >= 0 && parsedIndex < lists.length) {
                setSelectedList(parsedIndex);
            } else {
                setSelectedList(0);
            }
        }
    }, [route, lists, setSelectedList]);

    useEffect(() => {
        console.log(`Saving selected list ${selectedList.toString()} to local storage`);
        localStorage.setItem(`selectedList_${route}`, selectedList.toString());
    }, [selectedList]);

    const saveToBackend = async (updatedLists) => {
        console.log("Saving to backend:", updatedLists);
        try {
            const response = await fetch(`/api/todos/${route}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "X-Client-ID": clientId,
                },
                body: JSON.stringify(updatedLists),
            });
            if (!response.ok) {
                throw new Error(`Failed to save: ${response.status}`);
            }
        } catch (err) {
            console.error("Save error:", err);
        }
    };

    const addList = () => {
        console.log("Adding list, current lists:", lists);
        if (listInput.trim() === "") return;
        if (!Array.isArray(lists)) {
            console.error("lists is not an array:", lists);
            return;
        }
        const updatedLists = [...lists, {name: listInput, todos: []}];
        setLists(updatedLists);
        console.log("New lists:", updatedLists);
        setSelectedList(updatedLists.length - 1);
        setListInput("");
        saveToBackend(updatedLists);
        if (onListAdded) onListAdded();
    };

    const importList = (indexToImport) => {
        if (indexToImport === selectedList) return;
        console.log(`Importing from list ${indexToImport} to ${selectedList}`);
        const updatedLists = [...lists];
        const todosToImport = [...lists[indexToImport].todos];
        updatedLists[selectedList].todos = [
            ...updatedLists[selectedList].todos,
            ...todosToImport,
        ];
        setLists(updatedLists);
        saveToBackend(updatedLists);
    };

    const deleteList = (indexToDelete) => {
        console.log(`Deleting list at index ${indexToDelete}`);
        if (!Array.isArray(lists) || lists.length <= 1) {
            console.log("Cannot delete the last list");
            return;
        }
        const updatedLists = lists.filter((_, index) => index !== indexToDelete);
        if (indexToDelete === selectedList) {
            setSelectedList(0);
        } else if (indexToDelete < selectedList) {
            setSelectedList(selectedList - 1);
        }
        setLists(updatedLists);
        saveToBackend(updatedLists);
    };

    return (
        <div
            className={`w-full md:w-1/4 bg-gray-200 p-4 ${
                isSidebarOpen ? "block" : "hidden md:block"
            }`}
        >
            <h2 className="text-xl font-bold mb-4">Todo Lists</h2>
            <div className="flex flex-col sm:flex-row gap-2 mb-4">
                <input
                    type="text"
                    value={listInput}
                    onChange={(e) => setListInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") addList();
                    }}
                    placeholder="New list name"
                    className="flex-1 p-2 border rounded text-base min-w-5"
                />
                <button
                    onClick={addList}
                    className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-base"
                >
                    Add
                </button>
            </div>
            <ul className="space-y-2">
                {lists && Array.isArray(lists) && lists.length > 0 ? (
                    lists.map((list, index) => (
                        <li
                            key={index}
                            className={`flex justify-between items-center p-2 rounded text-base ${
                                selectedList === index ? "bg-blue-500 text-white" : "bg-gray-100"
                            }`}
                        >
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => deleteList(index)}
                                    className={`text-sm w-5 h-5 flex items-center justify-center rounded-full ${
                                        selectedList === index ? "text-white" : "text-red-500 hover:text-red-700"
                                    }`}
                                    title="Delete list"
                                >
                                    X
                                </button>
                            </div>
                            <span
                                onClick={() => {
                                    setSelectedList(index);
                                    setIsSidebarOpen(false);
                                }}
                                className="flex-1 cursor-pointer"
                            >
                {list.name}
              </span>
                            <button
                                onClick={() => importList(index)}
                                disabled={index === selectedList}
                                className={`px-2 py-1 rounded text-sm ${
                                    index === selectedList
                                        ? "bg-gray-400 cursor-not-allowed text-white"
                                        : "bg-yellow-500 hover:bg-yellow-600 active:bg-yellow-700 text-black"
                                }`}
                            >
                                Import
                            </button>
                        </li>
                    ))
                ) : (
                    <li>No lists available</li>
                )}
            </ul>
        </div>
    );
}
