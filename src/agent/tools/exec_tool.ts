import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export async function execTool({
  command,
}: {
  command: string;
}): Promise<string> {
  const trimmed = command.trim();
  if (!trimmed) {
    return "Error: command is empty.";
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
