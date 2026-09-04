import { memoryRetrieveTool } from "./memory_retrieve_tool";
import { memoryCreateTool } from "./memory_create_tool";
import { initDb, DB_PATH } from "../db";
import Database from "better-sqlite3";

describe("memoryRetrieveTool", () => {
  beforeAll(() => {
    initDb();
  });

  afterEach(() => {
    const db = new Database(DB_PATH);
    try {
      db.prepare("DELETE FROM memory WHERE content LIKE 'test-%'").run();
    } finally {
      db.close();
    }
  });

  it("returns error for empty query", async () => {
    const result = await memoryRetrieveTool({ query: [] });
    expect(result).toBe("Error: query is required.");
  });

  it("returns error for out-of-range limit", async () => {
    const result = await memoryRetrieveTool({ query: ["test"], limit: 0 });
    expect(result).toBe("Error: limit must be between 1 and 50.");
  });

  it("returns no memories found when there are no matches", async () => {
    const result = await memoryRetrieveTool({
      query: ["nonexistent-keyword-xyz"],
    });
    expect(result).toBe("No relevant memories found.");
  });

  it("retrieves a matching memory by content", async () => {
    await memoryCreateTool(
      {
        type: "fact",
        content: "test-programming-language",
        keywords: ["编程", "代码"],
        importance: 5,
      },
      { configurable: { thread_id: "test-thread" } },
    );

    const result = await memoryRetrieveTool({ query: ["编程"] });
    expect(result).not.toBe("No relevant memories found.");

    const parsed = JSON.parse(result);
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed[0].content).toBe("test-programming-language");
    expect(parsed[0].final_score).toBeDefined();
  });

  it("retrieves a matching memory by keywords", async () => {
    await memoryCreateTool(
      {
        type: "skill",
        content: "test-debugging-skill",
        keywords: ["调试", "bug"],
        importance: 4,
      },
      undefined,
    );

    const result = await memoryRetrieveTool({ query: ["调试"] });
    const parsed = JSON.parse(result);
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed[0].content).toBe("test-debugging-skill");
  });

  it("respects the limit parameter", async () => {
    for (let i = 0; i < 5; i++) {
      await memoryCreateTool(
        {
          type: "fact",
          content: `test-limit-${i}`,
          keywords: ["limit-test"],
        },
        undefined,
      );
    }

    const result = await memoryRetrieveTool({
      query: ["limit-test"],
      limit: 2,
    });
    const parsed = JSON.parse(result);
    expect(parsed.length).toBe(2);
  });
});
