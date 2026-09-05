import { memoryDeleteTool } from "./memory_delete_tool";
import { memoryCreateTool } from "./memory_create_tool";
import { initDb, DB_PATH } from "../db";
import Database from "better-sqlite3";

describe("memoryDeleteTool", () => {
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

  it("deletes an existing memory", async () => {
    await memoryCreateTool(
      { type: "fact", content: "test-delete-target" },
      undefined,
    );

    const db = new Database(DB_PATH);
    let rowId: number;
    try {
      const row = db
        .prepare("SELECT id FROM memory WHERE content = 'test-delete-target'")
        .get() as any;
      rowId = row.id;
    } finally {
      db.close();
    }

    const result = await memoryDeleteTool({ id: rowId });
    expect(result).toBe(`Memory ${rowId} deleted successfully.`);

    const db2 = new Database(DB_PATH);
    try {
      const row = db2.prepare("SELECT 1 FROM memory WHERE id = ?").get(rowId);
      expect(row).toBeUndefined();
    } finally {
      db2.close();
    }
  });

  it("returns error for non-existent id", async () => {
    const result = await memoryDeleteTool({ id: 999999 });
    expect(result).toBe("Error: no memory found with id 999999.");
  });

  it("returns error for invalid id", async () => {
    const result = await memoryDeleteTool({ id: -1 });
    expect(result).toBe("Error: id must be a positive integer.");
  });
});
