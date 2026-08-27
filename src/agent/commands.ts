import { randomUUID } from "node:crypto";
import { color } from "./colors";

export let threadId = randomUUID();

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
