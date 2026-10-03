import Database from "better-sqlite3";
import { DB_PATH } from "../db";
import { invalidateMemoryCache } from "../prompt";

export async function memoryDeleteTool(
  {
    id,
  }: {
    id: number;
  },
  _config?: any,
): Promise<string> {
  if (!Number.isFinite(id) || id <= 0) {
    return "Error: id must be a positive integer.";
  }

  const db = new Database(DB_PATH);
  try {
    const existing = db.prepare("SELECT 1 FROM memory WHERE id = ?").get(id);
    if (!existing) {
      return `Error: no memory found with id ${id}.`;
    }

    db.prepare("DELETE FROM memory WHERE id = ?").run(id);
    // 清空长期记忆缓存
    invalidateMemoryCache();
    return `Memory ${id} deleted successfully.`;
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  } finally {
    db.close();
  }
}
