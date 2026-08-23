import { exec } from "node:child_process";
import { promisify } from "node:util";

// 将 exec 转为 Promise 形式,便于用 await 调用
const execAsync = promisify(exec);

export async function runPyTool({ code }: { code: string }): Promise<string> {
  console.log(`\n[Tool] run_py called`);

  // 去除首尾空白,若代码为空直接返回错误
  const trimmed = code.trim();
  if (!trimmed) {
    return "Error: code is empty.";
  }

  // 提前检测 python3 是否可用,避免后续执行时报错难以定位
  try {
    await execAsync("python3 --version", { timeout: 5000 });
  } catch {
    return "Error: Python3 is not installed on this system. Please install Python3 to execute Python code.";
  }

  // 将代码转成 base64,再在 Python 端解码执行
  // 这样做是为了绕过 shell 对引号、换行、特殊字符的转义问题
  const base64Code = Buffer.from(trimmed).toString("base64");
  const command = `python3 -c "import base64; exec(base64.b64decode('${base64Code}').decode('utf-8'))"`;

  try {
    // 执行 Python 命令,设置工作目录和超时时间
    const { stdout, stderr } = await execAsync(command, {
      cwd: process.cwd(), // 以当前进程目录为 Python 执行目录,保证相对路径一致
      timeout: 30000, // 30 秒超时,防止死循环或长时间阻塞
    });
    // 优先返回 stdout,其次 stderr,都没有则返回成功提示
    return stdout || stderr || "Code executed successfully with no output.";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}
