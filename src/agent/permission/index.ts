import path from "path";
import { isDangerousPath } from "./is-dangerous-path";

function isInProjectDir(filepath: string): boolean {
  const resolved = path.resolve(filepath);
  const cwd = path.resolve(process.cwd());
  return resolved === cwd || resolved.startsWith(cwd + path.sep);
}

export function checkToolPermission(
  toolCall: { name: string; args: Record<string, any> },
  tool: { permission_level?: string },
):
  | { action: "allow" }
  | { action: "block"; reason: string }
  | { action: "confirm" } {
  const level = tool.permission_level;
  if (level !== "read" && level !== "write") {
    return { action: "confirm" };
  }

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
