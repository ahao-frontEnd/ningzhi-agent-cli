import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export async function writeFileTool({
  filepath,
  content,
}: {
  filepath: string;
  content: string;
}): Promise<string> {
  try {
    await mkdir(dirname(filepath), { recursive: true }); // recursive 表示创建父目录, 如果没有的话, 则创建
    await writeFile(filepath, content, "utf-8");
    return `File "${filepath}" written successfully.`;
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}
