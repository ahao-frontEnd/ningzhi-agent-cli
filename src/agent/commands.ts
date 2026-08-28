import { randomUUID } from "node:crypto";
import Table from "cli-table3";
import { color } from "./colors";
import { listRecentSessions, threadIdExists } from "./db";

export let threadId: string = randomUUID();

export interface ChatCommand {
  name: string;
  description: string;
  execute(args: string[]): void | Promise<void>;
}

export const commands = new Map<string, ChatCommand>();

commands.set("new", {
  name: "new",
  description: "Start a new chat session",
  execute() {
    threadId = randomUUID();
    console.log(color.goodbye(`\nNew session started ${threadId}.\n`));
  },
});

commands.set("sessions", {
  name: "sessions",
  description: "List recent chat sessions",
  execute() {
    const sessions = listRecentSessions();
    if (sessions.length === 0) {
      console.log("\n暂无聊天记录\n");
      return;
    }

    const table = new Table({
      head: ["thread_id", "最后用户输入的问题", "时间"],
    });
    for (const s of sessions) {
      table.push([s.thread_id, s.last_question, s.last_ts]);
    }
    console.log("\n" + table.toString() + "\n");
  },
});

commands.set("rewind", {
  name: "rewind",
  description: "Restore a chat session by thread_id",
  execute(args: string[]) {
    const id = args[0];
    if (!id) {
      console.log(
        color.error(
          "\nError: please provide a thread_id. Usage: /rewind <thread_id>\n",
        ),
      );
      return;
    }

    if (!threadIdExists(id)) {
      console.log(color.error(`\nError: thread_id "${id}" not found.\n`));
      return;
    }

    threadId = id;
    console.log(color.goodbye(`\nRestored session ${threadId}.\n`));
  },
});
