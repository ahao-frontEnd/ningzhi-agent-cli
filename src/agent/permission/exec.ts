import {
  isChangingDirectory,
  isScriptExecution,
  isDangerousOperation,
  isSafeCommand,
} from "./util";

type checkExecPermissionReturnType =
  | { action: "allow" }
  | { action: "block"; reason: string }
  | { action: "confirm" };

interface IToolCall {
  name: string;
  args: Record<string, any>;
}

export function checkExecPermission(
  toolCall: IToolCall,
): checkExecPermissionReturnType {
  const command = toolCall.args?.command;
  if (typeof command !== "string") {
    return { action: "confirm" };
  }

  if (isSafeCommand(command)) {
    return { action: "allow" };
  }

  // 检查命令是否包含切换目录操作
  if (isChangingDirectory(command)) {
    return {
      action: "block",
      reason: `命令包含切换目录操作，为防止目录逃逸，禁止执行。如有需要请手动操作。`,
    };
  }

  const scriptCheck = isScriptExecution(command);
  if (scriptCheck.blocked) {
    return {
      action: "block",
      reason: scriptCheck.reason!,
    };
  }

  const dangerCheck = isDangerousOperation(command);
  if (dangerCheck.blocked) {
    return {
      action: "block",
      reason: dangerCheck.reason!,
    };
  }

  return { action: "confirm" };
}
