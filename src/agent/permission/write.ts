import { isDangerousPath } from "./is-dangerous-path";
import { isInProjectDir } from "./util";

export function checkWritePermission(toolCall: {
  name: string;
  args: Record<string, any>;
}):
  | { action: "allow" }
  | { action: "block"; reason: string }
  | { action: "confirm" } {
  const filepath = toolCall.args?.filepath;
  if (filepath == null) {
    return { action: "allow" };
  }

  if (isDangerousPath(filepath)) {
    return {
      action: "block",
      reason: `路径 "${filepath}" 是系统敏感目录，为保护系统安全，禁止访问。如有需要请手动操作。`,
    };
  }

  if (isInProjectDir(filepath)) {
    return { action: "allow" };
  }

  return { action: "confirm" };
}
