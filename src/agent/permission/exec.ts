import { isChangingDirectory } from "./util";

export function checkExecPermission(toolCall: {
  name: string;
  args: Record<string, any>;
}): { action: "block"; reason: string } | { action: "confirm" } {
  const command = toolCall.args?.command;
  if (typeof command !== "string") {
    return { action: "confirm" };
  }

  // 检查命令是否包含切换目录操作
  if (isChangingDirectory(command)) {
    return {
      action: "block",
      reason: `命令包含切换目录操作，为防止目录逃逸，禁止执行。如有需要请手动操作。`,
    };
  }

  return { action: "confirm" };
}
