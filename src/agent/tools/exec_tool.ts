import { exec } from "node:child_process";
import { promisify } from "node:util";
import { formatToolLog } from "../colors";

const execAsync = promisify(exec);

const DANGEROUS_COMMANDS = [
  "rm",
  "rmdir",
  "del",
  "rd",
  "mkfs",
  "dd",
  "format",
  "shred",
];

export async function execTool({
  command,
}: {
  command: string;
}): Promise<string> {
  console.log(formatToolLog("exec", `"${command}"`));

  const trimmed = command.trim();
  if (!trimmed) {
    return "Error: command is empty.";
  }

  // 提取命令的第一个单词（命令名），用于与危险命令黑名单比对；统一转小写以做大小写无关匹配
  // /\s+/ 按空白符拆分命令字符串
  const firstWord = trimmed.split(/\s+/)[0].toLowerCase();
  if (DANGEROUS_COMMANDS.includes(firstWord)) {
    return `Error: command "${firstWord}" is not allowed.`;
  }

  if (trimmed.includes("..")) {
    return "Error: parent directory references (..) are not allowed.";
  }

  const spaceIdx = trimmed.indexOf(" ");
  const args = spaceIdx > 0 ? trimmed.slice(spaceIdx) : "";
  // 在命令参数中查找 Unix 风格的绝对路径（以 / 开头），禁止使用绝对路径以限制文件访问范围
  // (?:^|\s) 匹配行首或空白符位置，(\/[^ ]+) 捕获以 / 开头、不含空格的路径
  const absolutePathMatch = args.match(/(?:^|\s)(\/[^ ]+)/);
  if (absolutePathMatch) {
    return `Error: absolute paths are not allowed: "${absolutePathMatch[1]}"`;
  }

  try {
    const { stdout, stderr } = await execAsync(trimmed, {
      cwd: process.cwd(),
      timeout: 30000,
    });
    return stdout || stderr || "Command executed successfully with no output.";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}
