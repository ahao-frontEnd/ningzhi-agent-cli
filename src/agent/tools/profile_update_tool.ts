import { writeFile, readFile, mkdir, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { homedir } from "node:os";

function getProfilePaths() {
  const dir = resolve(homedir(), ".ningzhiAgentCli", ".data");
  return { dir, path: resolve(dir, "profile.md") };
}

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

  const { dir: profileDir, path: profilePath } = getProfilePaths();

  try {
    let existingContent = "";
    let fileExists = false;

    try {
      existingContent = await readFile(profilePath, "utf-8");
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

    await mkdir(profileDir, { recursive: true }); // 幂等 递归创建目录

    if (fileExists) {
      const backupFilename = generateBackupFilename();
      const backupPath = resolve(profileDir, backupFilename);
      await copyFile(profilePath, backupPath);
    }

    // 更新 profile.md 文件
    await writeFile(profilePath, profile_info, "utf-8");

    return `Profile updated successfully. File: ${profilePath}${fileExists ? " (backup created)" : ""}`;
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}
