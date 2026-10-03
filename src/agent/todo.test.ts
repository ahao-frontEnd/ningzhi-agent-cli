import { processTodoCalls, formatTodoListForPrompt } from "./todo";

describe("processTodoCalls", () => {
  describe("create_todo_list", () => {
    it("creates a todo list from string items", () => {
      const result = processTodoCalls(
        [
          {
            id: "call-1",
            name: "create_todo_list",
            args: { items: ["Step 1", "Step 2", "Step 3"] },
          },
        ],
        null,
      );

      expect(result.todoList).toHaveLength(3);
      expect(result.todoList![0]).toEqual({
        id: 0,
        content: "Step 1",
        status: "pending",
      });
      expect(result.todoList![1]).toEqual({
        id: 1,
        content: "Step 2",
        status: "pending",
      });
      expect(result.todoList![2]).toEqual({
        id: 2,
        content: "Step 3",
        status: "pending",
      });
      expect(result.messages[0].content).toBe(
        "Todo list created successfully.",
      );
    });

    it("trims item contents", () => {
      const result = processTodoCalls(
        [
          {
            id: "call-1",
            name: "create_todo_list",
            args: { items: ["  Step 1  "] },
          },
        ],
        null,
      );

      expect(result.todoList![0].content).toBe("Step 1");
    });

    it("returns error for empty items", () => {
      const result = processTodoCalls(
        [
          {
            id: "call-1",
            name: "create_todo_list",
            args: { items: [] },
          },
        ],
        null,
      );

      expect(result.todoList).toBeNull();
      expect(result.messages[0].content).toContain("Error");
    });

    it("returns error for missing items", () => {
      const result = processTodoCalls(
        [
          {
            id: "call-1",
            name: "create_todo_list",
            args: {},
          },
        ],
        null,
      );

      expect(result.todoList).toBeNull();
      expect(result.messages[0].content).toContain("Error");
    });
  });

  describe("update_todo_status", () => {
    it("updates item status", () => {
      const todoList = [
        { id: 0, content: "Step 1", status: "pending" as const },
        { id: 1, content: "Step 2", status: "pending" as const },
      ];

      const result = processTodoCalls(
        [
          {
            id: "call-1",
            name: "update_todo_status",
            args: { index: 0, status: "completed" },
          },
        ],
        todoList,
      );

      expect(result.todoList![0].status).toBe("completed");
      expect(result.todoList![1].status).toBe("pending");
      expect(result.messages[0].content).toBe(
        "Todo item 0 updated to completed.",
      );
    });

    it("updates to in_progress", () => {
      const todoList = [
        { id: 0, content: "Step 1", status: "pending" as const },
      ];

      const result = processTodoCalls(
        [
          {
            id: "call-1",
            name: "update_todo_status",
            args: { index: 0, status: "in_progress" },
          },
        ],
        todoList,
      );

      expect(result.todoList![0].status).toBe("in_progress");
    });

    it("updates to failed", () => {
      const todoList = [
        { id: 0, content: "Step 1", status: "pending" as const },
      ];

      const result = processTodoCalls(
        [
          {
            id: "call-1",
            name: "update_todo_status",
            args: { index: 0, status: "failed" },
          },
        ],
        todoList,
      );

      expect(result.todoList![0].status).toBe("failed");
    });

    it("returns error when no todo list exists", () => {
      const result = processTodoCalls(
        [
          {
            id: "call-1",
            name: "update_todo_status",
            args: { index: 0, status: "completed" },
          },
        ],
        null,
      );

      expect(result.messages[0].content).toContain("no todo list exists");
    });

    it("returns error for negative index", () => {
      const todoList = [
        { id: 0, content: "Step 1", status: "pending" as const },
      ];

      const result = processTodoCalls(
        [
          {
            id: "call-1",
            name: "update_todo_status",
            args: { index: -1, status: "completed" },
          },
        ],
        todoList,
      );

      expect(result.messages[0].content).toContain("out of range");
    });

    it("returns error for out of range index", () => {
      const todoList = [
        { id: 0, content: "Step 1", status: "pending" as const },
      ];

      const result = processTodoCalls(
        [
          {
            id: "call-1",
            name: "update_todo_status",
            args: { index: 5, status: "completed" },
          },
        ],
        todoList,
      );

      expect(result.messages[0].content).toContain("out of range");
    });

    it("returns error for invalid status", () => {
      const todoList = [
        { id: 0, content: "Step 1", status: "pending" as const },
      ];

      const result = processTodoCalls(
        [
          {
            id: "call-1",
            name: "update_todo_status",
            args: { index: 0, status: "invalid" },
          },
        ],
        todoList,
      );

      expect(result.messages[0].content).toContain("invalid status");
      expect(result.todoList![0].status).toBe("pending");
    });

    it("returns error for non-integer index", () => {
      const todoList = [
        { id: 0, content: "Step 1", status: "pending" as const },
      ];

      const result = processTodoCalls(
        [
          {
            id: "call-1",
            name: "update_todo_status",
            args: { index: 1.5, status: "completed" },
          },
        ],
        todoList,
      );

      expect(result.messages[0].content).toContain("out of range");
    });
  });

  describe("mixed calls", () => {
    it("handles create followed by update in batch", () => {
      const result = processTodoCalls(
        [
          {
            id: "call-1",
            name: "create_todo_list",
            args: { items: ["Step 1", "Step 2"] },
          },
          {
            id: "call-2",
            name: "update_todo_status",
            args: { index: 0, status: "completed" },
          },
        ],
        null,
      );

      expect(result.todoList).toHaveLength(2);
      expect(result.todoList![0].status).toBe("completed");
      expect(result.todoList![1].status).toBe("pending");
    });
  });
});

describe("formatTodoListForPrompt", () => {
  it("formats items with correct status markers", () => {
    const items = [
      { id: 0, content: "Step 1", status: "completed" as const },
      { id: 1, content: "Step 2", status: "in_progress" as const },
      { id: 2, content: "Step 3", status: "failed" as const },
      { id: 3, content: "Step 4", status: "pending" as const },
    ];

    const result = formatTodoListForPrompt(items);
    expect(result).toBe("[x] Step 1\n[~] Step 2\n[!] Step 3\n[ ] Step 4");
  });
});
