import path from "node:path";

export function isInProjectDir(filepath: string): boolean {
  const resolved = path.resolve(filepath);
  const cwd = path.resolve(process.cwd());
  return resolved === cwd || resolved.startsWith(cwd + path.sep);
}
