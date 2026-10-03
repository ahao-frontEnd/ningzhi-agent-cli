import { ToolMessage } from "@langchain/core/messages";

export interface TodoItem {
  id: number;
  content: string;
  status: "pending" | "in_progress" | "completed" | "failed";
}

interface TodoCall {
  id?: string;
  name: string;
  args: Record<string, any>;
}

export function processTodoCalls(
  calls: TodoCall[],
  currentTodoList: TodoItem[] | null,
): { messages: ToolMessage[]; todoList: TodoItem[] | null } {
  const messages: ToolMessage[] = [];
  let todoList = currentTodoList;

  for (const call of calls) {
    // 1. 创建待办事项列表
    if (call.name === "create_todo_list") {
      const items = call.args.items;
      if (!Array.isArray(items) || items.length === 0) {
        messages.push(
          new ToolMessage({
            content: "Error: items must be a non-empty array.",
            tool_call_id: call.id ?? "",
            name: call.name,
          }),
        );
        continue;
      }

      todoList = items.map((content: string, i: number) => ({
        id: i,
        content: typeof content === "string" ? content.trim() : String(content),
        status: "pending" as const,
      }));

      messages.push(
        new ToolMessage({
          content: "Todo list created successfully.",
          tool_call_id: call.id ?? "",
          name: call.name,
        }),
      );
    }

    // 2. 更新待办事项状态
    if (call.name === "update_todo_status") {
      const index = call.args.index;
      const status = call.args.status;

      if (!todoList) {
        messages.push(
          new ToolMessage({
            content: "Error: no todo list exists.",
            tool_call_id: call.id ?? "",
            name: call.name,
          }),
        );
        continue;
      }

      if (
        typeof index !== "number" ||
        !Number.isInteger(index) ||
        index < 0 ||
        index >= todoList.length
      ) {
        messages.push(
          new ToolMessage({
            content: `Error: index ${index} is out of range.`,
            tool_call_id: call.id ?? "",
            name: call.name,
          }),
        );
        continue;
      }

      const validStatuses: TodoItem["status"][] = [
        "pending",
        "in_progress",
        "completed",
        "failed",
      ];
      if (!validStatuses.includes(status)) {
        messages.push(
          new ToolMessage({
            content: `Error: invalid status "${status}".`,
            tool_call_id: call.id ?? "",
            name: call.name,
          }),
        );
        continue;
      }

      todoList[index].status = status;
      messages.push(
        new ToolMessage({
          content: `Todo item ${index} updated to ${status}.`,
          tool_call_id: call.id ?? "",
          name: call.name,
        }),
      );
    }
  }

  return { messages, todoList };
}

/**
 *
 * 格式化待办事项列表，用于系统提示词。
 * @param items 待办事项列表。
 * @returns 格式化后的待办事项列表字符串。
 */
export function formatTodoListForPrompt(items: TodoItem[]): string {
  return items
    .map((item) => {
      const statusMark =
        item.status === "completed"
          ? "[x]"
          : item.status === "in_progress"
            ? "[~]"
            : item.status === "failed"
              ? "[!]"
              : "[ ]";
      return `${statusMark} ${item.content}`;
    })
    .join("\n");
}
