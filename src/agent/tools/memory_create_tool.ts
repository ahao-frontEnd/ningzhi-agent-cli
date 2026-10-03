import Database from "better-sqlite3";
import { DB_PATH } from "../db";
import { invalidateMemoryCache } from "../prompt";

const VALID_TYPES = ["fact", "event", "preference", "skill"];

export async function memoryCreateTool(
  {
    type,
    content,
    keywords,
    importance,
  }: {
    type: string;
    content: string;
    keywords?: string[];
    importance?: number;
  },
  config?: any,
): Promise<string> {
  if (!VALID_TYPES.includes(type)) {
    return `Error: type must be one of ${VALID_TYPES.join(", ")}.`;
  }

  const trimmed = content?.trim();
  if (!trimmed) {
    return "Error: content is required.";
  }

  const importanceValue = importance ?? 3;
  if (importanceValue < 1 || importanceValue > 5) {
    return "Error: importance must be between 1 and 5.";
  }

  const sessionId = config?.configurable?.thread_id ?? "default-session";
  const keywordsJson =
    keywords && keywords.length > 0 ? JSON.stringify(keywords) : null;

  const db = new Database(DB_PATH);
  try {
    // stmt指的是预处理语句（prepared statement）。预处理语句是一种数据库功能，允许开发者编写一次SQL语句，然后多次执行，只需传递不同的参数。
    // 这种方法提高了性能，因为SQL语句只解析一次，而不是每次执行时都解析，同时也减少了网络通信量
    const stmt = db.prepare(
      `INSERT INTO memory (type, content, keywords, importance, session_id)
       VALUES (?, ?, ?, ?, ?)`,
    );
    stmt.run(type, trimmed, keywordsJson, importanceValue, sessionId);
    // 清空长期记忆缓存
    invalidateMemoryCache();
    return "Memory saved successfully.";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  } finally {
    db.close();
  }
}
