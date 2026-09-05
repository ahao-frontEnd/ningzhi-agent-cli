import { profileUpdateTool } from "./profile_update_tool";
import { readFile, readdir, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

describe("profileUpdateTool", () => {
  const testDir = join(process.cwd(), "test_profile_update_tool_dir");
  const dataDir = join(testDir, "data");
  const profilePath = join(dataDir, "profile.md");

  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
    jest.spyOn(process, "cwd").mockReturnValue(testDir); // 模拟当前工作目录为测试目录
  });

  afterEach(() => {
    jest.restoreAllMocks(); // 恢复所有模拟函数, 避免影响其他测试
  });

  it("creates profile.md when it does not exist", async () => {
    const content = "# Profile\n\nName: Alice";
    const result = await profileUpdateTool({ profile_info: content });

    expect(result).toContain("Profile updated successfully");
    expect(result).not.toContain("backup created");

    const actual = await readFile(profilePath, "utf-8");
    expect(actual).toBe(content);
  });

  it("updates profile.md and creates a backup when content changes", async () => {
    const oldContent = "# Profile\n\nName: Alice";
    const newContent = "# Profile\n\nName: Alice\nAge: 30";

    await mkdir(dataDir, { recursive: true });
    await writeFile(profilePath, oldContent, "utf-8");

    const result = await profileUpdateTool({ profile_info: newContent });

    expect(result).toContain("Profile updated successfully");
    expect(result).toContain("backup created");

    const actual = await readFile(profilePath, "utf-8");
    expect(actual).toBe(newContent);

    const files = await readdir(dataDir);
    const backups = files.filter(
      (f) =>
        f.startsWith("profile.") && f.endsWith(".md") && f !== "profile.md",
    );
    expect(backups.length).toBe(1);
  });

  it("does nothing when content is identical", async () => {
    const content = "# Profile\n\nName: Alice";

    await mkdir(dataDir, { recursive: true });
    await writeFile(profilePath, content, "utf-8");

    const result = await profileUpdateTool({ profile_info: content });

    expect(result).toBe("Profile is already up to date. No changes made.");

    const files = await readdir(dataDir);
    const backups = files.filter(
      (f) =>
        f.startsWith("profile.") && f.endsWith(".md") && f !== "profile.md",
    );
    expect(backups.length).toBe(0);
  });

  it("returns error for empty profile_info", async () => {
    const result = await profileUpdateTool({ profile_info: "" });
    expect(result).toBe("Error: profile_info is empty.");

    const result2 = await profileUpdateTool({ profile_info: "   " });
    expect(result2).toBe("Error: profile_info is empty.");
  });
});
