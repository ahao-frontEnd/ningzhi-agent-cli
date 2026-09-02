import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { formatRelativeTime, truncate } from "./utils";

export const DB_PATH = join(process.cwd(), ".dbData", "checkpointer.db");

// recursive 多层路径创建，且目录已存在不报错，幂等性
mkdirSync(dirname(DB_PATH), { recursive: true });

export interface SessionRow {
  thread_id: string;
  last_question: string;
  last_ts: string;
}

export function threadIdExists(threadId: string): boolean {
  const db = new Database(DB_PATH);
  try {
    const row = db
      .prepare(
        `
      SELECT 1 FROM checkpoints WHERE thread_id = ? LIMIT 1
    `,
      )
      .get(threadId);
    return !!row;
  } finally {
    db.close();
  }
}

export function initDb(): void {
  const db = new Database(DB_PATH);
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        keywords TEXT, 
        importance INTEGER DEFAULT 3,
        session_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } finally {
    db.close();
  }
}

/**
 * 列出最近 20 个会话（线程）
 * @returns 会话列表
 */
export function listRecentSessions(): SessionRow[] {
  const db = new Database(DB_PATH);
  try {
    // 查询最近 20 个会话（线程）：取每个线程的最后活跃时间，以及最近一条用户提问
    const rows = db
      .prepare(
        `
      -- CTE：按线程分组，取每个线程 checkpoint 中最新的事件时间（$.ts）
      WITH thread_last_ts AS (
        SELECT
          thread_id,
          MAX(json_extract(CAST(checkpoint AS TEXT), '$.ts')) AS last_ts
        FROM checkpoints
        GROUP BY thread_id
      )
      SELECT
        t.thread_id,
        -- 子查询：取该线程 messages 通道中最近一条 user 消息的内容作为"最后提问"
        (SELECT json_extract(CAST(w.value AS TEXT), '$[0].content')
         FROM writes w
         WHERE w.thread_id = t.thread_id
           AND w.channel = 'messages'
           AND json_extract(CAST(w.value AS TEXT), '$[0].role') = 'user'
         ORDER BY w.checkpoint_id DESC
         LIMIT 1) AS last_question,
        t.last_ts
      FROM thread_last_ts t
      ORDER BY t.last_ts DESC  -- 按最后活跃时间倒序（最新的在前）
      LIMIT 20                 -- 只取最近 20 个会话
    `,
      )
      .all() as Array<{
      thread_id: string;
      last_question: string | null;
      last_ts: string;
    }>;

    return rows.map((r) => ({
      thread_id: r.thread_id,
      last_question: truncate(r.last_question, 50),
      last_ts: formatRelativeTime(r.last_ts),
    }));
  } finally {
    db.close();
  }
}
