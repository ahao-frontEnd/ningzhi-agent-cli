import { memoryCreateTool } from "./memory_create_tool";
import { initDb, DB_PATH } from "../db";
import Database from "better-sqlite3";

describe("memoryCreateTool", () => {
  beforeAll(() => {
    initDb();
  });

  afterEach(() => {
    const db = new Database(DB_PATH);
    try {
      // 清理测试数据：删除所有以 "test-" 开头的记录
      db.prepare("DELETE FROM memory WHERE content LIKE 'test-%'").run();
    } finally {
      db.close();
    }
  });

  it("saves a memory with all fields", async () => {
    const result = await memoryCreateTool(
      {
        type: "fact",
        content: "test-fact-all-fields",
        keywords: ["test", "fact"],
        importance: 5,
      },
      { configurable: { thread_id: "test-thread" } },
    );
    expect(result).toBe("Memory saved successfully.");

    const db = new Database(DB_PATH);
    try {
      const row = db
        .prepare("SELECT * FROM memory WHERE content = 'test-fact-all-fields'")
        .get() as any;
      expect(row.type).toBe("fact");
      expect(row.content).toBe("test-fact-all-fields");
      expect(JSON.parse(row.keywords)).toEqual(["test", "fact"]);
      expect(row.importance).toBe(5);
      expect(row.session_id).toBe("test-thread");
    } finally {
      db.close();
    }
  });

  it("saves a memory with default importance and no keywords", async () => {
    const result = await memoryCreateTool(
      { type: "preference", content: "test-preference-defaults" },
      { configurable: { thread_id: "test-thread-2" } },
    );
    expect(result).toBe("Memory saved successfully.");

    const db = new Database(DB_PATH);
    try {
      const row = db
        .prepare(
          "SELECT * FROM memory WHERE content = 'test-preference-defaults'",
        )
        .get() as any;
      expect(row.type).toBe("preference");
      expect(row.importance).toBe(3);
      expect(row.keywords).toBeNull();
      expect(row.session_id).toBe("test-thread-2");
    } finally {
      db.close();
    }
  });

  it("trims content", async () => {
    const result = await memoryCreateTool(
      { type: "skill", content: "  test-skill-trim  " },
      undefined,
    );
    expect(result).toBe("Memory saved successfully.");

    const db = new Database(DB_PATH);
    try {
      const row = db
        .prepare("SELECT * FROM memory WHERE content = 'test-skill-trim'")
        .get() as any;
      expect(row.content).toBe("test-skill-trim");
      expect(row.session_id).toBe("default-session");
    } finally {
      db.close();
    }
  });

  it("returns error for invalid type", async () => {
    const result = await memoryCreateTool({ type: "invalid", content: "test" });
    expect(result).toBe(
      "Error: type must be one of fact, event, preference, skill.",
    );
  });

  it("returns error for empty content", async () => {
    const result = await memoryCreateTool({ type: "fact", content: "" });
    expect(result).toBe("Error: content is required.");
  });

  it("returns error for out-of-range importance", async () => {
    const result = await memoryCreateTool({
      type: "fact",
      content: "test",
      importance: 6,
    });
    expect(result).toBe("Error: importance must be between 1 and 5.");
  });
});
