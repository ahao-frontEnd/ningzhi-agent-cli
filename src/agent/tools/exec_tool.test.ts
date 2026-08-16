import { execTool } from "./exec_tool";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { platform } from "node:os";

const isWindows = platform() === "win32";

describe("execTool", () => {
  const testDir = join(process.cwd(), "test_exec_tool_dir");

  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("executes a simple echo command", async () => {
    const result = await execTool({ command: "echo hello" });
    expect(result.trim()).toBe("hello");
  });

  it("executes a command with arguments", async () => {
    const result = await execTool({ command: "echo hello world" });
    expect(result.trim()).toBe("hello world");
  });

  it("reads a file with cat", async () => {
    const filepath = join("test_exec_tool_dir", "sample.txt");
    await writeFile(join(process.cwd(), filepath), "sample content", "utf-8");

    const cmd = isWindows ? `type ${filepath}` : `cat ${filepath}`;
    const result = await execTool({ command: cmd });
    expect(result.trim()).toContain("sample content");
  });

  it("lists files in current directory", async () => {
    const result = await execTool({ command: "ls" });
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns error for empty command", async () => {
    const result = await execTool({ command: "" });
    expect(result).toBe("Error: command is empty.");
  });

  it("returns error for rm command", async () => {
    const result = await execTool({
      command: "rm test_exec_tool_dir/sample.txt",
    });
    expect(result).toBe('Error: command "rm" is not allowed.');
  });

  it("returns error for rmdir command", async () => {
    const result = await execTool({ command: "rmdir test_exec_tool_dir" });
    expect(result).toBe('Error: command "rmdir" is not allowed.');
  });

  it("returns error for parent directory reference", async () => {
    const result = await execTool({ command: "cat ../package.json" });
    expect(result).toBe(
      "Error: parent directory references (..) are not allowed.",
    );
  });

  it("returns error for absolute path in arguments", async () => {
    const result = await execTool({ command: "cat /etc/passwd" });
    expect(result).toBe('Error: absolute paths are not allowed: "/etc/passwd"');
  });

  it("returns error for command with exit code != 0", async () => {
    const result = await execTool({
      command: "cat nonexistent_file_12345.txt",
    });
    expect(result).toContain("Error:");
  });
});
