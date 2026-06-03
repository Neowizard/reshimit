"use client";
import {useState, useRef, useEffect} from "react";
import {
    addTodo,
    deleteTodo,
    toggleComplete,
    deleteCompleted,
    moveToBottom,
    moveToTop,
    moveCompletedToBottom,
    moveCompletedToTop,
} from "../lib/todoUtils";
import {usePathname} from "next/navigation";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;
if (!BACKEND_URL) {
    console.log(`No backend URL set`);
}


export default function TodoList({lists, setLists, selectedList, inputRef, route, clientId}) {
    const pathname = usePathname().substring(1);
    const isLTR = pathname?.startsWith('LTR') || false;

    const AVAILABLE_COLORS = [
        {name: 'red', value: 'bg-red-600', customName: isLTR ? 'red' : 'אדום'},
        {name: 'pink', value: 'bg-pink-400', customName: isLTR ? 'pink' : 'ורוד'},
        {name: 'purple', value: 'bg-purple-800', customName: isLTR ? 'purple' : 'סגול'},
        {name: 'blue', value: 'bg-blue-800', customName: isLTR ? 'blue' : 'כחול'},
        {name: 'teal', value: 'bg-teal-400', customName: isLTR ? 'teal' : 'טורקיז'},
        {name: 'green', value: 'bg-green-600', customName: isLTR ? 'green' : 'ירוק'},
        {name: 'yellow', value: 'bg-yellow-300', customName: isLTR ? 'yellow' : 'צהוב'},
        {name: 'white', value: 'bg-white', customName: isLTR ? 'white' : 'לבן'},
    ];

    const [input, setInput] = useState("");
    const [editingIndex, setEditingIndex] = useState(null);
    const [editingText, setEditingText] = useState("");
    const [colorPickerIndex, setColorPickerIndex] = useState(null);
    const [renameMenuOpen, setRenameMenuOpen] = useState(false);

    const [filterColors, setFilterColors] = useState(() => {
        const saved = localStorage.getItem(`filterColors_${route}`);
        return saved ? JSON.parse(saved) : [];
    });
    const [filterMode, setFilterMode] = useState(() => {
        const saved = localStorage.getItem(`filterMode_${route}`);
        return saved || "any";
    });
    const colorPickerRef = useRef(null);
    const renameMenuRef = useRef(null);

    useEffect(() => {
        const updatedLists = [...lists];
        if (!updatedLists[selectedList].colorNames) {
            updatedLists[selectedList].colorNames = AVAILABLE_COLORS.reduce((acc, color) => {
                acc[color.name] = color.customName;
                return acc;
            }, {});
            setLists(updatedLists);
            saveToBackend(updatedLists);
        }
    }, [selectedList, lists]);

    useEffect(() => {
        localStorage.setItem(`filterColors_${route}`, JSON.stringify(filterColors));
        localStorage.setItem(`filterMode_${route}`, filterMode);
    }, [filterColors, filterMode, route]);

    const saveToBackend = async (updatedLists) => {
        console.log("Saving to backend:", updatedLists);

        try {
            const response = await fetch(`${BACKEND_URL}/${route}`, {
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

    const handleAddTodo = () => {
        console.log("Adding todo:", input);
        const updatedLists = addTodo(lists, null, selectedList, input, ['white']);
        setLists(updatedLists);
        console.log("Updated lists:", updatedLists);
        setInput("");
        inputRef.current.focus();
        saveToBackend(updatedLists);
    };

    const handleSaveEdit = (index) => {
        console.log(`Saving edit for ${index}`);
        if (editingText.trim() === "") return;
        const updatedLists = [...lists];
        updatedLists[selectedList].todos[index].text = editingText;
        setLists(updatedLists);
        setEditingIndex(null);
        setEditingText("");
        saveToBackend(updatedLists);
    };

    const toggleColor = (index, color) => {
        const updatedLists = [...lists];
        const todo = updatedLists[selectedList].todos[index];
        const currentColors = new Set(todo.colors);

        if (currentColors.has(color)) {
            currentColors.delete(color);
        } else {
            currentColors.add(color);
        }

        todo.colors = Array.from(currentColors);
        setLists(updatedLists);
        saveToBackend(updatedLists);
    };

    const clearColor = (index, color) => {
        const updatedLists = [...lists];
        const todo = updatedLists[selectedList].todos[index];
        todo.colors = Array.from([]);
        setLists(updatedLists);
        saveToBackend(updatedLists);
    };

    const cancelEdit = () => {
        setEditingIndex(null);
        setEditingText("");
    };

    const handleDeleteTodo = (index) => {
        const {updatedLists, matches} = deleteTodo(lists, null, selectedList, index);

        if (matches.length > 0) {
            const todoText = matches[0].list.todos[matches[0].todoIndex].text;
            const matchingListNames = matches.map(match => `- ${match.list.name}\n`);
            const confirmDelete = window.confirm(
                `Found ${matches.length} other todo(s) with the title "${todoText}" in other lists: \n${matchingListNames}. Delete them too?`
            );
            if (confirmDelete) {
                matches.forEach(({_, listIndex, todoIndex}) => {
                    updatedLists[listIndex].todos = updatedLists[listIndex].todos.filter(
                        (_, idx) => idx !== todoIndex
                    );
                });
            }
        }

        setLists(updatedLists);
        saveToBackend(updatedLists);
    };

    const toggleColorPicker = (index) => {
        setColorPickerIndex(colorPickerIndex === index ? null : index);
    };

    const toggleFilterColor = (color) => {
        setFilterColors((prev) =>
            prev.includes(color)
                ? prev.filter(c => c !== color)
                : [...prev, color]
        );
    };

    const clearFilters = () => {
        setFilterColors([]);
    };

    const toggleFilterMode = () => {
        setFilterMode((prev) => (prev === "any" ? "all" : "any"));
    };

    const toggleRenameMenu = () => {
        setRenameMenuOpen(prev => !prev);
    };

    const handleRenameColor = (colorName, newName) => {
        const updatedLists = [...lists];
        updatedLists[selectedList].colorNames = {
            ...updatedLists[selectedList].colorNames,
            [colorName]: newName,
        };
        setLists(updatedLists);
        saveToBackend(updatedLists);
    };

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (renameMenuRef.current && !renameMenuRef.current.contains(event.target)) {
                setRenameMenuOpen(false);
            }
            if (colorPickerRef.current && !colorPickerRef.current.contains(event.target)) {
                setColorPickerIndex(null);
            }
        };

        if (renameMenuOpen || colorPickerIndex !== null) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [renameMenuOpen, colorPickerIndex]);

    const getColorSwatch = (colors) => {
        if (!colors || colors.length === 0) {
            return (
                <div className="w-5 h-5 flex items-center justify-center text-white text-xs bg-gray-500 rounded" title="None"></div>
            );
        }
        colors = colors.sort()
        const colorClasses = colors.slice(0, 5).map(color => {
            const colorObj = AVAILABLE_COLORS.find(c => c.name === color);
            return colorObj ? colorObj.value : 'bg-gray-400';
        });
        const colorTitles = colors.slice(0, 5).map(color => lists[selectedList]?.colorNames?.[color] || color).join(', ');

        if (colorClasses.length > 4) {
            return (
                <div className="w-5 h-5 flex items-center justify-center text-xs" title={colorTitles}>🌈</div>
            );
        }

        return (
            <div className="w-5 h-5 relative" title={colorTitles}>
                {colorClasses.map((colorClass, idx) => {
                    let clipPath;
                    switch (colorClasses.length) {
                        case 1:
                            clipPath = 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)';
                            break;
                        case 2:
                            clipPath = idx === 0
                                ? 'polygon(0% 0%, 0% 50%, 100% 50%, 100% 0%)'
                                : 'polygon(0% 50%, 0% 100%, 100% 100%, 100% 50%)';
                            break;
                        case 3:
                            clipPath = idx === 0
                                ? 'polygon(0% 0%, 33% 0%, 33% 100%, 0% 100%)'
                                : idx === 1
                                    ? 'polygon(33% 0%, 66% 0%, 66% 100%, 33% 100%)'
                                    : 'polygon(66% 0%, 100% 0%, 100% 100%, 66% 100%)';
                            break;
                        case 4:
                            clipPath = idx === 0
                                ? 'polygon(0% 0%, 50% 50%, 0% 100%)'
                                : idx === 1
                                    ? 'polygon(100% 0%, 50% 50%, 100% 100%)'
                                    : idx === 2
                                        ? 'polygon(0% 0%, 50% 50%, 100% 0%)'
                                        : 'polygon(0% 100%, 50% 50%, 100% 100%)';
                            break;
                        default:
                            clipPath = 'circle(50%)';
                    }
                    return (
                        <div
                            key={idx}
                            className={`${colorClass} absolute inset-0`}
                            style={{
                                clipPath,
                                border: '1px solid rgba(0,0,0,0.1)',
                            }}
                        />
                    );
                })}
            </div>
        );
    };

    if (!lists || !Array.isArray(lists) || lists.length === 0) {
        return <div>No todos yet</div>;
    }

    const hasCompleted = lists[selectedList]?.todos.some((todo) => todo.completed) || false;

    const filteredTodos = filterColors.length === 0
        ? lists[selectedList].todos
        : lists[selectedList].todos.filter(todo => {
            const todoColors = todo.colors || [];
            if (filterMode === "any") {
                return filterColors.some(color => todoColors.includes(color));
            } else { // "all"
                return filterColors.every(color => todoColors.includes(color));
            }
        });

    return (
        <div className="w-full md:w-3/4 p-4 md:p-10">
            <div className="flex flex-wrap items-center gap-2 mb-6">
                <h1 className="text-2xl md:text-3xl font-bold flex-1 min-w-0">
                    {lists[selectedList]?.name || "Loading..."}
                </h1>
                <div className="flex gap-1 flex-wrap items-center">
                    <button
                        onClick={clearFilters}
                        className="w-5 h-5 bg-gray-400 text-red-600 rounded-full border border-gray-700 flex items-center justify-center hover:bg-gray-300 active:bg-gray-200"
                        title="Clear Filters"
                    >
                        <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                            <line x1="3" y1="0" x2="17" y2="20" stroke="currentColor" stroke-width="2"/>
                            <line x1="17" y1="0" x2="3" y2="20" stroke="currentColor" stroke-width="2"/>
                        </svg>
                    </button>
                    {AVAILABLE_COLORS.map((color) => (
                        <button
                            key={color.name}
                            onClick={() => toggleFilterColor(color.name)}
                            className={`w-5 h-5 rounded-full border border-gray-600 ${color.value} ${
                                filterColors.includes(color.name)
                                    ? 'opacity-100'
                                    : 'opacity-50 hover:opacity-75'
                            }`}
                            title={lists[selectedList]?.colorNames?.[color.name]}
                        />
                    ))}

                    <div className="relative inline-block">
                        <button
                            onClick={toggleRenameMenu}
                            className="w-5 h-5 bg-gray-400 rounded-full border border-gray-700 flex items-center justify-center hover:bg-gray-300 active:bg-gray-200 ml-2"
                            title="Rename Colors"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                        </button>
                        {renameMenuOpen && (
                            <div
                                ref={renameMenuRef}
                                className="absolute top-full left-0 mt-2 bg-white rounded shadow-lg p-2 z-20 w-64"
                            >
                                {AVAILABLE_COLORS.map((color) => (
                                    <div key={color.name} className="flex items-center gap-2 mb-2">
                                        <div className={`w-5 h-5 rounded-full ${color.value}`}></div>
                                        <input
                                            type="text"
                                            value={lists[selectedList]?.colorNames?.[color.name]}
                                            onChange={(e) => handleRenameColor(color.name, e.target.value)}
                                            className="flex-1 p-1 border rounded text-sm"
                                            placeholder={color.name}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") setRenameMenuOpen(false);
                                            }}
                                        />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <button
                        onClick={toggleFilterMode}
                        className="px-2 py-1 bg-gray-500 text-white rounded hover:bg-gray-600 active:bg-gray-700 text-sm"
                    >
                        {filterMode === "any" ? "Any" : "All"}
                    </button>
                </div>
            </div>
            <div className="flex flex-row gap-2 mb-4 m-2">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddTodo();
                    }}
                    placeholder="Add a new task"
                    className="m-0 flex-1 p-2 border rounded text-base min-w-10"
                    ref={inputRef}
                />
                <div className="flex gap-2">
                    <button
                        onClick={handleAddTodo}
                        className="px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600 active:bg-green-700 text-base"
                    >
                        Add
                    </button>
                    <button
                        onClick={() => {
                            const updatedLists = deleteCompleted(lists, null, selectedList);
                            setLists(updatedLists);
                            saveToBackend(updatedLists);
                        }}
                        disabled={!hasCompleted}
                        className={`overlap-button px-4 py-1 text-white rounded text-base ${
                            hasCompleted
                                ? "bg-red-500 hover:bg-red-600 active:bg-red-700"
                                : "bg-red-300 cursor-not-allowed"
                        }`}
                    >
                        <span className="x1">╳</span>
                        <span className="x2">╳</span>

                    </button>
                    <button
                        onClick={() => {
                            const updatedLists = moveCompletedToTop(lists, null, selectedList);
                            setLists(updatedLists);
                            saveToBackend(updatedLists);
                        }}
                        disabled={!hasCompleted}
                        className={`px-1 py-2  text-white rounded text-base ${
                            hasCompleted
                                ? "bg-blue-500 hover:bg-blue-600 active:bg-blue-700"
                                : "bg-blue-300 cursor-not-allowed"
                        }`}
                    >
                        ↟
                    </button>
                    <button
                        onClick={() => {
                            const updatedLists = moveCompletedToBottom(lists, null, selectedList);
                            setLists(updatedLists);
                            saveToBackend(updatedLists);
                        }}
                        disabled={!hasCompleted}
                        className={`px-1 py-2  text-white rounded text-base ${
                            hasCompleted
                                ? "bg-blue-500 hover:bg-blue-600 active:bg-blue-700"
                                : "bg-blue-300 cursor-not-allowed"
                        }`}
                    >
                        ↡
                    </button>
                </div>
            </div>
            <ul className="space-y-2 overflow-y-auto max-h-[calc(100vh-200px)]">
                {lists[selectedList].todos.map((todo, index) => (
                    filteredTodos.includes(todo) &&
                    <li
                        key={index}
                        className="flex flex-row justify-between items-center p-2 bg-gray-100 rounded relative"
                    >
                        {editingIndex === index ? (
                            <div className="flex-1 flex flex-row items-start sm:items-center gap-2 w-full">
                                <input
                                    type="text"
                                    value={editingText}
                                    onChange={(e) => setEditingText(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") handleSaveEdit(index);
                                        if (e.key === "Escape") cancelEdit();
                                    }}
                                    className="flex-1 p-2 border rounded text-base"
                                    autoFocus
                                />
                                <div className="flex gap-2 mt-0">
                                    <button
                                        onClick={() => handleSaveEdit(index)}
                                        className="px-3 py-2 bg-green-500 text-white rounded hover:bg-green-600 active:bg-green-700 text-base"
                                    >
                                        Save
                                    </button>
                                    <button
                                        onClick={cancelEdit}
                                        className="px-3 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 active:bg-gray-700 text-base"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="flex flex-row items-center gap-2">
                                    <button
                                        onClick={() => {
                                            const updatedLists = toggleComplete(lists, null, selectedList, index);
                                            setLists(updatedLists);
                                            saveToBackend(updatedLists);
                                        }}
                                        className={`px-2 py-1  text-white rounded  text-base ${
                                            todo.completed
                                                ? "bg-pink-500 hover:bg-pink-600 active:bg-pink-700"
                                                : "bg-green-500 hover:bg-green-600 active:bg-green-700"
                                        }`}
                                    >
                                        {todo.completed ? "↶" : "✓"}
                                    </button>
                                    <span
                                        onClick={() => {
                                            setEditingIndex(index);
                                            setEditingText(todo.text);
                                        }}
                                        className={`flex-1 cursor-pointer text-base text-black ${
                                            todo.completed ? "line-through text-gray-400" : ""
                                        }`}
                                    >
                                        {todo.text}
                                    </span>
                                </div>

                                <div className="flex gap-2 items-center relative">
                                    <button
                                        onClick={() => toggleColorPicker(index)}
                                        className="p-1 bg-gray-500 rounded hover:bg-gray-600 active:bg-gray-700"
                                    >
                                        {getColorSwatch(todo.colors)}
                                    </button>
                                    {colorPickerIndex === index && (
                                        <div
                                            ref={colorPickerRef}
                                            className="absolute top-1/2 left-0 translate-x-[125px] -translate-y-1/2 ml-2 rounded shadow-lg p-1 bg-white z-20 flex flex-row gap-1"
                                        >
                                            {AVAILABLE_COLORS.map((colorNameValue) => (
                                                <button
                                                    key={colorNameValue.name}
                                                    onClick={() => toggleColor(index, colorNameValue.name)}
                                                    className={`w-5 h-5 rounded-full border border-gray-600 ${colorNameValue.value} ${
                                                        (todo.colors || ['white']).includes(colorNameValue.name)
                                                            ? 'opacity-100'
                                                            : 'opacity-25 hover:opacity-75'
                                                    }`}
                                                    title={lists[selectedList]?.colorNames?.[colorNameValue.name] || colorNameValue.name}
                                                />
                                            ))}
                                            <button
                                                onClick={() => clearColor(index)}
                                                className="w-5 h-5 bg-gray-400 text-red-600 rounded-full border border-gray-700 flex items-center justify-center hover:bg-gray-300 active:bg-gray-200 text-xl"
                                                title="Clear Colors"
                                            >
                                                <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                                                    <line x1="3" y1="0" x2="17" y2="20" stroke="currentColor" stroke-width="2"/>
                                                    <line x1="17" y1="0" x2="3" y2="20" stroke="currentColor" stroke-width="2"/>
                                                </svg>
                                            </button>
                                        </div>
                                    )}
                                    <button
                                        onClick={() => handleDeleteTodo(index)}
                                        className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 active:bg-red-700 text-base"
                                    >
                                        X
                                    </button>
                                    <button
                                        onClick={() => {
                                            const updatedLists = moveToTop(lists, null, selectedList, index);
                                            setLists(updatedLists);
                                            saveToBackend(updatedLists);
                                        }}
                                        className="px-1 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 active:bg-blue-700 text-base"
                                    >
                                        ↑
                                    </button>
                                    <button
                                        onClick={() => {
                                            const updatedLists = moveToBottom(lists, null, selectedList, index);
                                            setLists(updatedLists);
                                            saveToBackend(updatedLists);
                                        }}
                                        className="px-1 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 active:bg-blue-700 text-base"
                                    >
                                        ↓
                                    </button>
                                </div>
                            </>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}
