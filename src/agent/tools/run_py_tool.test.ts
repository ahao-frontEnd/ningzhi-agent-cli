import { runPyTool } from "./run_py_tool";

describe("runPyTool", () => {
  it("executes simple python code", async () => {
    const result = await runPyTool({ code: "print(2 + 2)" });
    expect(result.trim()).toBe("4");
  });

  it("executes multiline python code", async () => {
    const result = await runPyTool({ code: "x = 10\ny = 20\nprint(x * y)" });
    expect(result.trim()).toBe("200");
  });

  it("returns success message when there is no output", async () => {
    const result = await runPyTool({ code: "a = 1 + 1" });
    expect(result).toBe("Code executed successfully with no output.");
  });

  it("returns error for empty code", async () => {
    const result = await runPyTool({ code: "" });
    expect(result).toBe("Error: code is empty.");
  });

  it("returns error for code with only whitespace", async () => {
    const result = await runPyTool({ code: "   \n\t  " });
    expect(result).toBe("Error: code is empty.");
  });

  it("returns error for code with syntax error", async () => {
    const result = await runPyTool({ code: "print(" });
    expect(result).toContain("Error:");
  });

  it("returns error for code that throws an exception", async () => {
    const result = await runPyTool({ code: 'raise Exception("test error")' });
    expect(result).toContain("Error:");
  });

  it("handles code with special characters safely", async () => {
    const result = await runPyTool({ code: `print("hello 'world'")` });
    expect(result.trim()).toBe("hello 'world'");
  });

  it("handles code with triple quotes safely", async () => {
    const result = await runPyTool({ code: `print('''result: ${3 + 4}''')` });
    expect(result.trim()).toBe("result: 7");
  });
});
