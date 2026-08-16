import { writeFileTool } from "./write_file_tool";
import { readFile, rm, mkdir } from "fs/promises";
import { join } from "path";

describe("writeFileTool", () => {
  const testDir = join(process.cwd(), "test_write_file_tool_dir");

  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("writes a file in the current directory", async () => {
    const filepath = join("test_write_file_tool_dir", "hello.txt");
    const result = await writeFileTool({ filepath, content: "hello world" });

    expect(result).toBe(`File "${filepath}" written successfully.`);

    const actual = await readFile(join(process.cwd(), filepath), "utf-8");
    expect(actual).toBe("hello world");
  });

  it("overwrites an existing file", async () => {
    const filepath = join("test_write_file_tool_dir", "overwrite.txt");
    const result = await writeFileTool({ filepath, content: "new content" });

    expect(result).toBe(`File "${filepath}" written successfully.`);

    const actual = await readFile(join(process.cwd(), filepath), "utf-8");
    expect(actual).toBe("new content");
  });

  it("creates nested directories", async () => {
    const filepath = join(
      "test_write_file_tool_dir",
      "nested",
      "deep",
      "file.txt",
    );
    const result = await writeFileTool({ filepath, content: "nested content" });

    expect(result).toBe(`File "${filepath}" written successfully.`);

    const actual = await readFile(join(process.cwd(), filepath), "utf-8");
    expect(actual).toBe("nested content");
  });

  it("returns error for absolute path", async () => {
    const result = await writeFileTool({
      filepath: "/etc/passwd",
      content: "x",
    });
    expect(result).toBe("Error: absolute paths are not allowed.");
  });

  it("returns error for path outside current directory", async () => {
    const result = await writeFileTool({
      filepath: "../package.json",
      content: "x",
    });
    expect(result).toBe("Error: file must be within the current directory.");
  });
});
