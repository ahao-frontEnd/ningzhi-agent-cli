import { writeFile, readFile, mkdir, copyFile } from "node:fs/promises";
import { resolve } from "node:path";

const PROFILE_PATH = "./.data/profile.md";
const PROFILE_DIR = "./.data";

function generateBackupFilename(): string {
  const dt = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `profile.${dt}-${random}.md`;
}

export async function profileUpdateTool({
  profile_info,
}: {
  profile_info: string;
}): Promise<string> {
  if (!profile_info || profile_info.trim().length === 0) {
    return "Error: profile_info is empty.";
  }

  const cwd = process.cwd();
  const targetPath = resolve(cwd, PROFILE_PATH);
  const dirPath = resolve(cwd, PROFILE_DIR);

  try {
    let existingContent = "";
    let fileExists = false;

    try {
      existingContent = await readFile(targetPath, "utf-8");
      fileExists = true;
    } catch (err: any) {
      if (err.code !== "ENOENT") {
        return `Error reading existing profile: ${err.message}`;
      }
    }

    const normalizedNew = profile_info.trim();
    const normalizedExisting = existingContent.trim();

    if (fileExists && normalizedNew === normalizedExisting) {
      return "Profile is already up to date. No changes made.";
    }

    await mkdir(dirPath, { recursive: true }); // 幂等 递归创建目录

    if (fileExists) {
      const backupFilename = generateBackupFilename();
      const backupPath = resolve(dirPath, backupFilename);
      // 备份
      await copyFile(targetPath, backupPath);
    }

    // 更新 profile.md 文件
    await writeFile(targetPath, profile_info, "utf-8");

    return `Profile updated successfully. File: ${PROFILE_PATH}${fileExists ? " (backup created)" : ""}`;
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}
