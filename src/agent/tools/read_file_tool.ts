import { readFile } from 'fs/promises'
import { resolve, relative, isAbsolute } from 'path'
import { formatToolLog } from "../colors";

export async function readFileTool({ filepath }: { filepath: string }): Promise<string> {
  console.log(formatToolLog("read_file", `"${filepath}"`));

  const cwd = process.cwd()
  const targetPath = resolve(cwd, filepath)

  if (isAbsolute(filepath)) {
    return 'Error: absolute paths are not allowed.'
  }

  const rel = relative(cwd, targetPath)
  if (rel.startsWith('..') || rel === '..') {
    return 'Error: file must be within the current directory.'
  }

  try {
    const content = await readFile(targetPath, 'utf-8')
    return content
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return 'Error: file not found.'
    }
    return `Error: ${(err as Error).message}`
  }
}