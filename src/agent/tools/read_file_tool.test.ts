import { readFileTool } from "./read_file_tool";
import { writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";

describe("readFileTool", () => {
  const testDir = join(process.cwd(), "test_read_file_tool_dir");

  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("reads a file in the current directory", async () => {
    const filepath = join("test_read_file_tool_dir", "hello.txt");
    await writeFile(join(process.cwd(), filepath), "hello world", "utf-8");

    const result = await readFileTool({ filepath });
    expect(result).toBe("hello world");
  });

  it("returns error for absolute path", async () => {
    const result = await readFileTool({ filepath: "/etc/passwd" });
    expect(result).toBe("Error: absolute paths are not allowed.");
  });

  it("returns error for path outside current directory", async () => {
    const result = await readFileTool({ filepath: "../package.json" });
    expect(result).toBe("Error: file must be within the current directory.");
  });

  it("returns error for non-existent file", async () => {
    const result = await readFileTool({ filepath: "does_not_exist.txt" });
    expect(result).toBe("Error: file not found.");
  });
});
