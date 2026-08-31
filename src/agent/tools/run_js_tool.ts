import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export async function runJsTool({ code }: { code: string }): Promise<string> {
  const trimmed = code.trim();
  if (!trimmed) {
    return "Error: code is empty.";
  }

  try {
    await execAsync("node --version", { timeout: 5000 });
  } catch {
    return "Error: Node.js is not installed on this system. Please install Node.js to execute JavaScript code.";
  }

  // 将源码转成 base64 再嵌入命令，避免源码中的引号、换行、$、反引号等字符破坏 shell 命令结构
  const base64Code = Buffer.from(trimmed).toString("base64");
  // 用 node -e 执行一段 JS：在子进程里把 base64 解码回原始代码，再 eval 执行
  const command = `node -e "eval(Buffer.from('${base64Code}', 'base64').toString('utf-8'))"`;

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: process.cwd(),
      timeout: 30000,
      encoding: "utf8",
    });

    // 全面清理子进程输出中的脏字符（兼容 MINGW64/Git Bash、cmd.exe GBK、ANSICON 等多种环境）
    // 1. 去 ANSI 转义序列（颜色、光标控制等，Git Bash 常见）
    // 2. 去 BOM、零宽字符、方向控制、替换符等 Unicode 格式字符
    // 3. 去 ASCII 控制字符（0x00-0x1F），保留换行\n、制表符\t；并把孤立的 \r 回车符删掉
    // 4. 把连续多个换行折叠成单个（避免 cmd/bash 追加的额外空行）
    const clean = (s: string) =>
      s
        .replace(/\x1B\[[0-9;?]*[A-Za-z]/g, "")
        .replace(/\uFEFF|[\u200B-\u200D\u200E\u200F\uFFFD]/g, "")
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]|\r/g, "")
        .replace(/\n{2,}/g, "\n");

    const cleanedStdout = clean(stdout || "").trim();
    const cleanedStderr = clean(stderr || "").trim();

    return (
      cleanedStdout ||
      cleanedStderr ||
      "Code executed successfully with no output."
    );
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}
