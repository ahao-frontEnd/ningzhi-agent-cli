import { writeFile, mkdir } from "fs/promises";
import { dirname } from "path";
import { resolve, relative, isAbsolute } from "path";

export async function writeFileTool({
  filepath,
  content,
}: {
  filepath: string;
  content: string;
}): Promise<string> {
  console.log(`\n[Tool] writeFile called: "${filepath}"`);

  const cwd = process.cwd();
  const targetPath = resolve(cwd, filepath);

  if (isAbsolute(filepath)) {
    return "Error: absolute paths are not allowed.";
  }

  const rel = relative(cwd, targetPath);
  if (rel.startsWith("..") || rel === "..") {
    return "Error: file must be within the current directory.";
  }

  try {
    await mkdir(dirname(targetPath), { recursive: true }); // recursive 表示创建父目录
    await writeFile(targetPath, content, "utf-8");
    return `File "${filepath}" written successfully.`;
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}
