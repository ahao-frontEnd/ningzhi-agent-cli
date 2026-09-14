import { isDangerousPath } from "./is-dangerous-path";

export function checkReadPermission(toolCall: {
  name: string;
  args: Record<string, any>;
}): { action: "allow" } | { action: "block"; reason: string } {
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

  return { action: "allow" };
}
