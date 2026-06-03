export const addTodo = (lists, _, selectedList, input, colors) => {
    if (input.trim() === "") return lists;
    const updatedLists = [...lists];
    updatedLists[selectedList].todos.push({text: input, completed: false, colors: colors});
    return updatedLists;
};

export const deleteTodo = (lists, _, selectedList, indexToDelete) => {
    const updatedLists = [...lists];
    const todoToDelete = updatedLists[selectedList].todos[indexToDelete];
    const titleToDelete = todoToDelete.text;
    updatedLists[selectedList].todos = updatedLists[selectedList].todos.filter(
        (_, index) => index !== indexToDelete
    );
    const matches = [];
    updatedLists.forEach((list, listIndex) => {
        if (listIndex !== selectedList && list.todos && Array.isArray(list.todos)) {
            console.log(`Searching for todos matching ${titleToDelete} in ${list.name}`);
            console.log(`Todos: ${list.todos}`);
            list.todos.forEach((todo, todoIndex) => {
                if (todo.text === titleToDelete) {
                    matches.push({list, listIndex, todoIndex});
                }
            });
        }
    });
    return {
        updatedLists,
        matches, // Array of { listIndex, todoIndex } for matching todos
    };
};
export const toggleComplete = (lists, _, selectedList, indexToToggle) => {
    const updatedLists = [...lists];
    updatedLists[selectedList].todos = updatedLists[selectedList].todos.map(
        (todo, index) =>
            index === indexToToggle ? {...todo, completed: !todo.completed} : todo
    );
    return updatedLists;
};

export const deleteCompleted = (lists, _, selectedList) => {
    const updatedLists = [...lists];
    updatedLists[selectedList].todos = updatedLists[selectedList].todos.filter(
        (todo) => !todo.completed
    );
    return updatedLists;
};

export const completeAll = (lists, _, selectedList) => {
    const updatedLists = [...lists];
    updatedLists[selectedList].todos = updatedLists[selectedList].todos.map(
        (todo) => ({...todo, completed: true})
    );
    return updatedLists;
};

export const moveToTop = (lists, _, listIndex, todoIndex) => {
    const updatedLists = [...lists];
    const todos = updatedLists[listIndex].todos;
    const [todo] = todos.splice(todoIndex, 1);
    todos.unshift(todo);
    return updatedLists;
};

export const moveToBottom = (lists, _, listIndex, todoIndex) => {
    const updatedLists = [...lists];
    const todos = updatedLists[listIndex].todos;
    const [todo] = todos.splice(todoIndex, 1);
    todos.push(todo);
    return updatedLists;
};
const moveCompleted = (lists, parentIndex, listIndex, moveToTop) => {
    const updatedLists = [...lists];
    const todos = updatedLists[listIndex].todos;
    const completed = todos.filter(todo => todo.completed);
    const uncompleted = todos.filter(todo => !todo.completed);
    if (moveToTop) {
        updatedLists[listIndex].todos = [...completed, ...uncompleted];
    } else {
        updatedLists[listIndex].todos = [...uncompleted, ...completed];
    }
    return updatedLists;
}
export const moveCompletedToTop = (lists, parentIndex, listIndex) => {
    return moveCompleted(lists, parentIndex, listIndex, true);
};
export const moveCompletedToBottom = (lists, parentIndex, listIndex) => {
    return moveCompleted(lists, parentIndex, listIndex, false);
};