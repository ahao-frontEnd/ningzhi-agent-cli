import { readFile } from "node:fs/promises";

export async function readFileTool({
  filepath,
}: {
  filepath: string;
}): Promise<string> {
  try {
    const content = await readFile(filepath, "utf-8");
    return content;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return "Error: file not found.";
    }
    return `Error: ${(err as Error).message}`;
  }
}
