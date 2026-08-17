import { runJsTool } from "./run_js_tool";

describe("runJsTool", () => {
  it("executes simple javascript code", async () => {
    const result = await runJsTool({ code: "console.log(2 + 2)" });
    expect(result.trim()).toBe("4");
  });

  it("executes multiline javascript code", async () => {
    const result = await runJsTool({
      code: "const x = 10; const y = 20; console.log(x * y)",
    });
    expect(result.trim()).toBe("200");
  });

  it("returns success message when there is no output", async () => {
    const result = await runJsTool({ code: "const a = 1 + 1" });
    expect(result).toBe("Code executed successfully with no output.");
  });

  it("returns error for empty code", async () => {
    const result = await runJsTool({ code: "" });
    expect(result).toBe("Error: code is empty.");
  });

  it("returns error for code with only whitespace", async () => {
    const result = await runJsTool({ code: "   \n\t  " });
    expect(result).toBe("Error: code is empty.");
  });

  it("returns error for code with syntax error", async () => {
    const result = await runJsTool({ code: "console.log(" });
    expect(result).toContain("Error:");
  });

  it("returns error for code that throws an exception", async () => {
    const result = await runJsTool({ code: 'throw new Error("test error")' });
    expect(result).toContain("Error:");
  });

  it("handles code with special characters safely", async () => {
    const result = await runJsTool({ code: `console.log("hello 'world'")` });
    expect(result.trim()).toBe("hello 'world'");
  });

  it("handles code with backticks safely", async () => {
    const result = await runJsTool({ code: "console.log(`result: ${3 + 4}`)" });
    expect(result.trim()).toBe("result: 7");
  });
});
